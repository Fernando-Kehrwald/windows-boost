import { useMemo, useState } from 'react';
import { Card, PageHeader, Loading, Button, Search, Check, Badge, Callout, Empty } from '../ui';
import { call, useCall, toast } from '../lib';

export default function Drivers() {
  const d = useCall('drivers.list');
  const [q, setQ] = useState('');
  const [hideGeneric, setHideGeneric] = useState(true);
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => (d.data || []).filter((x) => (!hideGeneric || !x.generic) && (!q || `${x.device} ${x.maker} ${x.provider} ${x.version}`.toLowerCase().includes(q.toLowerCase()))), [d.data, q, hideGeneric]);
  const cats = [...new Set(list.map((x) => x.category))];
  async function install() { setBusy(true); try { const r = await call('drivers.install'); if (r) toast('Driver processado pelo pnputil (veja os logs).'); } catch {} finally { setBusy(false); } }
  return (
    <>
      <PageHeader title="Drivers" desc="Inventário dos drivers instalados. O app não consulta servidores: para procurar atualizações, use o Windows Update ou o site do fabricante."
        actions={<>
          <Button icon="external" onClick={() => call('drivers.windowsUpdate')}>Drivers opcionais (Windows Update)</Button>
          <Button icon="folder" loading={busy} onClick={install}>Instalar driver de uma pasta</Button>
        </>} />
      <div className="row">
        <span className="muted small">Sites oficiais:</span>
        {[['nvidia', 'NVIDIA'], ['amd', 'AMD'], ['intel', 'Intel'], ['realtek', 'Realtek']].map(([k, n]) => <Button key={k} small icon="external" onClick={() => call('drivers.vendor', k)}>{n}</Button>)}
      </div>
      <Callout tone="info">Ao instalar um driver de uma pasta, o app cria um ponto de restauração antes e usa o pnputil do Windows.</Callout>
      <div className="row"><Search value={q} onChange={setQ} placeholder="Buscar dispositivo, fabricante, versão..." /><Check label="Ocultar drivers genéricos da Microsoft" checked={hideGeneric} onChange={setHideGeneric} /><span className="muted small">{list.length} drivers</span>
        <div className="spacer" /><Button small icon="refresh" onClick={d.reload} /></div>
      {d.loading ? <Loading text="Lendo drivers..." /> : !list.length ? <Empty title="Nenhum driver" /> : cats.map((c) => (
        <Card key={c} className="flush" title={c} sub={`${list.filter((x) => x.category === c).length}`} icon="driver">
          <table className="table"><thead><tr><th>Dispositivo</th><th>Fornecedor</th><th>Versão</th><th>Data</th><th>INF</th></tr></thead>
            <tbody>{list.filter((x) => x.category === c).map((x, i) => (
              <tr key={i}><td>{x.device} {!x.signed && <Badge tone="warn">não assinado</Badge>}</td><td>{x.provider || x.maker}</td><td className="mono small">{x.version}</td><td className="num">{x.date}</td><td className="mono small">{x.inf}</td></tr>
            ))}</tbody></table>
        </Card>
      ))}
    </>
  );
}
