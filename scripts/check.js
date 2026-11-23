// Verificação estática dos scripts PowerShell gerados (balanceamento de (), {}, [], strings e here-strings).
// Não substitui testar no Windows, mas pega erros de digitação nos ~200 scripts gerados.
const path = require('path');
const os = require('os');
const ps = require('../electron/ps');
const captured = [];
ps.run = async (script) => { captured.push(script); return { out: '{}', err: '', code: 0 }; };
ps.json = async (script) => { captured.push(script); return {}; };
ps.spawnPersistent = (script) => { captured.push(script); return null; };
const store = require('../electron/store');
store.init(path.join(os.tmpdir(), 'wb-check-store'));
const restore = require('../electron/modules/restore');
restore.init(path.join(os.tmpdir(), 'wb-check-backups'));
const fs = require('fs');

function check(src, label) {
  const errs = [];
  const s = src;
  const stack = [];
  const pairs = { ')': '(', '}': '{', ']': '[' };
  let i = 0; let line = 1;
  while (i < s.length) {
    const c = s[i];
    if (c === '\n') { line++; i++; continue; }
    // here-strings
    if ((c === '@') && (s[i + 1] === "'" || s[i + 1] === '"') && s[i + 2] === '\n') {
      const q = s[i + 1];
      const end = s.indexOf(`\n${q}@`, i + 3);
      if (end < 0) { errs.push(`linha ${line}: here-string não fechada`); break; }
      line += s.slice(i, end + 3).split('\n').length - 1; i = end + 3; continue;
    }
    if (c === '#' && (i === 0 || /\s|;/.test(s[i - 1]))) { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === "'") {
      i++;
      while (i < s.length) { if (s[i] === "'" && s[i + 1] === "'") { i += 2; continue; } if (s[i] === "'") break; if (s[i] === '\n') line++; i++; }
      if (i >= s.length) errs.push(`linha ${line}: string ' não fechada`);
      i++; continue;
    }
    if (c === '"') {
      i++;
      let depth = 0;
      while (i < s.length) {
        if (s[i] === '`') { i += 2; continue; }
        if (s[i] === '$' && s[i + 1] === '(') { depth++; i += 2; continue; }
        if (depth > 0 && s[i] === ')') { depth--; i++; continue; }
        if (depth === 0 && s[i] === '"') { if (s[i + 1] === '"') { i += 2; continue; } break; }
        if (s[i] === '\n') line++;
        i++;
      }
      if (i >= s.length) errs.push(`linha ${line}: string " não fechada`);
      i++; continue;
    }
    if (c === '`') { i += 2; continue; }
    if ('({['.includes(c)) stack.push({ c, line });
    else if (')}]'.includes(c)) {
      const top = stack.pop();
      if (!top || top.c !== pairs[c]) { errs.push(`linha ${line}: '${c}' sem par (aberto: ${top ? top.c + '@' + top.line : 'nada'})`); if (top) stack.push(top); }
    }
    i++;
  }
  if (stack.length) errs.push(`não fechados: ${stack.map((x) => x.c + '@' + x.line).join(', ')}`);
  return errs;
}

(async () => {
  const tw = require('../electron/modules/tweaks');
  const { tweaks } = require('../electron/data/tweaks');
  for (const t of tweaks) {
    captured.push(tw.applyBlock(t));
    captured.push(tw.unapplyBlock(t, null));
  }
  await tw.status();
  const gm = require('../electron/modules/gamemode');
  store.update((d) => { d.gameMode.games = [{ id: 'x', name: 'Jogo', exePath: 'C:\\a b\\jogo.exe', extraExes: [], enabled: true }]; });
  await gm.start('x').catch(() => {});
  await gm.stop().catch(() => {});
  await gm.detect().catch(() => {});
  for (const k of ['fso', 'dpi', 'gpu', 'segheap']) { await gm.setPerGame('x', k, true).catch(() => {}); await gm.setPerGame('x', k, false).catch(() => {}); }
  const sys = require('../electron/modules/system');
  // monitor/timer usam spawnPersistent (IS_WIN falso aqui) — captura direta das strings:
  await sys.timerInfo().catch(() => {}); await sys.msiList().catch(() => {}); await sys.msiSet('PCI\\X', true).catch(() => {});
  await sys.volumes().catch(() => {}); await sys.optimizeVolume('C', 'trim').catch(() => {}); await sys.peripherals().catch(() => {});
  const cl = require('../electron/modules/cleaner');
  const ids = cl.list().map((x) => x.id);
  await cl.scan(ids).catch(() => {}); await cl.clean(ids, { closeApps: true }).catch(() => {}); await cl.regScan().catch(() => {});
  await cl.regClean([]).catch(() => {});
  const ram = require('../electron/modules/ram'); await ram.info().catch(() => {}); await ram.clean().catch(() => {});
  const db = require('../electron/modules/debloat'); await db.list().catch(() => {}); await db.remove(['A']).catch(() => {}); await db.restoreApp('A').catch(() => {});
  const ap = require('../electron/modules/apps'); await ap.managers().catch(() => {});
  ps.json = async (script) => { captured.push(script); return { winget: true }; };
  await ap.install(['Mozilla.Firefox']).catch(() => {});
  ps.json = async (script) => { captured.push(script); return {}; };
  await ap.programs().catch(() => {}); await ap.uninstall([{ key: 'HKLM\\X', name: 'P', uninstall: '"C:\\p\\un.exe" /S', quiet: '' }]).catch(() => {});
  await ap.leftovers([{ name: 'Prog 1.2 (x64)', publisher: 'Acme Inc.', location: 'C:\\x', key: 'HKLM\\X' }]).catch(() => {});
  await ap.removeLeftovers([{ kind: 'pasta', path: 'C:\\x' }, { kind: 'registro', path: 'HKCU\\Software\\X' }]).catch(() => {});
  await ap.updates().catch(() => {}); await ap.removeUpdate('KB123').catch(() => {});
  const dns = require('../electron/modules/dns'); await dns.current().catch(() => {}); await dns.apply({ v4: ['1.1.1.1'] }).catch(() => {}); await dns.apply(null).catch(() => {});
  const bios = require('../electron/modules/bios'); await bios.info().catch(() => {}); await bios.bootState().catch(() => {});
  for (const k of ['disabledynamictick', 'tscsyncpolicy', 'hypervisoroff']) { await bios.bootSet(k, true).catch(() => {}); await bios.bootSet(k, false).catch(() => {}); }
  await bios.rebootToFirmware().catch(() => {});
  const dr = require('../electron/modules/drivers'); await dr.list().catch(() => {}); await dr.installInf('C:\\drv').catch(() => {});
  await restore.createRestorePoint('x').catch(() => {}); await restore.listRestorePoints().catch(() => {}); await restore.deleteRestorePoint(3).catch(() => {});
  await restore.backupRegistryKeys(['HKCU\\Software\\X'], 'x').catch(() => {});
  // utilitários dependem do módulo electron; captura via stub
  require.cache[require.resolve('electron')] = { exports: { shell: { openExternal: async () => {} } } };
  try {
    const ut = require('../electron/modules/utilities');
    for (const a of ut.list()) await ut.run(a.id).catch(() => {});
    await ut.powerPlans().catch(() => {});
  } catch (e) { console.log('utilities:', e.message); }
  // scripts persistentes (monitor/timer) lidos do código-fonte do módulo
  const srcSys = fs.readFileSync(path.join(__dirname, '..', 'electron', 'modules', 'system.js'), 'utf8');
  void srcSys;

  const prelude = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ps', 'prelude.ps1'), 'utf8');
  let bad = 0;
  const all = [['prelude', prelude], ...captured.map((s, i) => [`script#${i}`, s])];
  for (const [label, s] of all) {
    const e = check(s, label);
    if (e.length) { bad++; console.log(`\n=== ${label} ===\n${e.join('\n')}\n--- início ---\n${s.slice(0, 400)}`); }
  }
  console.log(`\n${all.length} scripts verificados, ${bad} com problemas.`);
  process.exit(bad ? 1 : 0);
})();
