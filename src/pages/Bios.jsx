import { useEffect, useState } from 'react';
import { Card, PageHeader, Loading, Button, Toggle, Badge, Callout, Check, Tabs, Empty, confirm } from '../ui';
import { call, useCall, fmtDate, toast } from '../lib';

const VENDORS = [{ id: 'asus', label: 'ASUS' }, { id: 'msi', label: 'MSI' }, { id: 'gigabyte', label: 'Gigabyte' }, { id: 'asrock', label: 'ASRock' }];
const BOOT = [
  { key: 'disabledynamictick', name: 'Desativar dynamic tick', desc: 'bcdedit /set disabledynamictick yes' },
  { key: 'noplatformclock', name: 'Remover useplatformclock / useplatformtick', desc: 'Deixa o Windows usar o TSC (padrão moderno). Sem desfazer direto — use o backup do BCD.' },
  { key: 'tscsyncpolicy', name: 'tscsyncpolicy enhanced', desc: 'bcdedit /set tscsyncpolicy enhanced' },
  { key: 'hypervisoroff', name: 'Desligar o hipervisor', desc: 'hypervisorlaunchtype off — QUEBRA WSL2, Docker, Hyper-V, Sandbox e VBS.', danger: true },
];

export default function Bios({ go }) {
  const info = useCall('bios.info');
  const [vendor, setVendor] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [tab, setTab] = useState('guide');
  const i = info.data;
  useEffect(() => { if (i) { setVendor(i.vendor !== 'other' ? i.vendor : 'asus'); setPlatform(i.platform); } }, [i]);

  return (
    <>
      <PageHeader title="BIOS" desc="Leitura da placa, guia de ajustes de latência para cada fabricante, gravação direta na NVRAM (placas AMI, via SCEWIN) e ajustes de boot."
        actions={<Button icon="reboot" onClick={async () => { if (await confirm({ title: 'Reiniciar direto na BIOS/UEFI?', text: 'Salve seus trabalhos. O PC reinicia em 5 segundos e abre a configuração do firmware.', ok: 'Reiniciar' })) call('bios.rebootFirmware'); }}>Reiniciar na BIOS/UEFI</Button>} />
      <Card title="Placa e firmware" icon="bios">
        {info.loading ? <Loading /> : i && (
          <dl className="kv">
            <dt>Placa-mãe</dt><dd>{i.boardMaker} {i.boardModel}</dd>
            <dt>BIOS</dt><dd>{i.biosVendor} · {i.biosVersion} {i.biosDate && `(${i.biosDate})`} {i.ami && <Badge tone="accent">AMI</Badge>}</dd>
            <dt>Processador</dt><dd>{i.cpu}</dd>
            <dt>Soquete</dt><dd>{i.socketName}</dd>
            <dt>Firmware</dt><dd>{i.firmware} · Secure Boot: {i.secureBoot === true ? 'ligado' : i.secureBoot === false ? 'desligado' : 'n/d'}</dd>
            <dt>Tabelas ACPI</dt><dd className="mono">{(i.acpi || []).join(', ') || '—'}</dd>
          </dl>
        )}
      </Card>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'guide', label: 'Guia de ajustes', count: 38 }, { id: 'scewin', label: 'Gravar na NVRAM (SCEWIN)' }, { id: 'boot', label: 'Ajustes de boot' }]} />
      {tab === 'guide' && platform && <Guide platform={platform} setPlatform={setPlatform} vendor={vendor} setVendor={setVendor} />}
      {tab === 'scewin' && <Scewin ami={i && i.ami} go={go} />}
      {tab === 'boot' && <Boot go={go} />}
    </>
  );
}

function Guide({ platform, setPlatform, vendor, setVendor }) {
  const g = useCall('bios.guide', [platform, vendor], [platform, vendor]);
  const cats = ['CPU', 'Memória', 'Energia', 'Geral'];
  return (
    <>
      <div className="row">
        <select className="inp" value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="amd">AMD</option><option value="intel">Intel</option></select>
        <select className="inp" value={vendor} onChange={(e) => setVendor(e.target.value)}>{VENDORS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select>
        <span className="muted small">Caminhos típicos — podem variar com a versão da BIOS. Use a busca do menu avançado (F3/Ctrl+F) se não achar.</span>
      </div>
      {g.loading ? <Loading /> : cats.map((c) => {
        const items = (g.data || []).filter((x) => x.cat === c);
        if (!items.length) return null;
        return (
          <Card key={c} className="flush" title={c} icon="bios">
            <table className="table"><thead><tr><th style={{ width: '22%' }}>Opção</th><th style={{ width: '18%' }}>Valor alvo</th><th>Onde fica</th><th style={{ width: '28%' }}>Impacto / contrapartida</th></tr></thead>
              <tbody>{items.map((x) => (
                <tr key={x.id}><td><strong>{x.name}</strong></td><td><Badge tone="accent">{x.target}</Badge></td><td className="mono small">{x.path || '—'}{x.note && <div className="muted small" style={{ fontFamily: 'var(--font)', marginTop: 4 }}>{x.note}</div>}</td>
                  <td className="small"><div>{x.impact}</div><div className="muted">{x.tradeoff}</div></td></tr>
              ))}</tbody></table>
          </Card>
        );
      })}
    </>
  );
}

function Scewin({ ami, go }) {
  const [exp, setExp] = useState(null);
  const [busy, setBusy] = useState('');
  const [sel, setSel] = useState({});
  const [result, setResult] = useState(null);
  const backups = useCall('bios.backups');
  async function doExport() {
    setBusy('export'); setResult(null);
    try { const r = await call('bios.export'); setExp(r); setSel({}); backups.reload(); toast(`${r.total} opções lidas; backup salvo.`); } catch {} finally { setBusy(''); }
  }
  const changes = exp ? exp.matches.flatMap((m) => m.questions.filter((q) => sel[`${m.id}|${q.name}|${q.token}`] && q.target && !q.ok).map((q) => ({ name: q.name, token: q.token, target: q.target }))) : [];
  async function apply() {
    if (!(await confirm({ title: `Gravar ${changes.length} opção(ões) na NVRAM?`, list: changes.map((c) => `${c.name} → ${c.target}`), warn: 'Isto altera o firmware. Um valor errado pode impedir o boot até zerar o CMOS (jumper/bateria). O backup completo já foi feito na exportação.', danger: true, ok: 'Gravar' }))) return;
    setBusy('apply');
    try { setResult(await call('bios.apply', changes)); } catch {} finally { setBusy(''); }
  }
  async function restore(f) {
    if (!(await confirm({ title: 'Restaurar este backup da BIOS?', text: f.file, danger: true, ok: 'Restaurar' }))) return;
    setBusy(f.file); try { await call('bios.restore', f.file); toast('Backup reimportado. Reinicie para valer.'); } catch {} finally { setBusy(''); }
  }
  return (
    <>
      {ami === false && <Callout tone="warn">Sua BIOS não parece ser AMI — o SCEWIN provavelmente não funciona nesta placa. Use o guia e altere manualmente.</Callout>}
      <Callout tone="info" title="Como funciona">O app não inclui nem baixa o SCEWIN (ferramenta proprietária da AMI). Se você tiver o SCEWIN_64.exe com os drivers amifldrv64.sys/amigendrv64.sys, indique a pasta em <a href="#" onClick={(e) => { e.preventDefault(); go('settings'); }}>Configurações</a>. O fluxo é: exportar (backup) → escolher → gravar → conferir.</Callout>
      <Card title="NVRAM" icon="bios" actions={<>
        <Button small icon="download" loading={busy === 'export'} onClick={doExport}>Exportar e analisar</Button>
        <Button small variant="primary" icon="check" disabled={!changes.length} loading={busy === 'apply'} onClick={apply}>Gravar {changes.length || ''}</Button>
      </>}>
        {!exp ? <Empty icon="bios" title="Exporte a BIOS para começar" /> : exp.matches.length === 0 ? <Empty title="Nenhuma opção do guia foi encontrada nesta BIOS" /> : (
          <table className="table"><thead><tr><th style={{ width: 40 }} /><th>Item do guia</th><th>Opção na BIOS</th><th>Atual</th><th>Alvo</th></tr></thead>
            <tbody>{exp.matches.flatMap((m) => m.questions.map((q) => {
              const k = `${m.id}|${q.name}|${q.token}`;
              return (<tr key={k}><td><Check checked={!!sel[k]} disabled={q.ok || !q.target} onChange={(v) => setSel((s) => ({ ...s, [k]: v }))} /></td>
                <td>{m.name}</td><td className="mono small">{q.name}</td><td>{q.current || '—'}</td>
                <td>{q.ok ? <Badge tone="ok">já está</Badge> : q.target ? <Badge tone="accent">{q.target}</Badge> : <span className="muted small">sem opção equivalente</span>}</td></tr>);
            }))}</tbody></table>
        )}
        {result && <div style={{ marginTop: 12 }}><Callout tone={result.every((r) => r.ok) ? 'ok' : 'warn'} title="Conferência após gravar">{result.map((r) => <div key={r.name}>{r.ok ? '✔' : '✖'} {r.name}: {r.now || '?'} (desejado: {r.wanted})</div>)}<div style={{ marginTop: 6 }}>Reinicie o PC para as mudanças valerem.</div></Callout></div>}
      </Card>
      <Card className="flush" title="Backups da BIOS" icon="history">
        {!(backups.data || []).length ? <Empty title="Nenhum backup ainda" /> : backups.data.map((b) => (
          <div className="list-item" key={b.file}><div style={{ flex: 1, minWidth: 0 }}><div className="trunc mono small">{b.file}</div><div className="muted small">{fmtDate(b.at)}</div></div>
            <Button small icon="undo" loading={busy === b.file} onClick={() => restore(b)}>Restaurar</Button></div>
        ))}
      </Card>
    </>
  );
}

function Boot({ go }) {
  const st = useCall('bios.bootState');
  const bk = useCall('bios.bcdBackups');
  const [busy, setBusy] = useState('');
  async function set(b, v) {
    if (v && b.danger && !(await confirm({ title: b.name, text: b.desc, danger: true, ok: 'Aplicar' }))) return;
    setBusy(b.key);
    try { st.setData(await call('bios.bootSet', b.key, v)); bk.reload(); toast('Feito. Reinicie para valer.'); } catch {} finally { setBusy(''); }
  }
  return (
    <>
      <Card className="flush" title="Configuração de boot (bcdedit)" icon="bios" actions={<Button small icon="refresh" onClick={st.reload} />}>
        <div style={{ padding: '0 16px 8px' }} className="muted small">Antes de cada alteração é feito um backup completo do BCD.</div>
        {st.loading ? <Loading /> : BOOT.map((b) => (
          <div className="list-item" key={b.key}><div style={{ flex: 1 }}><strong>{b.name}</strong> {b.danger && <Badge tone="danger">quebra virtualização</Badge>}<div className="muted small">{b.desc}</div></div>
            <Toggle checked={!!(st.data && st.data[b.key])} busy={busy === b.key} onChange={(v) => set(b, v)} disabled={b.key === 'noplatformclock' && st.data && st.data[b.key]} /></div>
        ))}
        <div className="list-item"><div style={{ flex: 1 }}><strong>Inicialização Rápida, Modern Standby (S3) e Integridade de Memória</strong><div className="muted small">Estão na aba Ajustes (Desempenho) — com desfazer automático.</div></div><Button small icon="chevron" onClick={() => go('tweaks')}>Abrir Ajustes</Button></div>
      </Card>
      <Card className="flush" title="Backups do BCD" icon="history">
        {!(bk.data || []).length ? <Empty title="Nenhum backup ainda" /> : bk.data.map((b) => (
          <div className="list-item" key={b.file}><div style={{ flex: 1, minWidth: 0 }}><div className="trunc mono small">{b.file}</div><div className="muted small">{fmtDate(b.at)}</div></div>
            <Button small icon="undo" onClick={async () => { if (await confirm({ title: 'Restaurar o BCD?', text: 'Substitui toda a configuração de boot pelo backup.', danger: true, ok: 'Restaurar' })) { st.setData(await call('bios.bcdRestore', b.file)); toast('BCD restaurado.'); } }}>Restaurar</Button></div>
        ))}
      </Card>
    </>
  );
}
