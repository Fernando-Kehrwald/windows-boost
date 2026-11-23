import { useState } from 'react';
import { Card, PageHeader, Tabs, TweakRow, Loading, Stat, Button, Toggle, Badge, Callout, Empty, confirm } from '../ui';
import { call, useCall, fmtBytes, toast } from '../lib';
import { useTweaks, RebootBanner } from './Tweaks';

const TABS = [
  { id: 'gpu', label: 'GPU', icon: 'gpu' }, { id: 'cpu', label: 'CPU', icon: 'cpu' }, { id: 'ram', label: 'RAM', icon: 'memory' },
  { id: 'input', label: 'Mouse e Teclado', icon: 'mouse' }, { id: 'storage', label: 'Armazenamento', icon: 'disk' },
  { id: 'timer', label: 'Timer', icon: 'timer' }, { id: 'msi', label: 'Modo MSI', icon: 'bolt' },
];

export default function Hardware({ go }) {
  const [tab, setTab] = useState('gpu');
  const T = useTweaks();
  const s = T.sys.data;
  const st = T.status.data || {};
  const tw = (T.list.data || []).filter((t) => t.hw.includes(tab) && (!t.vendor || !s || s.gpus.some((g) => g.kind === t.vendor)));
  const exclusive = tw.filter((t) => t.cat === 'hardware');
  const shared = tw.filter((t) => t.cat !== 'hardware');
  const rows = (arr) => arr.map((t) => <TweakRow key={t.id} t={t} applied={!!st[t.id]} busy={!!T.busy[t.id]} onToggle={(tt, v) => T.run([tt], v)} onLink={go} />);

  return (
    <>
      <PageHeader title="Hardware" desc="O hardware detectado e os ajustes relevantes para cada peça." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {T.needReboot && <RebootBanner />}
      {!s ? <Loading text="Detectando hardware..." /> : <Detected tab={tab} s={s} />}
      {tab === 'timer' && <TimerCard />}
      {tab === 'storage' && <TrimCard />}
      {tab === 'msi' && <MsiCard />}
      {tab === 'input' && <InputCard />}
      {exclusive.length > 0 && <Card className="flush" title="Ajustes exclusivos desta aba" icon="bolt"><div className="tlist">{rows(exclusive)}</div></Card>}
      {shared.length > 0 && <Card className="flush" title="Ajustes relacionados (também na aba Ajustes)" icon="sliders"><div className="tlist">{rows(shared)}</div></Card>}
    </>
  );
}

function Detected({ tab, s }) {
  if (tab === 'gpu') return <Card title="Placas de vídeo" icon="gpu"><div className="grid g2">{s.gpus.map((g, i) => <Stat key={i} icon="gpu" label={`${g.vendor} · ${g.kind.toUpperCase()}`} value={g.model} sub={`${g.vram ? fmtBytes(g.vram * 1048576, 0) + ' VRAM · ' : ''}driver ${g.driver || '?'}`} />)}
    {s.displays.map((d, i) => <Stat key={`d${i}`} icon="info" label="Monitor" value={d.model || 'Monitor'} sub={`${d.res} ${d.hz ? `@ ${d.hz} Hz` : ''}`} />)}</div></Card>;
  if (tab === 'cpu') return <Card title="Processador" icon="cpu"><div className="grid g3">
    <Stat label="Modelo" value={s.cpu.brand} /><Stat label="Núcleos / threads" value={`${s.cpu.physicalCores} / ${s.cpu.cores}`} sub={s.cpu.hybrid ? `${s.cpu.pCores} P-cores + ${s.cpu.eCores} E-cores` : ''} />
    <Stat label="Clock" value={`${s.cpu.speed || '?'} GHz`} sub={s.cpu.speedMax ? `até ${s.cpu.speedMax} GHz` : ''} /></div>
    {s.cpu.x3d && <div style={{ marginTop: 12 }}><Callout tone="warn">CPU com 3D V-Cache: não desative/remova a Xbox Game Bar.</Callout></div>}</Card>;
  if (tab === 'ram') return <Card title="Memória" icon="memory"><div className="grid g3"><Stat label="Total" value={fmtBytes(s.ram.total, 0)} />
    {s.ram.modules.map((m, i) => <Stat key={i} label={m.slot || `Módulo ${i + 1}`} value={`${fmtBytes(m.size, 0)} ${m.type || ''}`} sub={`${m.clock ? `${m.clock} MT/s · ` : ''}${m.maker || ''} ${m.part || ''}`} />)}</div></Card>;
  if (tab === 'storage') return <Card title="Discos" icon="disk"><div className="grid g3">{s.disks.map((d, i) => <Stat key={i} label={`${d.type} · ${d.iface || ''}`} value={d.name} sub={fmtBytes(d.size, 0)} />)}</div></Card>;
  return null;
}

function TimerCard() {
  const info = useCall('hw.timerInfo');
  const set = useCall('settings.get');
  const d = info.data;
  async function toggle(v) { await call(v ? 'hw.timerStart' : 'hw.timerStop'); setTimeout(info.reload, 600); }
  async function keep(v) { set.setData(await call('settings.set', { keepTimerResolution: v })); setTimeout(info.reload, 600); }
  return (
    <Card title="Resolução do timer" icon="timer" actions={<Button small icon="refresh" onClick={info.reload} />}>
      {info.loading ? <Loading /> : d && (
        <div className="grid g3">
          <Stat label="Atual" value={`${d.current.toFixed(3)} ms`} /><Stat label="Mais fina possível" value={`${d.finest.toFixed(3)} ms`} /><Stat label="Padrão (mais grossa)" value={`${d.coarsest.toFixed(3)} ms`} />
        </div>
      )}
      <div className="row between" style={{ marginTop: 16 }}>
        <div><strong>Manter o timer na menor resolução enquanto o app estiver aberto</strong><div className="muted small">Reduz a latência de agendamento. Combine com "Resolução global do timer" no Windows 11.</div></div>
        <Toggle checked={!!(d && d.active)} onChange={toggle} />
      </div>
      <div className="row between" style={{ marginTop: 12 }}>
        <div><strong>Ativar sempre que o app abrir</strong></div>
        <Toggle checked={!!(set.data && set.data.keepTimerResolution)} onChange={keep} />
      </div>
    </Card>
  );
}

function TrimCard() {
  const vols = useCall('hw.volumes');
  const [busy, setBusy] = useState('');
  async function run(v, mode) {
    setBusy(v.letter + mode);
    try { await call('hw.optimize', v.letter, mode); toast(`${v.letter}: ${mode === 'trim' ? 'TRIM' : 'desfragmentação'} concluído.`); } catch {} finally { setBusy(''); }
  }
  return (
    <Card className="flush" title="TRIM e desfragmentação" icon="disk">
      {vols.loading ? <Loading /> : (vols.data || []).map((v) => {
        const ssd = /SSD/i.test(v.media);
        return (
          <div className="list-item" key={v.letter}>
            <strong style={{ width: 34 }}>{v.letter}:</strong>
            <div style={{ flex: 1 }}><div>{v.label || 'Disco local'} <Badge>{v.media}</Badge> <Badge>{v.fs}</Badge></div><div className="muted small">{fmtBytes(v.free)} livres de {fmtBytes(v.size)}</div></div>
            <Button small icon="bolt" loading={busy === v.letter + 'trim'} onClick={() => run(v, 'trim')}>TRIM</Button>
            <Button small icon="refresh" loading={busy === v.letter + 'defrag'} disabled={ssd} title={ssd ? 'Não desfragmente SSDs' : ''} onClick={() => run(v, 'defrag')}>Desfragmentar</Button>
          </div>
        );
      })}
    </Card>
  );
}

function MsiCard() {
  const msi = useCall('hw.msiList');
  const [busy, setBusy] = useState('');
  async function set(d, v) {
    if (v && !(await confirm({ title: `Ligar MSI em ${d.name}?`, text: 'O registro do dispositivo é salvo antes (aba Restaurar). Pede reinício. Se o dispositivo parar de funcionar, desligue aqui ou restaure o backup.', ok: 'Ligar' }))) return;
    setBusy(d.id);
    try { await call('hw.msiSet', d.id, v); msi.setData((l) => l.map((x) => (x.id === d.id ? { ...x, msi: v } : x))); toast('Alterado. Reinicie para aplicar.'); } catch {} finally { setBusy(''); }
  }
  return (
    <Card className="flush" title="Message Signaled Interrupts por dispositivo" icon="bolt" actions={<Button small icon="refresh" onClick={msi.reload} />}>
      <div style={{ padding: '0 16px 10px' }} className="muted small">MSI reduz a latência de interrupções. GPUs NVIDIA recentes e controladoras NVMe geralmente já vêm com MSI ligado.</div>
      {msi.loading ? <Loading /> : !(msi.data || []).length ? <Empty title="Nenhum dispositivo PCI encontrado" /> : (
        <div className="scroll"><table className="table"><thead><tr><th>Dispositivo</th><th>Classe</th><th>Estado</th><th style={{ width: 70 }}>MSI</th></tr></thead>
          <tbody>{msi.data.map((d) => (
            <tr key={d.id}><td><div>{d.name}</div><div className="muted small mono trunc" style={{ maxWidth: 520 }}>{d.id}</div></td><td>{d.cls}</td>
              <td>{d.msi === null ? <Badge>não definido</Badge> : d.msi ? <Badge tone="ok">ligado</Badge> : <Badge>desligado</Badge>}</td>
              <td><Toggle checked={!!d.msi} busy={busy === d.id} onChange={(v) => set(d, v)} /></td></tr>
          ))}</tbody></table></div>
      )}
    </Card>
  );
}

function InputCard() {
  const p = useCall('hw.peripherals');
  if (p.loading) return <Loading />;
  const d = p.data;
  if (!d) return null;
  return (
    <Card title="Dispositivos de entrada" icon="mouse">
      <div className="grid g2">
        <div>{(d.mice || []).map((m, i) => <Stat key={i} icon="mouse" label={m.maker || 'Mouse'} value={m.name} />)}</div>
        <div>{(d.keyboards || []).map((k, i) => <Stat key={i} icon="info" label="Teclado" value={k.desc || k.name} />)}</div>
      </div>
      <div className="row" style={{ marginTop: 12 }}><Badge tone={d.accel ? 'warn' : 'ok'}>{d.accel ? 'Aceleração do mouse ligada' : 'Aceleração do mouse desligada'}</Badge><Badge>Sensibilidade {d.mouseSpeed}/20</Badge></div>
    </Card>
  );
}
