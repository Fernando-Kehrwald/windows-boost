import { useMemo, useState } from 'react';
import { Card, PageHeader, Loading, Button, Check, Badge, Callout, Tabs, Empty, confirm } from '../ui';
import { call, useCall, fmtBytes, toast } from '../lib';

export default function Cleanup() {
  const [tab, setTab] = useState('files');
  return (
    <>
      <PageHeader title="Limpeza" desc="Arquivos temporários do Windows e de ~50 programas, pastas personalizadas e Registro — sempre com prévia do espaço a ser liberado." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'files', label: 'Arquivos', icon: 'broom' }, { id: 'reg', label: 'Registro', icon: 'sliders' }]} />
      {tab === 'files' ? <Files /> : <Registry />}
    </>
  );
}

function Files() {
  const items = useCall('clean.list');
  const [sel, setSel] = useState(null);
  const [scan, setScan] = useState(null);
  const [busy, setBusy] = useState('');
  const list = items.data || [];
  const selected = sel || Object.fromEntries(list.filter((i) => i.def).map((i) => [i.id, true]));
  const ids = list.filter((i) => selected[i.id]).map((i) => i.id);
  const total = scan ? ids.reduce((a, id) => a + ((scan[id] && scan[id].bytes) || 0), 0) : null;
  const running = scan ? [...new Set(ids.flatMap((id) => (scan[id] && scan[id].running) || []))] : [];
  const groups = useMemo(() => {
    const g = {};
    list.forEach((i) => { const k = i.group === 'windows' ? 'Windows' : i.group === 'custom' ? 'Pastas personalizadas' : i.app; (g[k] = g[k] || []).push(i); });
    return g;
  }, [list]);

  async function doScan(idsToScan = ids) { setBusy('scan'); try { setScan(await call('clean.scan', idsToScan)); } catch {} finally { setBusy(''); } }
  async function doClean() {
    let closeApps = false;
    if (running.length) {
      closeApps = await confirm({ title: 'Programas abertos', text: `Estes programas estão abertos e seus arquivos podem estar em uso: ${running.join(', ')}.\n\nFechar agora antes de limpar? (Cancelar = limpar só o que não estiver em uso)`, ok: 'Fechar e limpar' });
    } else if (!(await confirm({ title: 'Limpar agora?', text: `${ids.length} itens selecionados${total !== null ? ` · ${fmtBytes(total)}` : ''}. Os arquivos são apagados definitivamente.`, ok: 'Limpar' }))) return;
    setBusy('clean');
    try {
      const r = await call('clean.run', ids, { closeApps });
      const freed = Object.values(r).reduce((a, x) => a + (x.freed || 0), 0);
      const locked = Object.values(r).reduce((a, x) => a + (x.locked || 0), 0);
      toast(`${fmtBytes(freed)} liberados${locked ? ` · ${locked} arquivo(s) em uso foram ignorados` : ''}.`);
      doScan();
    } catch {} finally { setBusy(''); }
  }
  async function oneClick() {
    const def = list.filter((i) => i.def).map((i) => i.id);
    setSel(Object.fromEntries(def.map((id) => [id, true])));
    setBusy('scan');
    try {
      const s = await call('clean.scan', def); setScan(s);
      const t = def.reduce((a, id) => a + ((s[id] && s[id].bytes) || 0), 0);
      if (!(await confirm({ title: 'Limpeza com 1 clique', text: `Seleção padrão (caches e temporários; sem cookies, histórico ou sessões): ${fmtBytes(t)} a liberar.`, ok: 'Limpar' }))) return;
      setBusy('clean');
      const r = await call('clean.run', def, {});
      toast(`${fmtBytes(Object.values(r).reduce((a, x) => a + (x.freed || 0), 0))} liberados.`);
      doScan(def);
    } catch {} finally { setBusy(''); }
  }
  const setAll = (arr, v) => setSel({ ...selected, ...Object.fromEntries(arr.map((i) => [i.id, v])) });

  if (items.loading) return <Loading />;
  return (
    <>
      <div className="row">
        <Button variant="primary" icon="bolt" loading={busy === 'clean' && !scan} onClick={oneClick}>Limpeza com 1 clique</Button>
        <Button icon="search" loading={busy === 'scan'} onClick={() => doScan()}>Analisar seleção</Button>
        <Button icon="folder" onClick={async () => items.setData(await call('clean.addFolder'))}>Adicionar pasta</Button>
        <div className="spacer" />
        <Button variant="ghost" small onClick={() => setAll(list, false)}>Desmarcar tudo</Button>
        <Button variant="ghost" small onClick={() => setSel(null)}>Seleção padrão</Button>
      </div>
      <div className="grid g2">
        {Object.entries(groups).map(([g, arr]) => {
          const gTotal = scan ? arr.reduce((a, i) => a + ((scan[i.id] && scan[i.id].bytes) || 0), 0) : null;
          const run = scan ? [...new Set(arr.flatMap((i) => (scan[i.id] && scan[i.id].running) || []))] : [];
          return (
            <Card key={g} title={g} sub={gTotal !== null ? fmtBytes(gTotal) : ''} icon={g === 'Windows' ? 'shield' : g === 'Pastas personalizadas' ? 'folder' : 'trashapp'}
              actions={<><Check checked={arr.every((i) => selected[i.id])} onChange={(v) => setAll(arr, v)} />{run.length > 0 && <Badge tone="warn" icon="warn">aberto</Badge>}</>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {arr.map((i) => (
                  <div key={i.id} className="row" style={{ flexWrap: 'nowrap' }}>
                    <Check checked={!!selected[i.id]} onChange={(v) => setSel({ ...selected, [i.id]: v })} label={i.name} />
                    <div className="spacer" />
                    {scan && scan[i.id] && <span className="muted small num">{fmtBytes(scan[i.id].bytes)}{scan[i.id].regItems ? ` · ${scan[i.id].regItems} reg.` : ''}</span>}
                    {i.group === 'custom' && <Button small variant="ghost" icon="x" onClick={async () => items.setData(await call('clean.removeFolder', i.name))} />}
                  </div>
                ))}
                {arr.some((i) => i.desc && selected[i.id]) && <div className="muted small">{arr.filter((i) => i.desc && selected[i.id]).map((i) => i.desc).join(' ')}</div>}
              </div>
            </Card>
          );
        })}
      </div>
      <div className="bar-total">
        <span>{ids.length} itens selecionados</span>
        {total !== null && <strong>{fmtBytes(total)} a liberar</strong>}
        {running.length > 0 && <Badge tone="warn" icon="warn">{running.join(', ')} aberto(s)</Badge>}
        <div className="spacer" />
        <Button icon="search" loading={busy === 'scan'} onClick={() => doScan()}>Analisar</Button>
        <Button variant="primary" icon="broom" disabled={!ids.length} loading={busy === 'clean'} onClick={doClean}>Limpar</Button>
      </div>
    </>
  );
}

function Registry() {
  const [items, setItems] = useState(null);
  const [sel, setSel] = useState({});
  const [busy, setBusy] = useState('');
  async function scan() { setBusy('scan'); try { const r = await call('reg.scan'); setItems(r); setSel(Object.fromEntries(r.map((i) => [i.id, true]))); } catch {} finally { setBusy(''); } }
  async function clean() {
    const ids = Object.keys(sel).filter((k) => sel[k]);
    if (!(await confirm({ title: `Remover ${ids.length} itens do Registro?`, text: 'Um backup .reg é criado antes (aba Restaurar).', ok: 'Remover' }))) return;
    setBusy('clean');
    try { const r = await call('reg.clean', ids); toast(`${r.removed} itens removidos. Backup salvo.`); setItems((x) => x.filter((i) => !sel[i.id])); setSel({}); } catch {} finally { setBusy(''); }
  }
  const cats = items ? [...new Set(items.map((i) => i.cat))] : [];
  return (
    <>
      <Callout tone="info">Procura desinstalações órfãs, caminhos de apps quebrados, inicialização apontando para arquivos inexistentes, fontes ausentes, DLLs compartilhadas inexistentes, sons de evento sem arquivo, documentos recentes, histórico do Executar, caminhos digitados e históricos de Abrir/Salvar. Sempre faz backup .reg antes.</Callout>
      <div className="row"><Button variant="primary" icon="search" loading={busy === 'scan'} onClick={scan}>Analisar Registro</Button>
        {items && <Button variant="danger" icon="broom" loading={busy === 'clean'} disabled={!Object.values(sel).some(Boolean)} onClick={clean}>Remover selecionados</Button>}</div>
      {items && (items.length === 0 ? <Empty icon="check" title="Nada encontrado">O Registro está limpo.</Empty> : cats.map((c) => {
        const arr = items.filter((i) => i.cat === c);
        return (
          <Card key={c} className="flush" title={c} sub={`${arr.length}`} icon="sliders" actions={<Check checked={arr.every((i) => sel[i.id])} onChange={(v) => setSel((s) => ({ ...s, ...Object.fromEntries(arr.map((i) => [i.id, v])) }))} />}>
            <div className="scroll" style={{ maxHeight: 260 }}>{arr.map((i) => (
              <div className="list-item" key={i.id}><Check checked={!!sel[i.id]} onChange={(v) => setSel((s) => ({ ...s, [i.id]: v }))} />
                <div style={{ minWidth: 0 }}><div className="trunc">{i.detail}</div><div className="muted small mono trunc">{i.key}{i.value && i.value !== '*' ? ` → ${i.value}` : ''}</div></div></div>
            ))}</div>
          </Card>
        );
      }))}
    </>
  );
}
