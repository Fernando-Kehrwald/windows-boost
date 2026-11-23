// Pontos de restauração do Windows e backups de registro feitos pelo app.
const fs = require('fs');
const path = require('path');
const ps = require('../ps');
const store = require('../store');
const log = require('../log');

let backupDir = null;
function init(dir) { backupDir = dir; fs.mkdirSync(dir, { recursive: true }); }

async function createRestorePoint(description) {
  const desc = (description || `WindowsBoost-${new Date().toLocaleString('pt-BR')}`).slice(0, 250);
  log.info(`Criando ponto de restauração: ${desc}`);
  await ps.run(`Set-RegValue 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore' 'SystemRestorePointCreationFrequency' 0
try { Enable-ComputerRestore -Drive "$env:SystemDrive\\" } catch {}
Checkpoint-Computer -Description ${ps.q(desc)} -RestorePointType MODIFY_SETTINGS`, { timeout: 5 * 60 * 1000 });
  store.update((d) => { d.lastRestorePointAt = Date.now(); });
  return true;
}

/** Cria um ponto automático antes de mudanças, no máximo 1 a cada 10 min. Nunca bloqueia a operação se falhar. */
async function ensureRestorePoint(reason) {
  const st = store.get();
  if (!st.settings.autoRestorePoint) return { skipped: true };
  if (Date.now() - (st.lastRestorePointAt || 0) < 10 * 60 * 1000) return { skipped: true, recent: true };
  try {
    await createRestorePoint(`WindowsBoostBackup-${reason || 'ajustes'}-${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
    return { created: true };
  } catch (e) {
    log.warn(`Não foi possível criar o ponto de restauração: ${e.message}`);
    return { error: e.message };
  }
}

async function listRestorePoints() {
  return ps.json(`$r = @(Get-ComputerRestorePoint -ErrorAction SilentlyContinue | ForEach-Object {
  @{ seq = $_.SequenceNumber; desc = $_.Description; type = [int]$_.RestorePointType
     at = ([Management.ManagementDateTimeConverter]::ToDateTime($_.CreationTime)).ToString('o') } })
Out-Json @{ items = $r }`).then((r) => (r.items || []).sort((a, b) => b.seq - a.seq));
}

async function restoreTo(seq) {
  log.warn(`Restaurando o sistema para o ponto ${seq} (o PC vai reiniciar).`);
  await ps.run(`Restore-Computer -RestorePoint ${Number(seq)} -Confirm:$false`);
  return true;
}

async function deleteRestorePoint(seq) {
  await ps.run(`Add-Type -Namespace WB -Name SR -MemberDefinition '[DllImport("srclient.dll")] public static extern int SRRemoveRestorePoint(int index);'
$r = [WB.SR]::SRRemoveRestorePoint(${Number(seq)}); if ($r -ne 0) { throw "Falha ao apagar o ponto (código $r)" }`);
  return true;
}

async function deleteAllRestorePoints() {
  await ps.run(`Exec vssadmin delete shadows /for=$env:SystemDrive /all /quiet | Out-Null`);
  return true;
}

// ---------------- backups de registro (.reg) ----------------
/** Exporta as chaves para um único .reg e registra no histórico. Retorna o registro do backup. */
async function backupRegistryKeys(keys, label) {
  const uniq = [...new Set(keys.filter(Boolean))];
  if (!uniq.length) return null;
  const id = `${Date.now()}`;
  const file = path.join(backupDir, `reg-${id}.reg`);
  await ps.run(`$keys = ${ps.data(uniq)}
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('Windows Registry Editor Version 5.00')
foreach ($k in $keys) {
  $tmp = [IO.Path]::GetTempFileName()
  Run reg export $k $tmp /y | Out-Null
  if ((Test-Path $tmp) -and (Get-Item $tmp).Length -gt 0) {
    $t = [IO.File]::ReadAllText($tmp) -replace '^\\s*Windows Registry Editor Version 5\\.00\\s*', ''
    [void]$sb.AppendLine(''); [void]$sb.Append($t)
  }
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}
[IO.File]::WriteAllText(${ps.q(file)}, $sb.ToString(), [Text.Encoding]::Unicode)`);
  const entry = { id, at: Date.now(), label, file, keys: uniq.length };
  store.update((d) => { d.regBackups.unshift(entry); });
  log.info(`Backup de registro criado: ${label} (${file})`);
  return entry;
}

function listRegBackups() {
  return store.get().regBackups.map((b) => ({ ...b, exists: fs.existsSync(b.file) }));
}
async function restoreRegBackup(id) {
  const b = store.get().regBackups.find((x) => x.id === id);
  if (!b) throw new Error('Backup não encontrado.');
  await ps.run(`Exec reg import ${ps.q(b.file)} | Out-Null`);
  log.info(`Backup de registro restaurado: ${b.label}`);
  return true;
}
function deleteRegBackup(id) {
  const b = store.get().regBackups.find((x) => x.id === id);
  if (b) try { fs.unlinkSync(b.file); } catch {}
  store.update((d) => { d.regBackups = d.regBackups.filter((x) => x.id !== id); });
  return true;
}

module.exports = {
  init, createRestorePoint, ensureRestorePoint, listRestorePoints, restoreTo, deleteRestorePoint, deleteAllRestorePoints,
  backupRegistryKeys, listRegBackups, restoreRegBackup, deleteRegBackup,
  get backupDir() { return backupDir; },
};
