// Estado persistente do app em JSON local (pasta de dados do usuário).
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  settings: {
    autoRestorePoint: true,
    closeToTray: true,
    startMinimized: false,
    startWithWindows: false,
    ramAuto: { enabled: false, minutes: 30, onlyBelowPercent: 0 },
    nvidiaInspectorPath: '',
  },
  applied: {},          // id do ajuste -> { at, backup, state }
  regBackups: [],       // { id, at, label, file }
  removedApps: [],      // { name, family, display, at }
  gameMode: { games: [], auto: false, options: null, perGame: {} },
  gameSession: null,    // sessão ativa do Modo Jogo (para recuperar após queda)
  customCleanFolders: [],
  advisorApplied: null,  // último plano aplicado pela Otimização automática
  lastRestorePointAt: 0,
};

let file = null;
let data = null;

function deepMerge(base, extra) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return extra === undefined ? base : extra;
  const out = { ...base };
  for (const k of Object.keys(extra || {})) out[k] = k in base ? deepMerge(base[k], extra[k]) : extra[k];
  return out;
}

function init(dir) {
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'state.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  data = deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), saved);
}
function save() {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
function get() { return data; }
function update(fn) { fn(data); save(); return data; }

module.exports = { init, get, update, save, get dir() { return path.dirname(file); } };
