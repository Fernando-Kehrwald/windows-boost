import { useEffect, useState } from 'react';
import { Card, PageHeader, Loading, Button, Check, Toggle, Meter, Stat, Callout } from '../ui';
import { call, useCall, fmtBytes, pct, toast } from '../lib';

const AREAS = [
  { id: 'workingSets', name: 'Working set dos processos', desc: 'Devolve ao sistema páginas que os programas não estão usando agora.' },
  { id: 'modified', name: 'Lista de páginas modificadas', desc: 'Grava no disco e libera páginas modificadas.' },
  { id: 'standby', name: 'Lista standby', desc: 'Cache de arquivos/programas recentes. Libera mais memória, mas o que estava em cache precisará ser lido de novo.' },
  { id: 'lowStandby', name: 'Standby de baixa prioridade', desc: 'Usado só se a lista standby completa estiver desmarcada.' },
  { id: 'systemCache', name: 'Working set do sistema (cache)', desc: 'Cache de arquivos do sistema.' },
];

export default function Ram() {
  const info = useCall('ram.info');
  const set = useCall('settings.get');
  const [areas, setAreas] = useState({ workingSets: true, modified: true, standby: true, lowStandby: true, systemCache: true });
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const [auto, setAuto] = useState(null);
  useEffect(() => { if (set.data) setAuto(set.data.ramAuto); }, [set.data]);
  useEffect(() => { const t = setInterval(() => info.reload(), 5000); return () => clearInterval(t); }, [info.reload]);
  const m = info.data;
  async function clean() { setBusy(true); try { const r = await call('ram.clean', areas); setLast(r); toast(`${fmtBytes(r.freed)} liberados.`); info.reload(); } catch {} finally { setBusy(false); } }
  async function saveAuto(patch) { const n = { ...auto, ...patch }; setAuto(n); await call('ram.setAuto', n); }
  return (
    <>
      <PageHeader title="Memória RAM" desc="Libera memória chamando APIs nativas do Windows (EmptyWorkingSet e NtSetSystemInformation)." actions={<Button variant="primary" icon="memory" loading={busy} onClick={clean}>Limpar agora</Button>} />
      <Card title="Situação atual" icon="memory">
        {!m ? <Loading /> : (
          <div className="grid g4">
            <Meter label="Em uso" value={pct(m.total - m.free, m.total)} sub={`${fmtBytes(m.total - m.free)} de ${fmtBytes(m.total)}`} />
            <Stat label="Livre" value={fmtBytes(m.free)} /><Stat label="Standby (cache)" value={fmtBytes(m.standby)} /><Stat label="Modificada" value={fmtBytes(m.modified)} />
          </div>
        )}
        {last && <div style={{ marginTop: 14 }}><Callout tone="ok">Última limpeza: livre passou de {fmtBytes(last.before.free)} para {fmtBytes(last.after.free)} (+{fmtBytes(last.freed)}).</Callout></div>}
      </Card>
      <div className="grid g2">
        <Card title="O que limpar" icon="sliders">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {AREAS.map((a) => <div key={a.id}><Check checked={areas[a.id]} onChange={(v) => setAreas({ ...areas, [a.id]: v })} label={a.name} /><div className="muted small" style={{ marginLeft: 26 }}>{a.desc}</div></div>)}
          </div>
        </Card>
        <Card title="Agendamento" icon="timer">
          {!auto ? <Loading /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="row between"><div><strong>Limpar automaticamente</strong><div className="muted small">Enquanto o app estiver aberto (inclusive na bandeja).</div></div><Toggle checked={auto.enabled} onChange={(v) => saveAuto({ enabled: v })} /></div>
              <div className="row"><span>A cada</span><input className="inp" type="number" min="1" max="1440" style={{ width: 90 }} value={auto.minutes} onChange={(e) => saveAuto({ minutes: Math.max(1, Number(e.target.value) || 1) })} /><span>minutos</span></div>
              <div className="row"><span>Só quando a RAM livre estiver abaixo de</span><input className="inp" type="number" min="0" max="90" style={{ width: 80 }} value={auto.onlyBelowPercent} onChange={(e) => saveAuto({ onlyBelowPercent: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })} /><span>% (0 = sempre)</span></div>
            </div>
          )}
        </Card>
      </div>
      <Callout tone="info">O Windows já gerencia a memória bem; limpar a lista standby ajuda principalmente em jogos que sofrem com stutter quando a RAM está cheia de cache.</Callout>
    </>
  );
}
