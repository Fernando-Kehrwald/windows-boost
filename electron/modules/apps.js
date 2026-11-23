// Instalação (winget/Chocolatey), desinstalador em lote com busca de restos e remoção de atualizações.
const fs = require('fs');
const ps = require('../ps');
const log = require('../log');
const restore = require('./restore');
const catalog = require('../data/apps');

async function managers() {
  return ps.json(`$w = Get-Command winget -ErrorAction SilentlyContinue; $c = Get-Command choco -ErrorAction SilentlyContinue
Out-Json @{ winget = [bool]$w; choco = [bool]$c }`);
}

/** Desliga a telemetria do winget antes de usar (settings.json do App Installer). */
const WINGET_PRIVACY = `$wf = "$env:LOCALAPPDATA\\Packages\\Microsoft.DesktopAppInstaller_8wekyb3d8bbwe\\LocalState\\settings.json"
try {
  $j = if (Test-Path $wf) { Get-Content $wf -Raw | ConvertFrom-Json } else { New-Object PSObject }
  if (-not $j) { $j = New-Object PSObject }
  if (-not $j.telemetry) { $j | Add-Member -NotePropertyName telemetry -NotePropertyValue (New-Object PSObject) -Force }
  $j.telemetry | Add-Member -NotePropertyName disable -NotePropertyValue $true -Force
  New-Item -ItemType Directory -Force -Path (Split-Path $wf) | Out-Null
  $j | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $wf -Encoding UTF8
} catch {}`;

async function install(ids, onProgress) {
  const m = await managers();
  if (!m.winget && !m.choco) throw new Error('Nem winget nem Chocolatey foram encontrados. Instale o "Instalador de Aplicativo" pela Microsoft Store.');
  const results = {};
  for (const id of ids) {
    const app = catalog.find((a) => a.id === id) || { id, name: id };
    onProgress && onProgress({ id, status: 'installing' });
    try {
      if (m.winget) {
        const src = /^[0-9A-Z]{12}$/.test(id) ? 'msstore' : 'winget';
        await ps.run(`${WINGET_PRIVACY}
$o = & winget install --id ${ps.q(id)} -e --source ${src} --accept-package-agreements --accept-source-agreements --silent --disable-interactivity 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189 -and $LASTEXITCODE -ne -1978335135 -and $o -notmatch 'already installed|já está instalado|Nenhuma atualiza|No available upgrade') { throw ("winget: " + (($o -split "\`n" | Where-Object { $_.Trim() } | Select-Object -Last 3) -join ' ')) }`, { timeout: 60 * 60 * 1000 });
      } else {
        if (!app.choco) throw new Error('Sem pacote Chocolatey para este app.');
        await ps.run(`Exec choco install ${ps.q(app.choco)} -y --no-progress | Out-Null`, { timeout: 60 * 60 * 1000 });
      }
      results[id] = { ok: true };
      log.info(`Instalado: ${app.name}`);
    } catch (e) {
      results[id] = { ok: false, error: e.message };
      log.error(`Falha ao instalar ${app.name}: ${e.message}`);
    }
    onProgress && onProgress({ id, status: results[id].ok ? 'done' : 'error', error: results[id].error });
  }
  return results;
}

function exportList(file, ids) { fs.writeFileSync(file, JSON.stringify({ app: 'Windows Boost', apps: ids }, null, 2)); return true; }
function importList(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = Array.isArray(j) ? j : j.apps || [];
  return ids.filter((x) => typeof x === 'string');
}

// ---------------- programas instalados ----------------
const LIST_PROGRAMS = `
$items = @()
foreach ($root in 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall') {
  $k = Open-RegKey $root $false $false; if (-not $k) { continue }
  foreach ($s in $k.GetSubKeyNames()) { $p = "$root\\$s"
    $name = [string](Get-RegValue $p 'DisplayName' ''); if (-not $name) { continue }
    if ((Get-RegValue $p 'SystemComponent') -eq 1 -or (Get-RegValue $p 'ParentKeyName') -or (Get-RegValue $p 'ReleaseType') -match 'Update|Hotfix') { continue }
    $un = [string](Get-RegValue $p 'UninstallString' ''); $q = [string](Get-RegValue $p 'QuietUninstallString' '')
    if (-not $un -and -not $q) { continue }
    $items += @{ key = $p; name = $name; publisher = [string](Get-RegValue $p 'Publisher' ''); version = [string](Get-RegValue $p 'DisplayVersion' '')
      size = [int64](Get-RegValue $p 'EstimatedSize' 0) * 1024; date = [string](Get-RegValue $p 'InstallDate' ''); location = [string](Get-RegValue $p 'InstallLocation' '')
      uninstall = $un; quiet = $q; icon = [string](Get-RegValue $p 'DisplayIcon' '') }
  }
  $k.Close()
}
Out-Json @{ items = $items }`;

async function programs() {
  const r = await ps.json(LIST_PROGRAMS, { timeout: 120000 });
  const seen = new Set();
  return (r.items || []).filter((p) => { const k = `${p.name}|${p.version}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function uninstallCommand(p) {
  if (p.quiet) return { cmd: p.quiet, silent: true };
  const m = p.uninstall.match(/\{[0-9A-Fa-f-]{36}\}/);
  if (/msiexec/i.test(p.uninstall) && m) return { cmd: `MsiExec.exe /X${m[0]} /qn /norestart`, silent: true };
  return { cmd: p.uninstall, silent: false };
}

async function uninstall(list, { restorePoint } = {}, onProgress) {
  if (restorePoint) await restore.ensureRestorePoint('desinstalacao');
  const results = {};
  for (const p of list) {
    const { cmd, silent } = uninstallCommand(p);
    onProgress && onProgress({ key: p.key, status: 'uninstalling', silent });
    try {
      await ps.run(`$cmd = ${ps.q(cmd)}
$exe = $null; $args2 = ''
if ($cmd.StartsWith('"')) { $e = $cmd.IndexOf('"', 1); $exe = $cmd.Substring(1, $e - 1); $args2 = $cmd.Substring($e + 1).Trim() }
else { $m = [regex]::Match($cmd, '^(.+?\\.exe)(.*)$', 'IgnoreCase'); if ($m.Success) { $exe = $m.Groups[1].Value; $args2 = $m.Groups[2].Value.Trim() } else { $exe = 'cmd.exe'; $args2 = '/c ' + $cmd } }
$p = if ($args2) { Start-Process -FilePath $exe -ArgumentList $args2 -Wait -PassThru } else { Start-Process -FilePath $exe -Wait -PassThru }
$still = Test-Path -LiteralPath ('Registry::' + (Expand-Hive (${ps.q(p.key)} -split '\\\\',2)[0]) + '\\' + (${ps.q(p.key)} -split '\\\\',2)[1])
Out-Json @{ code = $p.ExitCode; still = $still }`, { timeout: 2 * 60 * 60 * 1000 });
      results[p.key] = { ok: true };
      log.info(`Desinstalado: ${p.name}`);
    } catch (e) { results[p.key] = { ok: false, error: e.message }; log.error(`Falha ao desinstalar ${p.name}: ${e.message}`); }
    onProgress && onProgress({ key: p.key, status: results[p.key].ok ? 'done' : 'error', error: results[p.key].error });
  }
  return results;
}

/** Procura restos (pastas e chaves de registro) dos programas desinstalados. */
async function leftovers(list) {
  const items = list.map((p) => ({ name: p.name, publisher: p.publisher, location: p.location, key: p.key }));
  const r = await ps.json(`$items = ${ps.data(items)}
function Clean-Name([string]$n) { $n = $n -replace '\\(.*?\\)', '' -replace '\\b(v?\\d+(\\.\\d+)+)\\b', '' -replace '\\b(x64|x86|64-bit|32-bit)\\b', ''; return ($n -replace '\\s+', ' ').Trim(' ', '-', '_') }
$skip = @('microsoft','windows','common files','windowsapps','intel','nvidia','amd','realtek','google','mozilla','packages','programs','temp','microsoft corporation')
$found = New-Object System.Collections.ArrayList
$roots = @($env:ProgramFiles, \${env:ProgramFiles(x86)}, $env:ProgramData, $env:APPDATA, $env:LOCALAPPDATA, "$env:LOCALAPPDATA\\Programs") | Where-Object { $_ -and (Test-Path $_) }
foreach ($it in $items) {
  $cands = @((Clean-Name $it.name)); $pub = Clean-Name ($it.publisher -replace ',?\\s*(Inc|LLC|Ltd|GmbH|Corp(oration)?|S\\.?A\\.?)\\.?$', '')
  $cands += ($cands[0] -replace '\\s', '')
  $cands = @($cands | Where-Object { $_ -and $_.Length -ge 4 -and $skip -notcontains $_.ToLower() } | Select-Object -Unique)
  if ($it.location) { $l = [Environment]::ExpandEnvironmentVariables($it.location).TrimEnd('\\'); if ((Test-Path -LiteralPath $l) -and $l.Length -gt 12) { [void]$found.Add(@{ kind = 'pasta'; path = $l; of = $it.name }) } }
  foreach ($r in $roots) { foreach ($c in $cands) {
    foreach ($p in @((Join-Path $r $c), $(if ($pub -and $pub.Length -ge 3 -and $skip -notcontains $pub.ToLower()) { Join-Path (Join-Path $r $pub) $c }))) {
      if ($p -and (Test-Path -LiteralPath $p -PathType Container)) { [void]$found.Add(@{ kind = 'pasta'; path = $p; of = $it.name }) } } } }
  foreach ($h in 'HKCU\\Software', 'HKLM\\SOFTWARE', 'HKLM\\SOFTWARE\\WOW6432Node') { foreach ($c in $cands) {
    foreach ($p in @("$h\\$c", $(if ($pub -and $pub.Length -ge 3 -and $skip -notcontains $pub.ToLower()) { "$h\\$pub\\$c" }))) {
      if ($p) { $k = Open-RegKey $p $false $false; if ($k) { $k.Close(); [void]$found.Add(@{ kind = 'registro'; path = $p; of = $it.name }) } } } } }
  $k = Open-RegKey $it.key $false $false; if ($k) { $k.Close(); [void]$found.Add(@{ kind = 'registro'; path = $it.key; of = $it.name }) }
}
$u = @{}; $out = @(); foreach ($f in $found) { $key = $f.path.ToLower(); if (-not $u.ContainsKey($key)) { $u[$key] = 1; $out += $f } }
Out-Json @{ items = $out }`, { timeout: 5 * 60 * 1000 });
  return r.items || [];
}

async function removeLeftovers(items) {
  const regs = items.filter((i) => i.kind === 'registro').map((i) => i.path);
  if (regs.length) await restore.backupRegistryKeys(regs, `Restos de programas (${regs.length} chaves)`);
  const r = await ps.json(`$items = ${ps.data(items)}
Add-Type -AssemblyName Microsoft.VisualBasic
$ok = 0; $fail = @()
foreach ($i in $items) {
  try {
    if ($i.kind -eq 'pasta') { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($i.path, 'OnlyErrorDialogs', 'SendToRecycleBin'); $ok++ }
    else { Remove-RegKey $i.path; $ok++ }
  } catch { $fail += $i.path }
}
Out-Json @{ ok = $ok; failed = $fail }`, { timeout: 10 * 60 * 1000 });
  log.info(`Restos removidos: ${r.ok} (pastas foram para a Lixeira).`);
  return r;
}

// ---------------- atualizações do Windows ----------------
async function updates() {
  const r = await ps.json(`$items = @(Get-HotFix -ErrorAction SilentlyContinue | ForEach-Object { @{ id = $_.HotFixID; desc = $_.Description; date = if ($_.InstalledOn) { $_.InstalledOn.ToString('yyyy-MM-dd') } else { '' } } })
Out-Json @{ items = $items }`);
  return (r.items || []).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
async function removeUpdate(kb) {
  const n = String(kb).replace(/\D/g, '');
  if (!n) throw new Error('KB inválido');
  await restore.ensureRestorePoint('remover-atualizacao');
  await ps.run(`Start-Process wusa.exe -ArgumentList '/uninstall /kb:${n} /norestart' -Wait`, { timeout: 60 * 60 * 1000 });
  log.info(`Remoção da atualização KB${n} solicitada.`);
  return true;
}

module.exports = { catalog: () => catalog, managers, install, exportList, importList, programs, uninstall, leftovers, removeLeftovers, updates, removeUpdate };
