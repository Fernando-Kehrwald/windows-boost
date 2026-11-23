// Remover apps do Windows (Debloat): lista os pacotes Appx com ícone e descrição, remove e tenta restaurar.
const ps = require('../ps');
const store = require('../store');
const log = require('../log');
const restore = require('./restore');
const { KNOWN, PROTECTED } = require('../data/bloat');

function wildcardToRegex(p) { return new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'); }
const KNOWN_RX = KNOWN.map((k) => ({ ...k, rx: wildcardToRegex(k.pattern) }));
const PROT_RX = PROTECTED.map(wildcardToRegex);

const LIST_SCRIPT = `
$out = @()
$seen = @{}
foreach ($p in Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue) {
  if ($p.IsFramework -or $p.NonRemovable -or $p.IsResourcePackage) { continue }
  if ($seen.ContainsKey($p.Name)) { continue }; $seen[$p.Name] = 1
  $display = $null; $icon = $null
  try {
    $mf = Join-Path $p.InstallLocation 'AppxManifest.xml'
    if (Test-Path -LiteralPath $mf) {
      [xml]$x = Get-Content -LiteralPath $mf -Raw
      $display = $x.Package.Properties.DisplayName
      $logo = $x.Package.Properties.Logo
      if ($logo) {
        $dir = Join-Path $p.InstallLocation (Split-Path $logo -Parent)
        $base = [IO.Path]::GetFileNameWithoutExtension($logo); $ext = [IO.Path]::GetExtension($logo)
        $f = Get-ChildItem -LiteralPath $dir -Filter ($base + '*' + $ext) -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'contrast|altform' } | Sort-Object { [math]::Abs($_.Length - 3000) } | Select-Object -First 1
        if ($f -and $f.Length -lt 60000) { $icon = 'data:image/png;base64,' + [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName)) }
      }
    }
  } catch {}
  if ($display -like 'ms-resource:*') { $display = $null }
  $out += @{ name = $p.Name; family = $p.PackageFamilyName; full = $p.PackageFullName; publisher = $p.Publisher; version = [string]$p.Version; display = $display; icon = $icon; system = ([string]$p.SignatureKind -eq 'System') }
}
Out-Json @{ items = $out }`;

let lastList = [];
async function list() {
  const r = await ps.json(LIST_SCRIPT, { timeout: 5 * 60 * 1000 });
  lastList = (r.items || [])
    .filter((p) => !PROT_RX.some((rx) => rx.test(p.name)))
    .map((p) => {
      const k = KNOWN_RX.find((x) => x.rx.test(p.name));
      return {
        name: p.name, family: p.family, version: p.version, icon: p.icon,
        display: (k && k.name) || p.display || p.name,
        desc: k ? k.desc : (p.publisher && /Microsoft/.test(p.publisher) ? 'App da Microsoft' : 'App da Store'),
        preset: k ? k.preset : null,
        warn: /XboxGamingOverlay/.test(p.name) ? 'Necessária para CPUs Ryzen X3D direcionarem jogos aos núcleos com 3D V-Cache.' : null,
      };
    })
    .sort((a, b) => a.display.localeCompare(b.display));
  return lastList;
}

async function remove(names) {
  await restore.ensureRestorePoint('debloat');
  const r = await ps.json(`$names = ${ps.data(names)}
$res = @{}
foreach ($n in $names) { try { $removed = Remove-AppxEverywhere $n; $res[$n] = @{ ok = $true; count = @($removed).Count } } catch { $res[$n] = @{ ok = $false; error = $_.Exception.Message } } }
Out-Json $res`, { timeout: 30 * 60 * 1000 });
  store.update((d) => {
    for (const n of names) if (r[n] && r[n].ok) {
      const info = lastList.find((x) => x.name === n) || {};
      d.removedApps = d.removedApps.filter((x) => x.name !== n);
      d.removedApps.unshift({ name: n, family: info.family || null, display: info.display || n, at: Date.now() });
    }
  });
  log.info(`Debloat: ${Object.values(r).filter((x) => x.ok).length}/${names.length} apps removidos.`);
  return r;
}

function removed() { return store.get().removedApps; }

/** Tenta reinstalar a partir da cópia que ainda está no disco; senão abre a página da Store. */
async function restoreApp(name) {
  const r = await ps.json(`$n = ${ps.q(name)}
$m = Get-ChildItem "$env:ProgramFiles\\WindowsApps" -Directory -Filter ($n + '_*') -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '_neutral_~_|split' } | Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'AppxManifest.xml' } | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($m) { try { Add-AppxPackage -DisableDevelopmentMode -Register $m -ErrorAction Stop; Out-Json @{ ok = $true; via = 'local' }; return } catch {} }
Out-Json @{ ok = $false }`);
  if (!r.ok) r.family = (store.get().removedApps.find((x) => x.name === name) || {}).family || null;
  if (r.ok) {
    store.update((d) => { d.removedApps = d.removedApps.filter((x) => x.name !== name); });
    log.info(`App restaurado: ${name}`);
  }
  return r;
}

module.exports = { list, remove, removed, restoreApp };
