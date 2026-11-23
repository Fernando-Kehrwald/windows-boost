import { useEffect, useState } from 'react';
import { Card, Button, Badge, Stat, Loading, Callout, confirm } from '../ui';
import { call, callQuiet, on, useCall, fmtDate, fmtBytes, toast } from '../lib';

const fmt = (v, unit = '', d = 0) => (typeof v === 'number' ? `${v.toFixed(d)}${unit}` : '—');
const LEVEL_TONE = { '-1': 'accent', 0: 'ok', 1: 'warn', 2: 'warn', 3: 'danger' };

export default function ThermalCard({ games }) {
  const [st, setSt] = useState(null);
  const cfg = useCall('thermal.config');
  const [probe, setProbe] = useState(null);
  const [busy, setBusy] = useState('');
  const [hot, setHot] = useState(null);
  useEffect(() => { callQuiet('thermal.state').then(setSt).catch(() => {}); return on('thermal', setSt); }, []);
  useEffect(() => { if (cfg.data) setHot({ cpuHot: cfg.data.cpuHot, gpuHot: cfg.data.gpuHot }); }, [cfg.data]);

  async function doProbe() { setBusy('probe'); try { setProbe(await call('thermal.probe')); } catch {} finally { setBusy(''); } }
  async function saveHot() { cfg.setData(await call('thermal.setConfig', hot)); toast('Limites salvos.'); }
  async function reset(key) { if (await confirm({ title: 'Esquecer o que foi aprendido?', text: 'Na próxima sessão o Guardião começa do zero (padrão do plano) e reaprende.', ok: 'Esquecer' })) cfg.setData(await call('thermal.resetLearned', key)); }

  const s = st && st.running ? st.last || {} : null;
  const learned = (cfg.data && cfg.data.learned) || {};
  const nameOf = (k) => (k === 'manual' ? 'Sessões manuais' : ((games || []).find((g) => g.id === k) || {}).name || k);
  const LV = { 1: 'CPU a 99% (turbo desligado)', 2: 'CPU a 90%', 3: 'CPU a 80%' };
  const rep = cfg.data && cfg.data.lastReport;

  return (
    <Card title="Guardião térmico e de desempenho" icon="timer" actions={st && st.running ? <Badge tone={LEVEL_TONE[st.level]}>{st.levelLabel}</Badge> : <Badge>aguardando um jogo</Badge>}>
      {st && st.running ? (
        <>
          <div className="grid g4" style={{ marginBottom: 14 }}>
            <Stat label="Temperatura (sensor ACPI)" value={fmt(s.cpuTemp, ' °C', 1)} sub={st.peaks.cpuTemp ? `pico ${st.peaks.cpuTemp} °C` : 'sensor indisponível'} />
            <Stat label="Desempenho da CPU" value={fmt(s.perf, '%')} sub={`limite da plataforma ${fmt(s.limit, '%')}${typeof s.passive === 'number' && s.passive < 100 ? ` · freio térmico ${fmt(s.passive, '%')}` : ''}`} />
            <Stat label="GPU" value={`${fmt(s.gpuUtil, '%')} · ${fmt(s.gpuTemp, ' °C')}`} sub={s.gpuThermal ? 'reduzindo clock por calor!' : s.gpuClock ? `${s.gpuClock} / ${s.gpuClockMax} MHz` : (st.peaks.gpuTemp ? `pico ${st.peaks.gpuTemp} °C` : '')} />
            <Stat label="Energia" value={s.onAC === false ? `Bateria ${s.battery ?? ''}%` : s.onAC ? 'Na tomada' : 'Desktop'} sub={s.ramTotal ? `RAM livre ${fmtBytes(s.ramFree)}` : ''} />
          </div>
          {st.throttleSecs > 0 && <div className="muted small" style={{ marginBottom: 8 }}>Tempo em thermal throttling nesta sessão: {st.throttleSecs}s</div>}
          <div className="logbox" style={{ maxHeight: 200 }}>
            {st.events.length ? st.events.slice().reverse().map((e, i) => <div key={i} className={e.type === 'warn' ? 'warn' : ''}>[{new Date(e.at).toLocaleTimeString('pt-BR')}] {e.type === 'act' ? '⚙ ' : e.type === 'warn' ? '⚠ ' : 'ℹ '}{e.text}</div>) : 'Monitorando...'}
          </div>
        </>
      ) : (
        <>
          <div className="muted small" style={{ marginBottom: 12 }}>
            Enquanto o jogo roda, lê os sensores do Windows e da GPU (a cada 2 s, sem tocar no jogo) e corrige sozinho:
            <b> thermal throttling</b> → limita a CPU a 99% (desliga o turbo), depois 90% e 80% se precisar;
            <b> gargalo de CPU</b> com temperatura sob controle → devolve desempenho;
            <b> bateria</b>, <b>memória cheia</b> e <b>GPU quente</b> → avisa ou corrige. Ao fechar o jogo, o plano de energia volta exatamente ao que era.
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <Button small icon="search" loading={busy === 'probe'} onClick={doProbe}>Testar sensores deste PC</Button>
            {hot && <>
              <span className="muted small">Considerar quente: CPU ≥</span><input className="inp" type="number" style={{ width: 70, height: 28 }} value={hot.cpuHot} onChange={(e) => setHot({ ...hot, cpuHot: e.target.value })} />
              <span className="muted small">°C · GPU ≥</span><input className="inp" type="number" style={{ width: 70, height: 28 }} value={hot.gpuHot} onChange={(e) => setHot({ ...hot, gpuHot: e.target.value })} />
              <span className="muted small">°C</span><Button small onClick={saveHot}>Salvar</Button>
            </>}
          </div>
          {probe && (
            <Callout tone="info" title="Sensores encontrados">
              Temperatura ACPI: {fmt(probe.cpuTemp, ' °C', 1)} · Desempenho CPU: {fmt(probe.perf, '%')} · Limite da plataforma: {fmt(probe.limit, '%')} ·
              Freio térmico: {typeof probe.passive === 'number' ? fmt(probe.passive, '%') : 'não informado'} · GPU: {fmt(probe.gpuUtil, '%')} / {fmt(probe.gpuTemp, ' °C')}{probe.gpuClock ? ' (NVIDIA)' : ''} ·
              Energia: {probe.onAC === false ? 'bateria' : probe.onAC ? 'tomada' : 'sem bateria'}
              {typeof probe.cpuTemp !== 'number' && <div style={{ marginTop: 4 }}>Sem sensor de temperatura ACPI: o Guardião usa o freio térmico e o limite de desempenho informados pelo Windows, que funcionam mesmo assim.</div>}
            </Callout>
          )}
          {Object.keys(learned).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13 }}>Aprendido por jogo</strong> <span className="muted small">(ponto de partida da próxima sessão)</span>
              {Object.entries(learned).map(([k, v]) => <div key={k} className="row" style={{ padding: '4px 0' }}><span>{nameOf(k)}</span><Badge tone="warn">{LV[v] || v}</Badge><div className="spacer" /><Button small variant="ghost" onClick={() => reset(k)}>Esquecer</Button></div>)}
            </div>
          )}
          {rep && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13 }}>Última sessão: {rep.game}</strong> <span className="muted small">{fmtDate(rep.at)} · {rep.minutes} min</span>
              <div className="muted small">Pico CPU {rep.peaks.cpuTemp ?? '—'} °C · pico GPU {rep.peaks.gpuTemp ?? '—'} °C · {rep.throttleSecs}s em throttling · nível mais restritivo: {rep.maxLevel}{rep.learned ? ` · lembrado: ${rep.learned}` : ''}</div>
              {rep.events.filter((e) => e.type !== 'info').length > 0 && <div className="logbox" style={{ maxHeight: 140, marginTop: 6 }}>{rep.events.map((e, i) => <div key={i}>[{new Date(e.at).toLocaleTimeString('pt-BR')}] {e.text}</div>)}</div>}
            </div>
          )}
          {!cfg.data && <Loading />}
        </>
      )}
    </Card>
  );
}
