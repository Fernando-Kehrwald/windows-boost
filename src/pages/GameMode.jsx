import { useState } from 'react';
import { Card, PageHeader, Button, Toggle, Check, Loading, Empty, Callout, Badge, confirm } from '../ui';
import Icon from '../icons';
import { call, useCall, toast } from '../lib';

const PER_GAME = [
  { key: 'fso', label: 'Sem otimizações de tela cheia' },
  { key: 'dpi', label: 'Forçar "High DPI aware"' },
  { key: 'gpu', label: 'GPU dedicada (alto desempenho)' },
];

export default function GameMode({ gm }) {
  const games = useCall('gm.list');
  const parts = useCall('gm.parts');
  const opts = useCall('gm.options');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(null);
  const active = gm && gm.active;

  async function detect() { setBusy('detect'); try { const r = await call('gm.detect'); games.setData(r); toast(`${r.length} jogos na lista.`); } catch {} finally { setBusy(''); } }
  async function add() { const r = await call('gm.add'); games.setData(r); }
  async function toggleSession(id) {
    setBusy(id || 'session');
    try {
      if (active) await call('gm.stop');
      else { const r = await call('gm.start', id || null); if (r.failed && r.failed.length) toast(`Algumas otimizações falharam: ${r.failed.join(' | ')}`, 'warn'); }
    } catch {} finally { setBusy(''); }
  }
  async function setOpt(k, v) { opts.setData(await call('gm.setOptions', { [k]: v })); }
  async function perGame(g, key, v) { try { games.setData(await call('gm.perGame', g.id, key, v)); } catch {} }
  async function pickExe(g) {
    const f = await call('dialog.file', [{ name: 'Executável', extensions: ['exe'] }], `Executável de ${g.name}`);
    if (f) games.setData(await call('gm.update', g.id, { exePath: f }));
  }
  async function addProc(g) {
    const f = await call('dialog.file', [{ name: 'Executável', extensions: ['exe'] }], 'Processo extra deste jogo (ex.: *-Win64-Shipping.exe)');
    if (f) games.setData(await call('gm.update', g.id, { extraExes: [...(g.extraExes || []), f] }));
  }
  async function remove(g) { if (await confirm({ title: 'Remover da lista?', text: `${g.name} deixará de ser vigiado pelo modo automático.`, ok: 'Remover' })) games.setData(await call('gm.remove', g.id)); }

  const o = opts.data || {};
  const list = games.data || [];
  return (
    <>
      <PageHeader title="Modo Jogo" desc="Otimizações aplicadas só enquanto o jogo está aberto e desfeitas automaticamente ao fechar. Se o PC desligar no meio, tudo é desfeito na próxima abertura do app." />
      <div className="grid g2">
        <Card title="Sessão" icon="game">
          <div className="row between">
            <span className={`status-pill ${active ? 'on' : ''}`}><span className="d" />{active ? `Ativo — ${gm.game}` : 'Inativo'}</span>
            <Button variant={active ? 'danger' : 'primary'} icon={active ? 'stop' : 'play'} loading={busy === 'session' || (gm && gm.busy)} onClick={() => toggleSession(null)}>{active ? 'Desligar e desfazer' : 'Ligar agora'}</Button>
          </div>
          <div className="row between" style={{ marginTop: 16 }}>
            <div><strong>Modo automático</strong><div className="muted small">Vigia os processos e liga quando um jogo da lista abre (e desliga quando fecha).</div></div>
            <Toggle checked={gm && gm.auto} onChange={(v) => call('gm.auto', v)} />
          </div>
        </Card>
        <Card title="O que é feito durante o jogo" icon="sliders">
          {!parts.data ? <Loading /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {parts.data.map((p) => (
                <div key={p.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <Toggle checked={!!o[p.id]} onChange={(v) => setOpt(p.id, v)} disabled={active} />
                  <div><strong style={{ fontSize: 13.5 }}>{p.name}</strong><div className="muted small">{p.desc}</div>
                    {p.id === 'background' && o.background && <div style={{ marginTop: 6 }}><Check label="Congelar (suspender) em vez de só baixar a prioridade" checked={o.suspend} onChange={(v) => setOpt('suspend', v)} disabled={active} /></div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="flush" title={`Jogos (${list.length})`} icon="game" actions={<>
        <Button small icon="search" loading={busy === 'detect'} onClick={detect}>Detectar jogos</Button>
        <Button small icon="plus" onClick={add}>Adicionar .exe</Button>
      </>}>
        <div style={{ height: 8 }} />
        {games.loading ? <Loading /> : list.length === 0 ? (
          <Empty icon="game" title="Nenhum jogo na lista">Clique em "Detectar jogos" para procurar na Steam, Epic, GOG, Ubisoft, EA, Battle.net, Riot e Xbox, ou adicione um .exe manualmente.</Empty>
        ) : list.map((g) => (
          <div key={g.id}>
            <div className="game">
              <div className="game-ico">{g.name.slice(0, 1).toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}><strong className="trunc">{g.name}</strong><Badge>{g.source}</Badge>{!g.exePath && <Badge tone="warn" icon="warn">sem executável</Badge>}</div>
                <div className="muted small trunc" title={g.exePath}>{g.exePath || g.dir}</div>
              </div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <span className="muted small">Automático</span>
                <Toggle checked={g.enabled} onChange={async (v) => games.setData(await call('gm.update', g.id, { enabled: v }))} />
                <Button small variant="ghost" icon="chevron" onClick={() => setOpen(open === g.id ? null : g.id)} title="Detalhes" />
              </div>
            </div>
            {open === g.id && (
              <div style={{ padding: '0 16px 14px 68px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="muted small">Ajustes por jogo (gravados para este .exe e valem a cada abertura):</div>
                <div className="chips">
                  {PER_GAME.map((p) => <button key={p.key} className={`chip ${g.perGame[p.key] ? 'on' : ''}`} onClick={() => perGame(g, p.key, !g.perGame[p.key])} disabled={!g.exePath}>
                    {g.perGame[p.key] && <Icon name="check" size={12} stroke={3} />}{p.label}</button>)}
                </div>
                {g.extraExes && g.extraExes.length > 0 && <div className="muted small">Processos extras: {g.extraExes.map((x) => x.split(/[\\/]/).pop()).join(', ')}</div>}
                <div className="row">
                  <Button small icon="play" loading={busy === g.id} disabled={active} onClick={() => toggleSession(g.id)}>Ligar para este jogo</Button>
                  <Button small icon="folder" onClick={() => pickExe(g)}>Trocar executável</Button>
                  <Button small icon="plus" onClick={() => addProc(g)}>Processo extra</Button>
                  <div className="spacer" />
                  <Button small variant="danger" icon="trashapp" onClick={() => remove(g)}>Remover</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </Card>
      <Card title="Seguro para jogos com anti-cheat (VAC, FACEIT, Vanguard, EAC, BattlEye)" icon="shield">
        <div className="grid g2">
          <div>
            <strong className="ok-t">O Modo Jogo NUNCA:</strong>
            <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--text2)' }}>
              <li>abre o processo do jogo (nem para ler, escrever, mudar prioridade ou afinidade)</li>
              <li>injeta código, cria overlay ou lê a memória de qualquer jogo</li>
              <li>altera arquivos do jogo</li>
              <li>toca em processos ou serviços de anti-cheat e launchers (Steam, Riot, FACEIT, EAC, BattlEye...)</li>
            </ul>
          </div>
          <div>
            <strong>O que ele faz (tudo no nível do Windows):</strong>
            <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--text2)' }}>
              <li>baixa a prioridade/congela outros apps (navegador, IDE...) com o acesso mínimo</li>
              <li>para serviços do Windows e muda chaves do agendador e do plano de energia</li>
              <li>os ajustes por jogo são os mesmos que o próprio Windows grava em Propriedades → Compatibilidade e Configurações → Gráficos</li>
            </ul>
          </div>
        </div>
        <div className="muted small" style={{ marginTop: 10 }}>Anti-cheats banem por modificar o jogo ou rodar cheats conhecidos — configurações do sistema não se enquadram nisso. Por segurança, foram removidos desta versão: afinidade aos P-cores e prioridade alta (abriam o processo do jogo) e Segment Heap (opção de depuração no executável). O limpador de RAM também pula jogos e anti-cheats.</div>
      </Card>
    </>
  );
}
