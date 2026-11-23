// Motor de ajustes: aplica/desfaz em lote com backup automático do registro.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ps = require('../ps');
const store = require('../store');
const log = require('../log');
const restore = require('./restore');
const { tweaks } = require('../data/tweaks');

const byId = Object.fromEntries(tweaks.map((t) => [t.id, t]));

function publicDef(t) {
  const { id, cat, name, desc, warn, risk, rec, reboot, noUndo, hw, link, win11, vendor, x3dBlock, special } = t;
  return { id, cat, name, desc, warn, risk: risk || 'safe', rec: !!rec, reboot: !!reboot, noUndo: !!noUndo, hw: hw || [], link, win11: !!win11, vendor, x3dBlock: !!x3dBlock, special };
}
function list() { return tweaks.map(publicDef); }

function regOps(t) { return (t.reg || []).map((o) => ({ path: o.path, name: o.name, value: o.value, type: o.type || 'DWord', delete: !!o.delete, optional: !!o.optional })); }

function applyBlock(t, extraParams) {
  return `
# ---- aplicar: ${t.id}
$script:__res = $null; $script:__partial = $null
try {
  $null = & {
    $__D = ${ps.data({ reg: regOps(t), params: { ...(t.params || {}), ...(extraParams || {}) } })}
    $P = $__D.params
    $backup = Invoke-RegOps $__D.reg
    $script:__partial = $backup
    $state = $null
${t.apply || ''}
    $script:__res = @{ ok = $true; backup = $backup; state = $state }
  }
} catch {
  if ($script:__partial) { Restore-RegSnapshots $script:__partial }
  $script:__res = @{ ok = $false; error = $_.Exception.Message }
}
$__R[${ps.q(t.id)}] = $script:__res
`;
}

function fallbackBackup(t) {
  return regOps(t).filter((o) => !o.delete).map((o) => {
    const src = (t.reg || []).find((r) => r.path === o.path && r.name === o.name) || {};
    return src.def === undefined
      ? { path: o.path, name: o.name, existed: false, type: null, value: null }
      : { path: o.path, name: o.name, existed: true, type: o.type, value: src.def };
  });
}

function unapplyBlock(t, saved) {
  const backup = saved && saved.backup ? saved.backup : fallbackBackup(t);
  return `
# ---- desfazer: ${t.id}
$script:__res = $null
try {
  $null = & {
    $__D = ${ps.data({ backup, state: saved ? saved.state : null, params: t.params || {} })}
    $P = $__D.params
    $state = $__D.state
${t.unapply || ''}
    Restore-RegSnapshots $__D.backup
    $script:__res = @{ ok = $true }
  }
} catch { $script:__res = @{ ok = $false; error = $_.Exception.Message } }
$__R[${ps.q(t.id)}] = $script:__res
`;
}

function checkBlock(t) {
  const ops = regOps(t);
  return `
try { $__C[${ps.q(t.id)}] = [bool](& {
  $__ops = ${ps.data(ops)}
  $r = $true
  if (${ops.length ? '$true' : '$false'}) { $r = Test-RegOps $__ops }
  ${t.check ? `if ($r) { $r = [bool](& {\n${t.check}\n} | Select-Object -Last 1) }` : ''}
  $r
} | Select-Object -Last 1) } catch { $__C[${ps.q(t.id)}] = $null }
`;
}

/** Estado atual (aplicado ou não) de todos os ajustes, lido do sistema. */
async function status() {
  const checkable = tweaks.filter((t) => (t.reg && t.reg.length) || t.check);
  let res = {};
  try {
    res = await ps.json(`$__C = @{}\n${checkable.map(checkBlock).join('\n')}\nOut-Json $__C`, { timeout: 120000 });
  } catch (e) {
    log.warn(`Falha ao ler estado dos ajustes: ${e.message}`);
  }
  const applied = store.get().applied;
  const out = {};
  for (const t of tweaks) {
    const v = res[t.id];
    out[t.id] = v === true || v === false ? v : !!applied[t.id];
  }
  return out;
}

async function applyMany(ids, opts = {}) {
  const defs = ids.map((id) => byId[id]).filter((t) => t && !t.link);
  if (!defs.length) return {};
  const needsRp = defs.some((t) => t.noUndo || t.risk !== 'safe') || opts.forceRestorePoint;
  if (needsRp && !opts.skipRestorePoint) await restore.ensureRestorePoint('ajustes');

  const results = {};
  const special = defs.filter((t) => t.special);
  const normal = defs.filter((t) => !t.special);
  for (const t of special) {
    try { if (t.special === 'nvidia') await applyNvidia(); results[t.id] = { ok: true }; }
    catch (e) { results[t.id] = { ok: false, error: e.message }; }
  }
  if (normal.length) {
    const script = `$__R = [ordered]@{}\n${normal.map((t) => applyBlock(t, opts.params && opts.params[t.id])).join('\n')}\nOut-Json $__R`;
    let r;
    try { r = await ps.json(script, { timeout: 20 * 60 * 1000 }); }
    catch (e) { for (const t of normal) results[t.id] = { ok: false, error: e.message }; r = {}; }
    for (const t of normal) if (r[t.id]) results[t.id] = r[t.id];
  }
  store.update((d) => {
    for (const t of defs) {
      const r = results[t.id];
      if (r && r.ok) {
        // Se o ajuste já estava aplicado, mantém o backup original (o "antes" verdadeiro).
        const prev = d.applied[t.id];
        d.applied[t.id] = prev && prev.backup && prev.backup.length
          ? { ...prev, at: Date.now() }
          : { at: Date.now(), backup: r.backup || [], state: r.state === undefined ? null : r.state, noUndo: !!t.noUndo };
      }
    }
  });
  for (const t of defs) {
    const r = results[t.id] || { ok: false, error: 'Sem resposta' };
    if (r.ok) log.info(`Ajuste aplicado: ${t.name}`); else log.error(`Falha ao aplicar ${t.name}: ${r.error}`);
    results[t.id] = { ok: !!r.ok, error: r.error, reboot: !!t.reboot };
  }
  return results;
}

async function unapplyMany(ids) {
  const defs = ids.map((id) => byId[id]).filter((t) => t && !t.link && !t.noUndo);
  if (!defs.length) return {};
  const applied = store.get().applied;
  const script = `$__R = [ordered]@{}\n${defs.map((t) => unapplyBlock(t, applied[t.id])).join('\n')}\nOut-Json $__R`;
  let r = {};
  const results = {};
  try { r = await ps.json(script, { timeout: 20 * 60 * 1000 }); }
  catch (e) { for (const t of defs) r[t.id] = { ok: false, error: e.message }; }
  store.update((d) => { for (const t of defs) if (r[t.id] && r[t.id].ok) delete d.applied[t.id]; });
  for (const t of defs) {
    const x = r[t.id] || { ok: false, error: 'Sem resposta' };
    if (x.ok) log.info(`Ajuste desfeito: ${t.name}`); else log.error(`Falha ao desfazer ${t.name}: ${x.error}`);
    results[t.id] = { ok: !!x.ok, error: x.error, reboot: !!t.reboot };
  }
  return results;
}

function appliedList() {
  const a = store.get().applied;
  return Object.keys(a).map((id) => ({ id, name: byId[id] ? byId[id].name : id, at: a[id].at, noUndo: !!a[id].noUndo }));
}

// ---------------- NVIDIA Profile Inspector ----------------
const NV_SETTINGS = [
  ['Maximum pre-rendered frames (Low Latency On)', 0x007BA09E, 1],
  ['Ultra Low Latency - CPL State', 0x0005F543, 1],
  ['Power management mode: Prefer maximum performance', 0x1057EB71, 1],
  ['Shader disk cache maximum size: Unlimited', 0x00AC8497, 0xFFFFFFFF],
  ['Texture filtering - Quality: High performance', 0x00CE2691, 0x14],
  ['Threaded optimization: On', 0x20C1221E, 1],
  ['Vertical Sync: Force off', 0x00A879CF, 0x08416747],
  ['Triple buffering: Off', 0x20FDD1F9, 0],
  ['FXAA: Off', 0x1074C972, 0],
  ['MFAA: Off', 0x0098C1AC, 0],
  ['Ambient Occlusion: Off', 0x00667329, 0],
  ['Frame Rate Limiter: Off', 0x10835002, 0],
  ['Virtual Reality pre-rendered frames: 1', 0x10111133, 1],
];

function buildNip() {
  const settings = NV_SETTINGS.map(([n, id, v]) => `      <ProfileSetting>
        <SettingNameInfo>${n.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</SettingNameInfo>
        <SettingID>${id >>> 0}</SettingID>
        <SettingValue>${v >>> 0}</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>`).join('\n');
  return `<?xml version="1.0" encoding="utf-16"?>
<ArrayOfProfile xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Profile>
    <ProfileName>Base Profile</ProfileName>
    <Executeables />
    <Settings>
${settings}
    </Settings>
  </Profile>
</ArrayOfProfile>`;
}

async function applyNvidia() {
  const exe = store.get().settings.nvidiaInspectorPath;
  if (!exe || !fs.existsSync(exe)) throw new Error('Indique o caminho do nvidiaProfileInspector.exe em Configurações (o app não baixa nada da internet).');
  const nip = path.join(os.tmpdir(), `windowsboost-${Date.now()}.nip`);
  fs.writeFileSync(nip, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(buildNip(), 'utf16le')]));
  await new Promise((resolve, reject) => {
    const p = spawn(exe, [nip, '-silentImport'], { windowsHide: true });
    const t = setTimeout(() => { try { p.kill(); } catch {} resolve(); }, 60000);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', () => { clearTimeout(t); resolve(); });
  });
  log.info('Perfil NVIDIA importado no Profile Inspector.');
}

module.exports = { list, status, applyMany, unapplyMany, appliedList, byId, applyBlock, unapplyBlock, buildNip };
