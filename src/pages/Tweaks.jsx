import { useMemo, useState } from 'react';
import { Card, PageHeader, Tabs, Search, TweakRow, Button, Loading, Callout, Check, confirm, Empty } from '../ui';
import { call, useCall, toast } from '../lib';

export const CATS = [
  { id: 'all', label: 'Todos' }, { id: 'desempenho', label: 'Desempenho e sistema' }, { id: 'jogos', label: 'Jogos' },
  { id: 'rede', label: 'Rede' }, { id: 'privacidade', label: 'Privacidade' }, { id: 'aparencia', label: 'Aparência' }, { id: 'geral', label: 'Geral' },
];

/** Hook compartilhado: lista, estado e aplicar/desfazer com confirmações. */
export function useTweaks() {
  const list = useCall('tweaks.list');
  const status = useCall('tweaks.status');
  const appliedList = useCall('tweaks.applied');
  const sys = useCall('sys.static');
  // Enquanto a verificação real no sistema roda, mostra o que o app registrou como aplicado.
  const statusData = status.data || (appliedList.data ? Object.fromEntries(appliedList.data.map((a) => [a.id, true])) : null);
  const [busy, setBusy] = useState({});
  const [needReboot, setNeedReboot] = useState(false);

  async function run(ts, on) {
    ts = ts.filter((t) => !t.link);
    if (!ts.length) return;
    const x3d = sys.data && sys.data.cpu && sys.data.cpu.x3d;
    const warns = ts.filter((t) => on && (t.risk !== 'safe' || t.noUndo || (t.x3dBlock && x3d)));
    if (on && warns.length) {
      const ok = await confirm({
        title: ts.length === 1 ? ts[0].name : `Aplicar ${ts.length} ajustes`,
        text: ts.length === 1 ? ts[0].desc : `${warns.length} deles pedem atenção:`,
        list: ts.length > 1 ? warns.map((t) => `${t.name}${t.warn ? ` — ${t.warn}` : ''}`) : null,
        warn: ts.length === 1 ? [(ts[0].x3dBlock && x3d) ? 'Sua CPU é X3D: este ajuste atrapalha o direcionamento de jogos para o 3D V-Cache.' : '', ts[0].warn || '', ts[0].noUndo ? 'Não há desfazer automático — um ponto de restauração será criado antes.' : ''].filter(Boolean).join(' ') : 'Um ponto de restauração será criado antes de aplicar.',
        danger: warns.some((t) => t.risk === 'risky' || (t.x3dBlock && x3d)), ok: 'Aplicar',
      });
      if (!ok) return;
    }
    setBusy((b) => ({ ...b, ...Object.fromEntries(ts.map((t) => [t.id, true])) }));
    try {
      const r = await call(on ? 'tweaks.apply' : 'tweaks.unapply', ts.map((t) => t.id));
      const fails = Object.entries(r).filter(([, v]) => !v.ok);
      const okN = Object.keys(r).length - fails.length;
      if (fails.length) toast(`${fails.length} falharam: ${fails.map(([id, v]) => `${(ts.find((t) => t.id === id) || {}).name}: ${v.error}`).join(' | ')}`, 'error');
      if (okN) toast(`${okN} ajuste(s) ${on ? 'aplicado(s)' : 'desfeito(s)'}.`);
      if (Object.values(r).some((v) => v.ok && v.reboot)) setNeedReboot(true);
      status.setData((s) => ({ ...(s || statusData || {}), ...Object.fromEntries(Object.entries(r).filter(([, v]) => v.ok).map(([id]) => [id, on])) }));
    } catch {} finally { setBusy((b) => { const n = { ...b }; ts.forEach((t) => delete n[t.id]); return n; }); }
  }
  return { list, status: { ...status, data: statusData }, sys, busy, run, needReboot };
}

export function RebootBanner() {
  return <Callout tone="info" icon="reboot" title="Reinício necessário" actions={<Button small variant="primary" onClick={async () => { if (await confirm({ title: 'Reiniciar agora?', text: 'Salve seus trabalhos. O PC reinicia em 5 segundos.', ok: 'Reiniciar' })) call('app.reboot'); }}>Reiniciar agora</Button>}>Alguns ajustes só valem depois de reiniciar o Windows.</Callout>;
}

export default function Tweaks({ go }) {
  const { list, status, busy, run, needReboot } = useTweaks();
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState({});

  const all = (list.data || []).filter((t) => t.cat !== 'hardware');
  const st = status.data || {};
  const shown = useMemo(() => all.filter((t) => (cat === 'all' || t.cat === cat)
    && (!q || `${t.name} ${t.desc}`.toLowerCase().includes(q.toLowerCase()))
    && (filter === 'all' || (filter === 'rec' && t.rec) || (filter === 'on' && st[t.id]) || (filter === 'off' && !st[t.id]))), [all, cat, q, filter, st]);
  const selected = all.filter((t) => sel[t.id]);
  const appliedCount = all.filter((t) => st[t.id]).length;

  if (list.loading) return <Loading text="Carregando ajustes..." />;
  return (
    <>
      <PageHeader title="Ajustes" desc={`${all.length} ajustes do Windows. Cada um guarda o valor anterior e pode ser desfeito (exceto os marcados "Sem desfazer").`}
        actions={<>
          <Button icon="refresh" onClick={status.reload} loading={status.loading}>Verificar estado</Button>
          <Button variant="primary" icon="star" onClick={() => run(all.filter((t) => t.rec && !st[t.id]), true)}>Aplicar recomendados</Button>
        </>} />
      {needReboot && <RebootBanner />}
      <div className="row between">
        <Tabs value={cat} onChange={setCat} tabs={CATS.map((c) => ({ ...c, count: c.id === 'all' ? all.length : all.filter((t) => t.cat === c.id).length }))} />
      </div>
      <div className="row">
        <Search value={q} onChange={setQ} placeholder="Buscar ajuste..." />
        <select className="inp" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Todos</option><option value="rec">Recomendados</option><option value="on">Aplicados</option><option value="off">Não aplicados</option>
        </select>
        <span className="muted small">{appliedCount} de {all.length} aplicados {status.loading && '· verificando...'}</span>
        <div className="spacer" />
        <Check label="Selecionar visíveis" checked={shown.length > 0 && shown.every((t) => t.link || sel[t.id])} onChange={(v) => setSel((s) => ({ ...s, ...Object.fromEntries(shown.filter((t) => !t.link).map((t) => [t.id, v])) }))} />
      </div>
      <Card className="flush">
        {shown.length === 0 ? <Empty icon="search" title="Nenhum ajuste encontrado" /> : (
          <div className="tlist">
            {(cat === 'all' ? CATS.slice(1) : CATS.filter((c) => c.id === cat)).map((c) => {
              const items = shown.filter((t) => t.cat === c.id);
              if (!items.length) return null;
              return (
                <div key={c.id}>
                  {cat === 'all' && <div className="tgroup-h">{c.label}</div>}
                  {items.map((t) => <TweakRow key={t.id} t={t} applied={!!st[t.id]} busy={!!busy[t.id]} onToggle={(tt, v) => run([tt], v)}
                    selected={!!sel[t.id]} onSelect={(v) => setSel((s) => ({ ...s, [t.id]: v }))} onLink={go} />)}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {selected.length > 0 && (
        <div className="bar-total">
          <strong>{selected.length} selecionado(s)</strong>
          <Button small variant="ghost" onClick={() => setSel({})}>Limpar seleção</Button>
          <div className="spacer" />
          <Button icon="undo" onClick={() => { run(selected.filter((t) => st[t.id] && !t.noUndo), false); setSel({}); }}>Desfazer selecionados</Button>
          <Button variant="primary" icon="check" onClick={() => { run(selected.filter((t) => !st[t.id]), true); setSel({}); }}>Aplicar selecionados</Button>
        </div>
      )}
    </>
  );
}
