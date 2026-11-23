import { useEffect, useState } from 'react';
import { Card, PageHeader, Meter, Stat, Callout, Loading, Button, Spinner, confirm } from '../ui';
import Icon from '../icons';
import { call, callQuiet, on, fmtBytes, pct, toast, useCall } from '../lib';

export default function Dashboard({ go, info, gm }) {
  const st = useCall('sys.static');
  const disks = useCall('sys.disks');
  const applied = useCall('tweaks.applied');
  const [live, setLive] = useState({});
  const [busy, setBusy] = useState('');

  useEffect(() => {
    callQuiet('sys.monitorStart').catch(() => {});
    const off = on('monitor', setLive);
    return () => { off(); callQuiet('sys.monitorStop').catch(() => {}); };
  }, []);

  const s = st.data;
  const gpu = s && s.gpus && s.gpus[0];
  const ramUsed = live.ramTotal ? live.ramTotal - live.ramFree : null;

  async function quick(kind) {
    setBusy(kind);
    try {
      if (kind === 'rec') {
        const list = await call('tweaks.list');
        const rec = list.filter((t) => t.rec && !t.link);
        if (!(await confirm({ title: 'Aplicar ajustes recomendados', text: `Serão aplicados ${rec.length} ajustes marcados como recomendados. Um ponto de restauração é criado antes.`, list: rec.map((t) => t.name), ok: 'Aplicar' }))) return;
        const r = await call('tweaks.apply', rec.map((t) => t.id));
        const ok = Object.values(r).filter((x) => x.ok).length;
        toast(`${ok} de ${rec.length} ajustes aplicados${Object.values(r).some((x) => x.ok && x.reboot) ? ' — reinicie para concluir' : ''}.`, ok === rec.length ? 'ok' : 'warn');
        applied.reload();
      } else if (kind === 'ram') {
        const r = await call('ram.clean');
        toast(`Memória liberada: ${fmtBytes(r.freed)}`);
      } else if (kind === 'clean') {
        const list = await call('clean.list');
        const ids = list.filter((i) => i.group === 'windows' && i.def).map((i) => i.id);
        if (!(await confirm({ title: 'Limpeza rápida', text: 'Remove temporários, cache do Windows Update, relatórios de erro, miniaturas e esvazia a Lixeira.', ok: 'Limpar' }))) return;
        const r = await call('clean.run', ids, {});
        toast(`Limpeza concluída: ${fmtBytes(Object.values(r).reduce((a, x) => a + (x.freed || 0), 0))} liberados.`);
        disks.reload();
      } else if (kind === 'game') {
        if (gm && gm.active) await call('gm.stop'); else await call('gm.start', null);
      }
    } catch {} finally { setBusy(''); }
  }

  return (
    <>
      <PageHeader title="Início" desc="Visão geral do seu PC e atalhos rápidos. Tudo roda localmente — nada é enviado para fora." />
      {info && !info.windows && <Callout tone="warn" title="Modo de pré-visualização">Este ambiente não é Windows; as ações não terão efeito.</Callout>}
      {info && info.windows && !info.admin && <Callout tone="danger" title="Sem privilégios de administrador">Abra o Windows Boost como administrador para que os ajustes funcionem.</Callout>}

      <div className="hero">
        <Card className="hero-card" title="Uso em tempo real" icon="bolt">
          <div className="grid g2" style={{ gap: 18 }}>
            <Meter label="Processador" value={live.cpu} sub={s ? `${s.cpu.physicalCores} núcleos / ${s.cpu.cores} threads` : ''} />
            <Meter label="Memória RAM" value={ramUsed !== null ? pct(ramUsed, live.ramTotal) : null} sub={ramUsed !== null ? `${fmtBytes(ramUsed)} de ${fmtBytes(live.ramTotal)}` : ''} />
            <Meter label="Placa de vídeo" value={live.gpu} sub={live.gpuTemp ? `${live.gpuTemp} °C` : gpu ? gpu.model : ''} />
            <Meter label="Memória de vídeo" value={live.vramUsed && (live.vramTotal || (gpu && gpu.vram)) ? pct(live.vramUsed, live.vramTotal || gpu.vram * 1048576) : null}
              sub={live.vramUsed ? `${fmtBytes(live.vramUsed)}${live.vramTotal ? ` de ${fmtBytes(live.vramTotal)}` : ''}` : ''} />
          </div>
        </Card>
        <Card title="Ações rápidas" icon="bolt">
          <div className="quick">
            <button onClick={() => quick('rec')} disabled={!!busy}><span className="qi">{busy === 'rec' ? <Spinner size={16} /> : <Icon name="star" />}</span><span><strong>Aplicar recomendados</strong><small>Pacote seguro de ajustes</small></span></button>
            <button onClick={() => quick('clean')} disabled={!!busy}><span className="qi">{busy === 'clean' ? <Spinner size={16} /> : <Icon name="broom" />}</span><span><strong>Limpeza rápida</strong><small>Temporários e caches</small></span></button>
            <button onClick={() => quick('ram')} disabled={!!busy}><span className="qi">{busy === 'ram' ? <Spinner size={16} /> : <Icon name="memory" />}</span><span><strong>Limpar RAM</strong><small>Standby e working sets</small></span></button>
            <button onClick={() => quick('game')} disabled={!!busy || (gm && gm.busy)}><span className="qi">{busy === 'game' ? <Spinner size={16} /> : <Icon name="game" />}</span><span><strong>{gm && gm.active ? 'Desligar Modo Jogo' : 'Ligar Modo Jogo'}</strong><small>{gm && gm.active ? `Ativo: ${gm.game}` : 'Desfaz tudo ao desligar'}</small></span></button>
          </div>
        </Card>
      </div>

      {st.loading ? <Loading text="Lendo informações do hardware..." /> : s && (
        <div className="grid g3">
          <Card title="Processador" icon="cpu"><Stat label={s.cpu.brand} value={`${s.cpu.physicalCores}C / ${s.cpu.cores}T`} sub={`${s.cpu.speed || '?'} GHz base${s.cpu.speedMax ? ` · ${s.cpu.speedMax} GHz máx.` : ''}${s.cpu.hybrid ? ` · ${s.cpu.pCores}P + ${s.cpu.eCores}E` : ''}`} />
            {s.cpu.x3d && <div style={{ marginTop: 10 }}><Callout tone="warn">CPU X3D detectada: mantenha a Xbox Game Bar instalada.</Callout></div>}</Card>
          <Card title="Placa de vídeo" icon="gpu">{s.gpus.length ? s.gpus.map((g, i) => <Stat key={i} label={g.vendor} value={g.model} sub={`${g.vram ? fmtBytes(g.vram * 1048576, 0) : ''}${g.driver ? ` · driver ${g.driver}` : ''}`} />) : <span className="muted">Não detectada</span>}</Card>
          <Card title="Memória" icon="memory"><Stat label={`${s.ram.modules.length} módulo(s)`} value={fmtBytes(s.ram.total, 0)} sub={s.ram.modules[0] ? `${s.ram.modules[0].type || ''} ${s.ram.modules[0].clock ? `${s.ram.modules[0].clock} MT/s` : ''}` : ''} /></Card>
          <Card title="Sistema" icon="info"><Stat label={`${s.system.maker || ''} ${s.system.model || ''}`} value={s.os.distro || 'Windows'} sub={`Build ${s.os.build || s.os.release || '?'} · ${s.os.arch || ''}`} /></Card>
          <Card title="Placa-mãe" icon="bios"><Stat label={s.board.maker} value={s.board.model || '—'} sub={`BIOS ${s.bios.version || '?'}${s.bios.date ? ` (${s.bios.date})` : ''}`} /></Card>
          <Card title="Ajustes aplicados" icon="sliders" actions={<Button small onClick={() => go('tweaks')}>Ver</Button>}>
            <div className="big-num">{applied.data ? applied.data.length : '—'}</div>
            <div className="muted small">registrados pelo app (podem ser desfeitos em Restaurar)</div>
          </Card>
        </div>
      )}

      <Card title="Discos" icon="disk" actions={<Button small icon="refresh" onClick={disks.reload} />}>
        {disks.loading ? <Loading /> : (
          <div className="grid g3">
            {(disks.data || []).map((d) => <Meter key={d.mount} label={`${d.mount} (${d.fs})`} value={d.use} sub={`${fmtBytes(d.size - d.used)} livres de ${fmtBytes(d.size)}`} />)}
          </div>
        )}
        {s && s.disks.length > 0 && <div className="row muted small" style={{ marginTop: 12 }}>{s.disks.map((d, i) => <span key={i}>{d.name} · {d.type} · {fmtBytes(d.size, 0)}{i < s.disks.length - 1 ? '  |' : ''}</span>)}</div>}
      </Card>
    </>
  );
}
