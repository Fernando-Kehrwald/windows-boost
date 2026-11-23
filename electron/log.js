// Log local em arquivo (nada é enviado para fora do computador).
const fs = require('fs');
const path = require('path');

let logDir = null;
let listener = null;

function init(dir) {
  logDir = dir;
  fs.mkdirSync(logDir, { recursive: true });
}
function onLog(fn) { listener = fn; }
function write(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  if (level === 'error') console.error(line); else console.log(line);
  if (logDir) {
    try {
      const file = path.join(logDir, 'windows-boost.log');
      try { if (fs.statSync(file).size > 5 * 1024 * 1024) fs.renameSync(file, file + '.old'); } catch {}
      fs.appendFileSync(file, line + '\n');
    } catch {}
  }
  if (listener) try { listener({ level, msg, at: Date.now() }); } catch {}
}
module.exports = {
  init, onLog,
  info: (m) => write('info', m),
  warn: (m) => write('warn', m),
  error: (m) => write('error', m),
  get dir() { return logDir; },
};
