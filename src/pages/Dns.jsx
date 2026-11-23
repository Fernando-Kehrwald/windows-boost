import { useState } from 'react';
import { Card, PageHeader, Loading, Button, Callout, Badge, confirm } from '../ui';
import { call, useCall, toast } from '../lib';

export default function Dns() {
  const presets = useCall('dns.presets');
  const cur = useCall('dns.current');
  const [bench, setBench] = useState(null);
  const [busy, setBusy] = useState('');
  const [v4, setV4] = useState('');
  const [v4b, setV4b] = useState('');
  const best = bench && bench.find((b) => b.ms !== null);

  async function apply(p) {
    if (!(await confirm({ title: p ? `Usar ${p.name}?` : 'Voltar ao DNS automático (DHCP)?', text: p ? `${p.v4.join(', ')}${p.v6 && p.v6.length ? `\n${p.v6.join(', ')}` : ''}\n\nAplica em todos os adaptadores de rede ativos e limpa o cache DNS.` : 'Os adaptadores ativos voltam a usar o DNS entregue pelo roteador.', ok: 'Aplicar' }))) return;
    setBusy(p ? p.id : 'auto');
    try { cur.setData(await call('dns.apply', p ? { v4: p.v4, v6: p.v6 } : null)); toast('DNS alterado.'); } catch {} finally { setBusy(''); }
  }
  async function test() { setBusy('bench'); try { setBench(await call('dns.benchmark', [v4].filter((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x)))); } catch {} finally { setBusy(''); } }
  const custom = () => { const ips = [v4, v4b].filter((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x.trim())).map((x) => x.trim()); if (!ips.length) return toast('Digite um IPv4 válido.', 'error'); apply({ id: 'custom', name: 'DNS personalizado', v4: ips, v6: [] }); };

  return (
    <>
      <PageHeader title="Gerenciador de DNS" desc="Troque o DNS de todos os adaptadores ativos e descubra qual servidor responde mais rápido para você."
        actions={<><Button icon="bolt" loading={busy === 'bench'} onClick={test}>Testar latência</Button><Button icon="undo" loading={busy === 'auto'} onClick={() => apply(null)}>Automático (DHCP)</Button></>} />
      <Card title="Adaptadores ativos" icon="net" actions={<Button small icon="refresh" onClick={cur.reload} />}>
        {cur.loading ? <Loading /> : !(cur.data || []).length ? <span className="muted">Nenhum adaptador conectado.</span> : (
          <table className="table"><thead><tr><th>Adaptador</th><th>DNS IPv4</th><th>DNS IPv6</th></tr></thead>
            <tbody>{cur.data.map((a) => <tr key={a.index}><td><strong>{a.name}</strong><div className="muted small">{a.desc}</div></td><td className="mono small">{(a.v4 || []).join(', ') || '—'}</td><td className="mono small">{(a.v6 || []).join(', ') || '—'}</td></tr>)}</tbody></table>
        )}
      </Card>
      {bench && <Callout tone="ok" title={best ? `Mais rápido para você: ${best.name} (${best.ms} ms)` : 'Nenhum servidor respondeu'}>O teste faz consultas DNS a cada servidor só quando você clica em "Testar latência".</Callout>}
      <div className="grid g3">
        {(presets.data || []).map((p) => {
          const b = bench && bench.find((x) => x.id === p.id);
          return (
            <div key={p.id} className={`dns-card ${best && best.id === p.id ? 'best' : ''}`}>
              <div className="row between"><strong>{p.name}</strong>{b && <span className="ms">{b.ms !== null ? `${b.ms} ms` : 'falhou'}</span>}</div>
              <div className="mono small muted">{p.v4.join(' · ')}</div>
              {p.note && <div className="small muted">{p.note}</div>}
              <div className="row" style={{ marginTop: 'auto' }}>{best && best.id === p.id && <Badge tone="ok">mais rápido</Badge>}<div className="spacer" /><Button small variant="primary" loading={busy === p.id} onClick={() => apply(p)}>Usar</Button></div>
            </div>
          );
        })}
      </div>
      <Card title="DNS personalizado" icon="globe">
        <div className="row"><input className="inp" placeholder="Primário (ex.: 1.1.1.1)" value={v4} onChange={(e) => setV4(e.target.value)} /><input className="inp" placeholder="Secundário (opcional)" value={v4b} onChange={(e) => setV4b(e.target.value)} />
          <Button variant="primary" onClick={custom}>Aplicar</Button>{bench && bench.find((x) => x.id.startsWith('custom:')) && <span className="muted small">Latência: {bench.find((x) => x.id.startsWith('custom:')).ms ?? 'falhou'} ms</span>}</div>
      </Card>
    </>
  );
}
