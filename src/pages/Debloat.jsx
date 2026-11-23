import { useMemo, useState } from 'react';
import { Card, PageHeader, Loading, Button, Search, Tabs, Empty, Callout, Badge, confirm } from '../ui';
import Icon from '../icons';
import { call, useCall, fmtDate, toast } from '../lib';

const PRESETS = [
  { id: 'basic', label: 'Básico', desc: 'Bloat de terceiros (Candy Crush, TikTok, Netflix...)', inc: ['basic'] },
  { id: 'recommended', label: 'Recomendado', desc: '+ Bing, Cortana, Teams, Solitaire, Dicas...', inc: ['basic', 'recommended'] },
  { id: 'extreme', label: 'Extremo', desc: '+ Bloco de Notas, Paint, Fotos, Calculadora, Xbox...', inc: ['basic', 'recommended', 'extreme'] },
];

export default function Debloat() {
  const [tab, setTab] = useState('apps');
  const apps = useCall('debloat.list');
  const removed = useCall('debloat.removed');
  const [sel, setSel] = useState({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const list = useMemo(() => (apps.data || []).filter((a) => !q || `${a.display} ${a.name}`.toLowerCase().includes(q.toLowerCase())), [apps.data, q]);
  const chosen = (apps.data || []).filter((a) => sel[a.name]);

  function preset(p) { setSel(Object.fromEntries((apps.data || []).filter((a) => a.preset && p.inc.includes(a.preset)).map((a) => [a.name, true]))); }
  async function remove() {
    const warns = chosen.filter((a) => a.warn);
    if (!(await confirm({ title: `Remover ${chosen.length} app(s)?`, text: 'Os apps são removidos de todas as contas e da imagem do sistema (não voltam em novos usuários). Um ponto de restauração é criado antes.', list: chosen.map((a) => a.display), warn: warns.length ? warns.map((a) => `${a.display}: ${a.warn}`).join(' ') : null, danger: warns.length > 0, ok: 'Remover' }))) return;
    setBusy('remove');
    try {
      const r = await call('debloat.remove', chosen.map((a) => a.name));
      const ok = Object.values(r).filter((x) => x.ok).length;
      toast(`${ok} de ${chosen.length} removidos.`, ok === chosen.length ? 'ok' : 'warn');
      setSel({}); apps.reload(); removed.reload();
    } catch {} finally { setBusy(''); }
  }
  async function restore(a) {
    setBusy(a.name);
    try { const r = await call('debloat.restore', a.name); if (r.ok) toast(`${a.display} restaurado.`); else toast('Cópia local não encontrada — abrimos a página do app na Microsoft Store.', 'warn'); removed.reload(); } catch {} finally { setBusy(''); }
  }

  return (
    <>
      <PageHeader title="Remover Apps" desc="Seletor visual dos apps da Microsoft Store instalados. Componentes essenciais (Store, winget, Terminal, Segurança do Windows, codecs, Xbox Identity Provider) nunca aparecem aqui." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'apps', label: 'Instalados', count: (apps.data || []).length }, { id: 'removed', label: 'Removidos', count: (removed.data || []).length }]} />
      {tab === 'apps' ? (
        <>
          <div className="grid g3">
            {PRESETS.map((p) => <button key={p.id} className="dns-card" style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => preset(p)}>
              <strong>{p.label}</strong><span className="muted small">{p.desc}</span></button>)}
          </div>
          <div className="row"><Search value={q} onChange={setQ} placeholder="Buscar app..." /><span className="muted small">{chosen.length} selecionado(s)</span><div className="spacer" />
            <Button small variant="ghost" onClick={() => setSel({})}>Limpar seleção</Button><Button small icon="refresh" onClick={apps.reload} /></div>
          {apps.loading ? <Loading text="Lendo apps instalados (pode levar alguns segundos)..." /> : !list.length ? <Empty title="Nenhum app" /> : (
            <div className="app-grid">
              {list.map((a) => (
                <div key={a.name} className={`app-card ${sel[a.name] ? 'sel' : ''}`} onClick={() => setSel((s) => ({ ...s, [a.name]: !s[a.name] }))} title={a.name}>
                  <div className="app-ico">{a.icon ? <img src={a.icon} alt="" /> : <Icon name="trashapp" />}</div>
                  <div style={{ minWidth: 0, flex: 1 }}><div className="t trunc">{a.display}</div><div className="d trunc">{a.desc}</div></div>
                  {a.warn && <Icon name="warn" size={16} style={{ color: 'var(--warn)' }} />}
                  {a.preset && <Badge tone={a.preset === 'extreme' ? 'warn' : a.preset === 'basic' ? 'danger' : 'accent'}>{a.preset === 'basic' ? 'bloat' : a.preset === 'recommended' ? 'dispensável' : 'útil'}</Badge>}
                </div>
              ))}
            </div>
          )}
          {chosen.length > 0 && <div className="bar-total"><strong>{chosen.length} app(s) selecionado(s)</strong><div className="spacer" /><Button variant="danger" icon="trashapp" loading={busy === 'remove'} onClick={remove}>Remover selecionados</Button></div>}
        </>
      ) : (
        <>
          <Callout tone="info">A restauração tenta reinstalar a partir da cópia que ainda estiver no disco; se não houver, abre a página do app na Microsoft Store.</Callout>
          <Card className="flush">
            {!(removed.data || []).length ? <Empty title="Nenhum app removido pelo Windows Boost" /> : removed.data.map((a) => (
              <div className="list-item" key={a.name}><div style={{ flex: 1 }}><strong>{a.display}</strong><div className="muted small mono">{a.name} · {fmtDate(a.at)}</div></div>
                <Button small icon="undo" loading={busy === a.name} onClick={() => restore(a)}>Restaurar</Button></div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}
