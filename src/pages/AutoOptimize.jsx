import { useState } from 'react';
import { Card, PageHeader, Button, Check, Badge, Callout, Loading, Empty, confirm } from '../ui';
import Icon from '../icons';
import { call, callQuiet, toast } from '../lib';
import { RebootBanner } from './Tweaks';

const RISK = { caution: ['warn', 'Cautela'], risky: ['danger', 'Arriscado'] };

export default function AutoOptimize({ go }) {
  const [res, setRes] = useState(null);
  const [status, setStatus] = useState({});
  const [sel, setSel] = useState({});
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState(null);
  const [showSkip, setShowSkip] = useState(false);

  async function analyze() {
    setBusy('analyze'); setDone(null);
    try {
      const [r, st] = await Promise.all([call('advisor.analyze'), callQuiet('tweaks.status').catch(() => ({}))]);
      setRes(r); setStatus(st || {});
      setSel(Object.fromEntries(r.plan.filter((p) => p.action === 'apply' && !(st || {})[p.id]).map((p) => [p.id, true])));
    } catch {} finally { setBusy(''); }
  }
  const chosen = res ? res.plan.filter((p) => sel[p.id] && !status[p.id]) : [];
  async function apply() {
    const caution = chosen.filter((p) => p.risk !== 'safe' || p.noUndo);
    if (!(await confirm({ title: `Aplicar ${chosen.length} ajuste(s)?`, text: 'Um ponto de restauração é criado antes. Todos podem ser desfeitos depois na aba Restaurar' + (chosen.some((p) => p.noUndo) ? ' (exceto os sem desfazer, que dependem do ponto de restauração).' : '.'),
      list: caution.length ? caution.map((p) => `${p.name} — ${p.reason}`) : null, ok: 'Aplicar plano' }))) return;
    setBusy('apply');
    try {
      const r = await call('tweaks.apply', chosen.map((p) => p.id));
      const ok = Object.entries(r).filter(([, v]) => v.ok).map(([id]) => id);
      const fail = Object.entries(r).filter(([, v]) => !v.ok);
      setStatus((s) => ({ ...s, ...Object.fromEntries(ok.map((id) => [id, true])) }));
      setDone({ ok: ok.length, fail, reboot: Object.values(r).some((v) => v.ok && v.reboot) });
      setSel({});
      toast(`${ok.length} de ${chosen.length} ajustes aplicados.`, fail.length ? 'warn' : 'ok');
    } catch {} finally { setBusy(''); }
  }

  const group = (action) => (res ? res.plan.filter((p) => p.action === action) : []);
  const Row = ({ p }) => (
    <div className="list-item" style={{ alignItems: 'flex-start' }}>
      {p.action !== 'skip' ? <Check checked={!!sel[p.id] || !!status[p.id]} disabled={!!status[p.id]} onChange={(v) => setSel((s) => ({ ...s, [p.id]: v }))} />
        : <Icon name="x" size={16} style={{ color: 'var(--muted)', marginTop: 2 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <strong style={{ fontSize: 13.5 }}>{p.name}</strong>
          {status[p.id] && <Badge tone="ok" icon="check">já aplicado</Badge>}
          {RISK[p.risk] && <Badge tone={RISK[p.risk][0]}>{RISK[p.risk][1]}</Badge>}
          {p.reboot && <Badge icon="reboot">Reinício</Badge>}
          {p.noUndo && <Badge tone="danger">Sem desfazer</Badge>}
        </div>
        <div className="muted small" style={{ marginTop: 2 }}>{p.reason}</div>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title="Otimização automática" desc="O app lê o seu hardware e sistema e decide, ajuste por ajuste, o que vale a pena para ESTE PC visando desempenho — e explica o porquê de cada decisão."
        actions={<Button variant="primary" icon={res ? 'refresh' : 'search'} loading={busy === 'analyze'} onClick={analyze}>{res ? 'Analisar de novo' : 'Analisar meu PC'}</Button>} />
      {done && done.reboot && <RebootBanner />}
      {done && done.fail.length > 0 && <Callout tone="danger" title={`${done.fail.length} ajuste(s) não foram aplicados`}>{done.fail.map(([id, v]) => <div key={id}>{(res.plan.find((p) => p.id === id) || {}).name}: {v.error}</div>)}</Callout>}

      {!res ? (busy === 'analyze' ? <Loading text="Lendo hardware, discos, anti-cheats e recursos do Windows..." /> : (
        <Card><Empty icon="bolt" title="Clique em &quot;Analisar meu PC&quot;">
          São avaliados: desktop ou notebook, processador (incluindo X3D e híbridos), placa de vídeo, quantidade de RAM, SSD/HD, versão do Windows, anti-cheats instalados (FACEIT, Vanguard...) e uso de virtualização. Nada é alterado até você confirmar.
        </Empty></Card>
      )) : (
        <>
          <Card title="Seu PC" icon="cpu">
            <dl className="kv">
              <dt>Tipo</dt><dd>{res.profile.tipo}</dd>
              <dt>Processador</dt><dd>{res.profile.cpu} {res.profile.x3d && <Badge tone="accent">X3D</Badge>} {res.profile.hybrid && <Badge>P + E cores</Badge>}</dd>
              <dt>Placa de vídeo</dt><dd>{res.profile.gpu}</dd>
              <dt>Memória</dt><dd>{res.profile.ram}</dd>
              <dt>Discos</dt><dd>{res.profile.disco}</dd>
              <dt>Sistema</dt><dd>{res.profile.os}</dd>
              <dt>Anti-cheats</dt><dd>{res.profile.anticheats.join(', ') || 'nenhum de kernel detectado'}</dd>
              <dt>Virtualização</dt><dd>{res.profile.virtualizacao.join(', ') || 'não usada'}</dd>
            </dl>
          </Card>
          <Card className="flush" title={`Recomendados para você (${group('apply').length})`} icon="star"
            actions={<Button small variant="ghost" onClick={() => setSel((s) => ({ ...s, ...Object.fromEntries(group('apply').map((p) => [p.id, true])) }))}>Marcar todos</Button>}>
            <div style={{ height: 6 }} />{group('apply').map((p) => <Row key={p.id} p={p} />)}
          </Card>
          <Card className="flush" title={`Opcionais (${group('optional').length})`} sub="têm contrapartida — vêm desmarcados" icon="warn">
            <div style={{ height: 6 }} />{group('optional').map((p) => <Row key={p.id} p={p} />)}
          </Card>
          <Card className="flush" title={`Não recomendados para o seu PC (${group('skip').length})`} icon="x"
            actions={<Button small variant="ghost" onClick={() => setShowSkip(!showSkip)}>{showSkip ? 'Esconder' : 'Mostrar motivos'}</Button>}>
            <div style={{ height: 6 }} />
            {showSkip ? group('skip').map((p) => <Row key={p.id} p={p} />) : <div className="muted small" style={{ padding: '0 16px 14px' }}>{group('skip').map((p) => p.name).join(' · ')}</div>}
          </Card>
          <Callout tone="info">Ajustes de aparência (tema escuro, barra de tarefas, relógio...) são gosto pessoal e não mudam o desempenho — escolha-os na aba <a href="#" onClick={(e) => { e.preventDefault(); go('tweaks'); }}>Ajustes</a>.</Callout>
          {chosen.length > 0 && (
            <div className="bar-total">
              <strong>{chosen.length} ajuste(s) selecionado(s)</strong>
              <div className="spacer" />
              <Button variant="primary" icon="bolt" loading={busy === 'apply'} onClick={apply}>Aplicar plano</Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
