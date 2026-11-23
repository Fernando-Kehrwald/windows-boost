import { useEffect, useMemo, useState } from 'react';
import { Card, PageHeader, Loading, Button, Search, Tabs, Empty, Callout, Badge, Check, confirm } from '../ui';
import { call, on, useCall, fmtBytes, toast } from '../lib';

export default function Apps() {
  const [tab, setTab] = useState('install');
  return (
    <>
      <PageHeader title="Aplicativos" desc="Instale programas em lote pelo winget (ou Chocolatey), desinstale vários de uma vez com busca de restos e remova atualizações do Windows." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'install', label: 'Instalar', icon: 'download' }, { id: 'uninstall', label: 'Desinstalar', icon: 'trashapp' }, { id: 'updates', label: 'Atualizações do Windows', icon: 'history' }]} />
      {tab === 'install' && <Install />}
      {tab === 'uninstall' && <Uninstall />}
      {tab === 'updates' && <Updates />}
    </>
  );
}

function Install() {
  const cat = useCall('apps.catalog');
  const mgr = useCall('apps.managers');
  const [sel, setSel] = useState({});
  const [prog, setProg] = useState({});
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => on('apps.progress', (p) => setProg((x) => ({ ...x, [p.id]: p }))), []);
  const list = (cat.data || []).filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()));
  const cats = [...new Set(list.map((a) => a.cat))];
  const ids = Object.keys(sel).filter((k) => sel[k]);
  async function install() {
    if (!(await confirm({ title: `Instalar ${ids.length} programa(s)?`, text: 'O download é feito pelo winget (gerenciador de pacotes do próprio Windows) a partir dos sites dos desenvolvedores. A telemetria do winget é desligada antes.', ok: 'Instalar' }))) return;
    setBusy(true); setProg({});
    try { const r = await call('apps.install', ids); const ok = Object.values(r).filter((x) => x.ok).length; toast(`${ok} de ${ids.length} instalados.`, ok === ids.length ? 'ok' : 'warn'); } catch {} finally { setBusy(false); }
  }
  async function imp() { const r = await call('apps.import'); if (r) setSel(Object.fromEntries(r.map((id) => [id, true]))); }
  return (
    <>
      {mgr.data && !mgr.data.winget && <Callout tone="warn">winget não encontrado{mgr.data.choco ? ' — será usado o Chocolatey.' : '. Instale o "Instalador de Aplicativo" pela Microsoft Store.'}</Callout>}
      <Callout tone="info">Esta é a única função do app que usa a internet, e só quando você clica em Instalar: quem baixa é o winget/Chocolatey, direto das fontes oficiais.</Callout>
      <div className="row"><Search value={q} onChange={setQ} placeholder="Buscar programa..." /><div className="spacer" />
        <Button small icon="folder" onClick={imp}>Importar lista</Button><Button small icon="download" disabled={!ids.length} onClick={() => call('apps.export', ids)}>Exportar seleção</Button></div>
      {cat.loading ? <Loading /> : (
        <div className="grid g3">
          {cats.map((c) => (
            <Card key={c} title={c} icon="download">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {list.filter((a) => a.cat === c).map((a) => (
                  <div key={a.id} className="row" style={{ flexWrap: 'nowrap' }}>
                    <Check checked={!!sel[a.id]} onChange={(v) => setSel((s) => ({ ...s, [a.id]: v }))} label={a.name} />
                    <div className="spacer" />
                    {prog[a.id] && (prog[a.id].status === 'installing' ? <Badge tone="accent">instalando…</Badge> : prog[a.id].status === 'done' ? <Badge tone="ok">ok</Badge> : <Badge tone="danger" title={prog[a.id].error}>erro</Badge>)}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
      {ids.length > 0 && <div className="bar-total"><strong>{ids.length} selecionado(s)</strong><Button small variant="ghost" onClick={() => setSel({})}>Limpar</Button><div className="spacer" /><Button variant="primary" icon="download" loading={busy} onClick={install}>Instalar selecionados</Button></div>}
    </>
  );
}

function Uninstall() {
  const progs = useCall('apps.programs');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState({});
  const [rp, setRp] = useState(true);
  const [busy, setBusy] = useState('');
  const [left, setLeft] = useState(null);
  const [leftSel, setLeftSel] = useState({});
  const [prog, setProg] = useState({});
  useEffect(() => on('apps.uninstallProgress', (p) => setProg((x) => ({ ...x, [p.key]: p }))), []);
  const list = useMemo(() => (progs.data || []).filter((p) => !q || `${p.name} ${p.publisher}`.toLowerCase().includes(q.toLowerCase())), [progs.data, q]);
  const chosen = (progs.data || []).filter((p) => sel[p.key]);
  async function uninstall() {
    if (!(await confirm({ title: `Desinstalar ${chosen.length} programa(s)?`, list: chosen.map((p) => p.name), text: 'Programas sem desinstalação silenciosa vão abrir o próprio desinstalador — siga as telas dele.', ok: 'Desinstalar' }))) return;
    setBusy('un'); setProg({});
    try {
      await call('apps.uninstall', chosen, { restorePoint: rp });
      setBusy('left');
      const l = await call('apps.leftovers', chosen);
      setLeft(l); setLeftSel(Object.fromEntries(l.map((x) => [x.path, true])));
      setSel({}); progs.reload();
    } catch {} finally { setBusy(''); }
  }
  async function removeLeft() {
    const items = left.filter((x) => leftSel[x.path]);
    if (!(await confirm({ title: `Remover ${items.length} resto(s)?`, text: 'Pastas vão para a Lixeira; chaves de registro ganham backup .reg antes.', ok: 'Remover' }))) return;
    setBusy('rl');
    try { const r = await call('apps.removeLeftovers', items); toast(`${r.ok} restos removidos.`); setLeft(null); } catch {} finally { setBusy(''); }
  }
  return (
    <>
      <div className="row"><Search value={q} onChange={setQ} placeholder="Buscar programa ou fabricante..." /><Check label="Criar ponto de restauração antes" checked={rp} onChange={setRp} /><span className="muted small">{list.length} programas</span><div className="spacer" /><Button small icon="refresh" onClick={progs.reload} /></div>
      {left && (
        <Card title={`Restos encontrados (${left.length})`} icon="broom" actions={<><Button small variant="ghost" onClick={() => setLeft(null)}>Ignorar</Button><Button small variant="danger" icon="broom" loading={busy === 'rl'} disabled={!left.some((x) => leftSel[x.path])} onClick={removeLeft}>Remover selecionados</Button></>}>
          {!left.length ? <Empty icon="check" title="Nenhum resto encontrado" /> : left.map((x) => (
            <div className="row" key={x.path} style={{ flexWrap: 'nowrap', padding: '4px 0' }}><Check checked={!!leftSel[x.path]} onChange={(v) => setLeftSel((s) => ({ ...s, [x.path]: v }))} /><Badge>{x.kind}</Badge><span className="mono small trunc">{x.path}</span><span className="muted small">({x.of})</span></div>
          ))}
        </Card>
      )}
      <Card className="flush">
        {progs.loading ? <Loading text="Lendo programas instalados..." /> : (
          <div className="scroll" style={{ maxHeight: 'calc(100vh - 330px)' }}>
            <table className="table"><thead><tr><th style={{ width: 40 }} /><th>Programa</th><th>Fabricante</th><th>Versão</th><th className="num">Tamanho</th><th style={{ width: 90 }} /></tr></thead>
              <tbody>{list.map((p) => (
                <tr key={p.key} onClick={() => setSel((s) => ({ ...s, [p.key]: !s[p.key] }))} style={{ cursor: 'pointer' }}>
                  <td><Check checked={!!sel[p.key]} onChange={(v) => setSel((s) => ({ ...s, [p.key]: v }))} /></td>
                  <td>{p.name} {!p.quiet && !/msiexec/i.test(p.uninstall) && <Badge title="Abre o desinstalador do programa">interativo</Badge>}</td><td className="muted">{p.publisher}</td><td className="mono small">{p.version}</td>
                  <td className="num">{p.size ? fmtBytes(p.size) : '—'}</td>
                  <td>{prog[p.key] && (prog[p.key].status === 'uninstalling' ? <Badge tone="accent">removendo…</Badge> : prog[p.key].status === 'done' ? <Badge tone="ok">ok</Badge> : <Badge tone="danger">erro</Badge>)}</td>
                </tr>
              ))}</tbody></table>
          </div>
        )}
      </Card>
      {chosen.length > 0 && <div className="bar-total"><strong>{chosen.length} selecionado(s)</strong><Button small variant="ghost" onClick={() => setSel({})}>Limpar</Button><div className="spacer" />
        <Button variant="danger" icon="trashapp" loading={busy === 'un' || busy === 'left'} onClick={uninstall}>{busy === 'left' ? 'Procurando restos…' : 'Desinstalar selecionados'}</Button></div>}
    </>
  );
}

function Updates() {
  const up = useCall('apps.updates');
  const [busy, setBusy] = useState('');
  async function remove(u) {
    if (!(await confirm({ title: `Remover ${u.id}?`, text: 'Abre o desinstalador de atualizações do Windows (wusa). Pode pedir reinício. Um ponto de restauração é criado antes.', ok: 'Remover' }))) return;
    setBusy(u.id); try { await call('apps.removeUpdate', u.id); up.reload(); } catch {} finally { setBusy(''); }
  }
  return (
    <Card className="flush" title="Atualizações instaladas" icon="history" actions={<Button small icon="refresh" onClick={up.reload} />}>
      {up.loading ? <Loading /> : !(up.data || []).length ? <Empty title="Nenhuma atualização listada" /> : (
        <table className="table"><thead><tr><th>KB</th><th>Tipo</th><th>Instalada em</th><th style={{ width: 110 }} /></tr></thead>
          <tbody>{up.data.map((u) => <tr key={u.id}><td className="mono">{u.id}</td><td>{u.desc}</td><td>{u.date}</td><td><Button small variant="danger" loading={busy === u.id} onClick={() => remove(u)}>Remover</Button></td></tr>)}</tbody></table>
      )}
    </Card>
  );
}
