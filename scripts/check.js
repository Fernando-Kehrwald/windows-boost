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
  const th = require('../electron/modules/thermal');
  await th.probe().catch(() => {});
  const o = { laptop: true, max: { ac: 100, dc: 100 }, epp: { ac: 33, dc: 50 }, boost: { ac: 2, dc: 1 }, cool: { ac: 0, dc: 0 } };
  for (const n of [-1, 0, 1, 2, 3]) captured.push(th.levelScript(n, o));
  captured.push(th.restoreScript(o));
  await require('../electron/modules/advisor').analyze().catch((e) => console.log('advisor:', e.message));
  const gm = require('../electron/modules/gamemode');
  store.update((d) => { d.gameMode.games = [{ id: 'x', name: 'Jogo', exePath: 'C:\\a b\\jogo.exe', extraExes: [], enabled: true }]; });
  await gm.start('x').catch(() => {});
  await gm.stop().catch(() => {});
  await gm.detect().catch(() => {});
  for (const k of ['fso', 'dpi', 'gpu', 'segheap']) { await gm.setPerGame('x', k, true).catch(() => {}); await gm.setPerGame('x', k, false).catch(() => {}); }
  const cl = require('../electron/modules/cleaner');
  const ids = cl.list().map((x) => x.id);
  await cl.scan(ids).catch(() => {}); await cl.clean(ids, { closeApps: true }).catch(() => {}); await cl.regScan().catch(() => {});
  await cl.regClean([]).catch(() => {});
  const ram = require('../electron/modules/ram'); await ram.info().catch(() => {}); await ram.clean().catch(() => {});
  const db = require('../electron/modules/debloat'); await db.list().catch(() => {}); await db.remove(['A']).catch(() => {}); await db.restoreApp('A').catch(() => {});
  const dns = require('../electron/modules/dns'); await dns.current().catch(() => {}); await dns.apply({ v4: ['1.1.1.1'] }).catch(() => {}); await dns.apply(null).catch(() => {});
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
