// Limpeza de arquivos (Windows + programas + pastas personalizadas) e do Registro.
const ps = require('../ps');
const store = require('../store');
const log = require('../log');
const restore = require('./restore');
const defs = require('../data/cleaners');

const ALL = [...defs.windows, ...defs.programs];
const byId = Object.fromEntries(ALL.map((d) => [d.id, d]));

function list() {
  const custom = store.get().customCleanFolders.map((f, i) => ({ id: `custom_${i}`, group: 'custom', app: 'Pastas personalizadas', name: f, dirs: [f], def: true }));
  return [...ALL, ...custom].map(({ id, group, app, name, desc, procs, def }) => ({ id, group, app, name, desc, procs: procs || [], def: !!def }));
}
function resolve(ids) {
  const custom = store.get().customCleanFolders;
  return ids.map((id) => {
    if (id.startsWith('custom_')) { const f = custom[Number(id.slice(7))]; return f ? { id, dirs: [f] } : null; }
    const d = byId[id]; if (!d) return null;
    return { id, dirs: d.dirs || [], globs: d.globs || [], special: d.special || null, regKeys: d.regKeys || [], regValues: d.regValues || [], procs: d.procs || [] };
  }).filter(Boolean);
}

const COMMON = `
$sp = Get-RegValue 'HKCU\\Software\\Valve\\Steam' 'SteamPath'
$env:STEAM = if ($sp) { $sp -replace '/', '\\' } else { Join-Path \${env:ProgramFiles(x86)} 'Steam' }
function Expand-Targets($it) {
  $dirs = @(); $files = @()
  foreach ($d in @($it.dirs)) { if (-not $d) { continue }
    $x = [Environment]::ExpandEnvironmentVariables($d)
    if ($x -match '[*?]') { $dirs += @(Get-Item -Path $x -Force -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer } | ForEach-Object { $_.FullName }) }
    elseif (Test-Path -LiteralPath $x -PathType Container) { $dirs += $x } }
  foreach ($g in @($it.globs)) { if (-not $g) { continue }
    $x = [Environment]::ExpandEnvironmentVariables($g)
    $files += @(Get-ChildItem -Path $x -Force -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }) }
  # nunca toca em raízes de disco nem na pasta do Windows/usuário inteira
  $bad = @($env:SystemRoot, $env:USERPROFILE, $env:SystemDrive + '\\', $env:ProgramFiles, \${env:ProgramFiles(x86)}, $env:ProgramData, $env:APPDATA, $env:LOCALAPPDATA) | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\\').ToLower() }
  $dirs = @($dirs | Where-Object { $bad -notcontains $_.TrimEnd('\\').ToLower() })
  return @{ dirs = $dirs; files = $files }
}
function Measure-Targets($t) {
  $b = 0L; $n = 0
  foreach ($d in $t.dirs) { Get-ChildItem -LiteralPath $d -Recurse -Force -File -ErrorAction SilentlyContinue | ForEach-Object { $b += $_.Length; $n++ } }
  foreach ($f in $t.files) { try { $b += (Get-Item -LiteralPath $f -Force).Length; $n++ } catch {} }
  return @{ bytes = $b; files = $n }
}
function Get-RecycleSize { $b = 0L; $n = 0; try { $sh = New-Object -ComObject Shell.Application; foreach ($i in $sh.NameSpace(10).Items()) { $b += [int64]$i.Size; $n++ } } catch {}; return @{ bytes = $b; files = $n } }
`;

async function scan(ids) {
  const items = resolve(ids);
  const r = await ps.json(`$items = ${ps.data(items)}
${COMMON}
$out = @{}
$running = @{}
$procs = @(Get-Process | ForEach-Object { $_.ProcessName.ToLower() })
foreach ($it in $items) {
  if ($it.special -eq 'recyclebin') { $m = Get-RecycleSize }
  else { $m = Measure-Targets (Expand-Targets $it) }
  $rk = 0; foreach ($k in @($it.regKeys)) { if ($k) { $kk = Open-RegKey $k $false $false; if ($kk) { $rk += $kk.ValueCount + $kk.SubKeyCount; $kk.Close() } } }
  foreach ($v in @($it.regValues)) { if ($v) { if ($null -ne (Get-RegValue $v[0] $v[1])) { $rk++ } } }
  $m.regItems = $rk
  $m.running = @(@($it.procs) | Where-Object { $_ -and ($procs -contains $_.ToLower()) })
  $out[$it.id] = $m
}
Out-Json $out`, { timeout: 10 * 60 * 1000 });
  return r;
}

async function clean(ids, { closeApps } = {}) {
  const items = resolve(ids);
  if (items.some((i) => (i.regKeys && i.regKeys.length) || (i.regValues && i.regValues.length))) {
    const keys = [];
    items.forEach((i) => { (i.regKeys || []).forEach((k) => keys.push(k)); (i.regValues || []).forEach((v) => keys.push(v[0])); });
    await restore.backupRegistryKeys(keys, 'Limpeza de históricos (registro)');
  }
  const r = await ps.json(`$items = ${ps.data(items)}
$closeApps = ${closeApps ? '$true' : '$false'}
${COMMON}
$out = @{}
foreach ($it in $items) {
  if ($closeApps) { foreach ($p in @($it.procs)) { if ($p) { Get-Process -Name $p -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue } }; Start-Sleep -Milliseconds 400 }
  $freed = 0L; $err = 0
  if ($it.special -eq 'recyclebin') { $m = Get-RecycleSize; try { Clear-RecycleBin -Force -ErrorAction Stop } catch {}; $freed = $m.bytes - (Get-RecycleSize).bytes }
  else {
    if ($it.special -eq 'wu') { Stop-Service wuauserv, bits -Force -ErrorAction SilentlyContinue }
    if ($it.special -eq 'do') { try { Delete-DeliveryOptimizationCache -Force -ErrorAction Stop } catch {} }
    $t = Expand-Targets $it
    $before = (Measure-Targets $t).bytes
    foreach ($d in $t.dirs) { Get-ChildItem -LiteralPath $d -Force -ErrorAction SilentlyContinue | ForEach-Object { try { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop } catch { $err++ } } }
    foreach ($f in $t.files) { try { Remove-Item -LiteralPath $f -Force -ErrorAction Stop } catch { $err++ } }
    $freed = $before - (Measure-Targets $t).bytes
    if ($it.special -eq 'wu') { Start-Service wuauserv, bits -ErrorAction SilentlyContinue }
  }
  foreach ($k in @($it.regKeys)) { if ($k) { $kk = Open-RegKey $k $true; if ($kk) { foreach ($v in $kk.GetValueNames()) { $kk.DeleteValue($v, $false) }; foreach ($s in $kk.GetSubKeyNames()) { try { $kk.DeleteSubKeyTree($s) } catch {} }; $kk.Close() } } }
  foreach ($v in @($it.regValues)) { if ($v) { Remove-RegValue $v[0] $v[1] } }
  $out[$it.id] = @{ freed = [math]::Max(0, $freed); locked = $err }
}
Out-Json $out`, { timeout: 30 * 60 * 1000 });
  const total = Object.values(r).reduce((s, x) => s + (x.freed || 0), 0);
  log.info(`Limpeza concluída: ${(total / 1048576).toFixed(1)} MB liberados.`);
  return r;
}

function addCustomFolder(dir) { store.update((d) => { if (!d.customCleanFolders.includes(dir)) d.customCleanFolders.push(dir); }); return list(); }
function removeCustomFolder(dir) { store.update((d) => { d.customCleanFolders = d.customCleanFolders.filter((x) => x !== dir); }); return list(); }

// ---------------- Limpeza do Registro ----------------
const REG_SCAN = `
function Get-ExePath([string]$cmd) {
  if (-not $cmd) { return $null }
  $c = [Environment]::ExpandEnvironmentVariables($cmd.Trim())
  if ($c.StartsWith('"')) { $e = $c.IndexOf('"', 1); if ($e -gt 1) { return $c.Substring(1, $e - 1) } }
  $m = [regex]::Match($c, '^(.+?\\.(exe|com|bat|cmd|dll|lnk|vbs|ps1|msc|cpl|scr))(\\s|,|$)', 'IgnoreCase')
  if ($m.Success) { return $m.Groups[1].Value }
  return ($c -split '\\s')[0]
}
function Test-PathSafe([string]$p) { if (-not $p) { return $true }; if ($p -notmatch '^[a-zA-Z]:\\\\') { return $true }; try { return (Test-Path -LiteralPath $p) } catch { return $true } }
$res = New-Object System.Collections.ArrayList
function Add-Item($cat, $key, $val, $detail) { [void]$res.Add(@{ id = [guid]::NewGuid().ToString('N').Substring(0, 12); cat = $cat; key = $key; value = $val; detail = $detail }) }
# 1. Desinstalações órfãs
foreach ($root in 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall') {
  $k = Open-RegKey $root $false $false; if (-not $k) { continue }
  foreach ($s in $k.GetSubKeyNames()) { $p = "$root\\$s"
    $name = [string](Get-RegValue $p 'DisplayName' ''); $loc = [string](Get-RegValue $p 'InstallLocation' ''); $un = [string](Get-RegValue $p 'UninstallString' '')
    if (-not $name -or $un -match 'msiexec' -or (Get-RegValue $p 'SystemComponent') -eq 1) { continue }
    $exe = Get-ExePath $un
    if ($loc -and -not (Test-PathSafe ([Environment]::ExpandEnvironmentVariables($loc))) -and $exe -and -not (Test-PathSafe $exe)) { Add-Item 'Desinstalações órfãs' $p $null "$name (pasta e desinstalador não existem)" }
    elseif (-not $loc -and $exe -and $exe -match '^[a-zA-Z]:\\\\' -and -not (Test-PathSafe $exe)) { Add-Item 'Desinstalações órfãs' $p $null "$name (desinstalador não existe: $exe)" }
  }
  $k.Close() }
# 2. Caminhos de apps quebrados
foreach ($root in 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths') {
  $k = Open-RegKey $root $false $false; if (-not $k) { continue }
  foreach ($s in $k.GetSubKeyNames()) { $p = "$root\\$s"; $v = Get-ExePath ([string](Get-RegValue $p '' ''))
    if ($v -and $v -match '^[a-zA-Z]:\\\\' -and -not (Test-PathSafe $v)) { Add-Item 'Caminhos de apps quebrados' $p $null "$s → $v" } }
  $k.Close() }
# 3. Inicialização apontando para arquivos inexistentes
foreach ($root in 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce') {
  $k = Open-RegKey $root $false $false; if (-not $k) { continue }
  foreach ($n in $k.GetValueNames()) { if (-not $n) { continue }; $v = Get-ExePath ([string]$k.GetValue($n))
    if ($v -and $v -match '^[a-zA-Z]:\\\\' -and -not (Test-PathSafe $v)) { Add-Item 'Inicialização quebrada' $root $n "$n → $v" } }
  $k.Close() }
# 4. Fontes ausentes
$fr = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'; $k = Open-RegKey $fr $false $false
if ($k) { foreach ($n in $k.GetValueNames()) { if (-not $n) { continue }; $f = [string]$k.GetValue($n); if (-not $f) { continue }
  $full = if ($f -match '^[a-zA-Z]:\\\\') { $f } else { Join-Path "$env:SystemRoot\\Fonts" $f }
  if (-not (Test-Path -LiteralPath $full) -and -not (Test-Path -LiteralPath (Join-Path "$env:LOCALAPPDATA\\Microsoft\\Windows\\Fonts" $f))) { Add-Item 'Fontes ausentes' $fr $n "$n → $f" } }; $k.Close() }
# 5. DLLs compartilhadas inexistentes
foreach ($sr in 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\SharedDLLs', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\SharedDLLs') { $k = Open-RegKey $sr $false $false
  if ($k) { foreach ($n in $k.GetValueNames()) { if ($n -and $n -match '^[a-zA-Z]:\\\\' -and -not (Test-PathSafe $n)) { Add-Item 'DLLs compartilhadas inexistentes' $sr $n $n } }; $k.Close() } }
# 6. Sons de evento sem arquivo
$ar = 'HKCU\\AppEvents\\Schemes\\Apps'; $k = Open-RegKey $ar $false $false
if ($k) { foreach ($app in $k.GetSubKeyNames()) { $ak = Open-RegKey "$ar\\$app" $false $false; if (-not $ak) { continue }
  foreach ($ev in $ak.GetSubKeyNames()) { $p = "$ar\\$app\\$ev\\.Current"; $f = [string](Get-RegValue $p '' '')
    if ($f) { $x = [Environment]::ExpandEnvironmentVariables($f); if ($x -notmatch '^[a-zA-Z]:\\\\') { $x = Join-Path "$env:SystemRoot\\Media" $x }
      if (-not (Test-Path -LiteralPath $x)) { Add-Item 'Sons de evento sem arquivo' $p '' "$app/$ev → $f" } } }
  $ak.Close() }; $k.Close() }
# 7-10. Históricos
foreach ($h in @(@('Documentos recentes', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs'), @('Histórico do Executar (Win+R)', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU'), @('Caminhos digitados', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TypedPaths'), @('Histórico de Abrir/Salvar', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\ComDlg32\\OpenSavePidlMRU'), @('Histórico de Abrir/Salvar', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\ComDlg32\\LastVisitedPidlMRU'))) {
  $k = Open-RegKey $h[1] $false $false; if ($k) { $c = $k.ValueCount + $k.SubKeyCount; $k.Close(); if ($c -gt 0) { Add-Item $h[0] $h[1] '*' "$c entradas" } } }
Out-Json @{ items = $res.ToArray() }`;

let lastScan = [];
async function regScan() {
  const r = await ps.json(REG_SCAN, { timeout: 5 * 60 * 1000 });
  lastScan = r.items || [];
  return lastScan;
}
async function regClean(itemIds) {
  const items = lastScan.filter((i) => itemIds.includes(i.id));
  if (!items.length) return { removed: 0 };
  const bk = await restore.backupRegistryKeys(items.map((i) => i.key), `Limpeza do Registro (${items.length} itens)`);
  const r = await ps.json(`$items = ${ps.data(items)}
$n = 0
foreach ($i in $items) {
  try {
    if ($null -eq $i.value) { Remove-RegKey $i.key; $n++ }
    elseif ($i.value -eq '*') { $k = Open-RegKey $i.key $true; if ($k) { foreach ($v in $k.GetValueNames()) { $k.DeleteValue($v, $false) }; foreach ($s in $k.GetSubKeyNames()) { $k.DeleteSubKeyTree($s) }; $k.Close(); $n++ } }
    else { Remove-RegValue $i.key $i.value; $n++ }
  } catch {}
}
Out-Json @{ removed = $n }`);
  log.info(`Limpeza do Registro: ${r.removed} itens removidos (backup: ${bk && bk.file}).`);
  lastScan = lastScan.filter((i) => !itemIds.includes(i.id));
  return { removed: r.removed, backup: bk };
}

module.exports = { list, scan, clean, addCustomFolder, removeCustomFolder, regScan, regClean };
