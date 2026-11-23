import { useState } from 'react';
import { Card, PageHeader, Loading, Button, Empty, Badge, Callout, confirm } from '../ui';
import { call, useCall, fmtDate, toast } from '../lib';

const TYPES = { 0: 'Instalação', 1: 'Desinstalação', 10: 'Driver', 12: 'Configuração', 13: 'Cancelado' };

export default function Restore() {
  const rps = useCall('restore.list');
  const regs = useCall('restore.regBackups');
  const applied = useCall('tweaks.applied');
  const [busy, setBusy] = useState('');
  const [desc, setDesc] = useState('');

  async function create() { setBusy('create'); try { await call('restore.create', desc || undefined); toast('Ponto de restauração criado.'); setDesc(''); rps.reload(); } catch {} finally { setBusy(''); } }
  async function restoreTo(p) { if (await confirm({ title: 'Restaurar o sistema?', text: `O Windows volta para "${p.desc}" (${fmtDate(p.at)}) e REINICIA imediatamente. Programas instalados depois disso podem ser removidos; seus arquivos pessoais não são afetados.`, danger: true, ok: 'Restaurar e reiniciar' })) call('restore.restore', p.seq); }
  async function del(p) { if (await confirm({ title: 'Apagar ponto de restauração?', text: p.desc, danger: true, ok: 'Apagar' })) { setBusy(`d${p.seq}`); try { await call('restore.delete', p.seq); rps.reload(); } catch {} finally { setBusy(''); } } }
  async function delAll() { if (await confirm({ title: 'Apagar TODOS os pontos de restauração?', text: 'Executa vssadmin delete shadows /all — também apaga cópias de sombra de outros programas. Não pode ser desfeito.', danger: true, ok: 'Apagar todos' })) { setBusy('all'); try { await call('restore.deleteAll'); rps.reload(); } catch {} finally { setBusy(''); } } }
  async function regRestore(b) { if (await confirm({ title: 'Restaurar este backup do Registro?', text: `${b.label}\n${b.file}`, ok: 'Restaurar' })) { setBusy(b.id); try { await call('restore.regRestore', b.id); toast('Backup do Registro reimportado.'); } catch {} finally { setBusy(''); } } }
  async function undoAll() {
    const ids = (applied.data || []).filter((a) => !a.noUndo).map((a) => a.id);
    if (!(await confirm({ title: `Desfazer ${ids.length} ajuste(s)?`, text: 'Cada ajuste volta exatamente ao valor que existia antes.', ok: 'Desfazer todos' }))) return;
    setBusy('undo'); try { const r = await call('tweaks.unapply', ids); toast(`${Object.values(r).filter((x) => x.ok).length} desfeitos.`); applied.reload(); } catch {} finally { setBusy(''); }
  }

  return (
    <>
      <PageHeader title="Restaurar" desc="Pontos de restauração do Windows, backups do Registro feitos pelo app e a lista de ajustes aplicados." />
      <Card className="flush" title="Pontos de restauração do Windows" icon="history" actions={<>
        <input className="inp" placeholder="Descrição (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ height: 28 }} />
        <Button small variant="primary" icon="plus" loading={busy === 'create'} onClick={create}>Criar agora</Button>
        <Button small variant="danger" loading={busy === 'all'} onClick={delAll}>Apagar todos</Button>
      </>}>
        <div style={{ height: 6 }} />
        {rps.loading ? <Loading /> : !(rps.data || []).length ? <Empty title="Nenhum ponto de restauração">Crie um antes de grandes mudanças. Se a Proteção do Sistema estiver desligada, o app tenta ligá-la no disco do Windows.</Empty> : rps.data.map((p) => (
          <div className="list-item" key={p.seq}>
            <div style={{ flex: 1, minWidth: 0 }}><strong className="trunc">{p.desc}</strong> {/WindowsBoost/.test(p.desc) && <Badge tone="accent">Windows Boost</Badge>}<div className="muted small">{fmtDate(p.at)} · {TYPES[p.type] || `tipo ${p.type}`} · nº {p.seq}</div></div>
            <Button small icon="undo" onClick={() => restoreTo(p)}>Restaurar</Button>
            <Button small variant="ghost" icon="x" loading={busy === `d${p.seq}`} onClick={() => del(p)} title="Apagar" />
          </div>
        ))}
      </Card>
      <Card className="flush" title="Backups do Registro (.reg)" icon="sliders" actions={<Button small icon="folder" onClick={() => call('app.openBackups')}>Abrir pasta</Button>}>
        <div style={{ height: 6 }} />
        {!(regs.data || []).length ? <Empty title="Nenhum backup">São criados automaticamente pela Limpeza do Registro, Modo MSI e Desinstalador.</Empty> : regs.data.map((b) => (
          <div className="list-item" key={b.id}>
            <div style={{ flex: 1, minWidth: 0 }}><strong>{b.label}</strong>{!b.exists && <Badge tone="danger">arquivo sumiu</Badge>}<div className="muted small mono trunc">{fmtDate(b.at)} · {b.file}</div></div>
            <Button small icon="undo" disabled={!b.exists} loading={busy === b.id} onClick={() => regRestore(b)}>Restaurar</Button>
            <Button small variant="ghost" icon="x" onClick={async () => { await call('restore.regDelete', b.id); regs.reload(); }} title="Apagar backup" />
          </div>
        ))}
      </Card>
      <Card className="flush" title={`Ajustes aplicados (${(applied.data || []).length})`} icon="sliders" actions={<Button small icon="undo" disabled={!(applied.data || []).some((a) => !a.noUndo)} loading={busy === 'undo'} onClick={undoAll}>Desfazer todos</Button>}>
        <div style={{ height: 6 }} />
        {!(applied.data || []).length ? <Empty title="Nenhum ajuste aplicado pelo app" /> : applied.data.map((a) => (
          <div className="list-item" key={a.id}><div style={{ flex: 1 }}>{a.name} {a.noUndo && <Badge tone="danger">sem desfazer</Badge>}<div className="muted small">{fmtDate(a.at)}</div></div>
            {!a.noUndo && <Button small icon="undo" onClick={async () => { await call('tweaks.unapply', [a.id]); applied.reload(); }}>Desfazer</Button>}
            <Button small icon="refresh" title="Reaplicar" onClick={async () => { await call('tweaks.apply', [a.id]); applied.reload(); toast('Reaplicado.'); }} />
          </div>
        ))}
      </Card>
      <Callout tone="info">Ajustes "sem desfazer" (perfil NVIDIA, remover apps de jogos, OneDrive) dependem do ponto de restauração criado automaticamente antes de aplicá-los.</Callout>
    </>
  );
}
