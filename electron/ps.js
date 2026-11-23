// Executor de PowerShell. Todo script recebe o prelude (funções auxiliares) e roda
// localmente com a mesma elevação do app (o executável exige administrador).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const log = require('./log');

const IS_WIN = process.platform === 'win32';
const PRELUDE = fs.readFileSync(path.join(__dirname, 'ps', 'prelude.ps1'), 'utf8');

function psExe() {
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function cleanErr(s) {
  if (!s) return '';
  s = s.replace(/#< CLIXML[\s\S]*?(<Objs|$)/g, '$1').replace(/<Objs[\s\S]*?<\/Objs>/g, '');
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^(At line|No linha|Em linha|\+ |CategoryInfo|FullyQualifiedErrorId|~)/i.test(l));
  return lines.slice(0, 6).join(' | ');
}

/** Executa um script. Resolve { out, err, code }. Rejeita se o código de saída != 0. */
function run(script, opts = {}) {
  if (!IS_WIN) return Promise.reject(new Error('Esta função só funciona no Windows.'));
  const file = path.join(os.tmpdir(), `wb-${crypto.randomBytes(8).toString('hex')}.ps1`);
  fs.writeFileSync(file, '\ufeff' + PRELUDE + '\n' + script, 'utf8');
  return new Promise((resolve, reject) => {
    const p = spawn(psExe(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], {
      windowsHide: true,
    });
    const outBufs = [];
    const errBufs = [];
    let timedOut = false;
    const timer = opts.timeout ? setTimeout(() => { timedOut = true; try { p.kill(); } catch {} }, opts.timeout) : null;
    p.stdout.on('data', (d) => { outBufs.push(d); if (opts.onData) opts.onData(d.toString('utf8')); });
    p.stderr.on('data', (d) => { errBufs.push(d); });
    p.on('error', (e) => { if (timer) clearTimeout(timer); try { fs.unlinkSync(file); } catch {} reject(e); });
    p.on('close', (code) => {
      if (timer) clearTimeout(timer);
      try { fs.unlinkSync(file); } catch {}
      const out = Buffer.concat(outBufs).toString('utf8');
      const warn = cleanErr(Buffer.concat(errBufs).toString('utf8'));
      if (timedOut) return reject(new Error('Tempo esgotado ao executar o PowerShell.'));
      if (code !== 0) {
        log.error(`PowerShell (${code}): ${warn}`);
        return reject(new Error(warn || `PowerShell terminou com código ${code}`));
      }
      if (warn) log.warn(`PowerShell avisos: ${warn}`);
      resolve({ out, err: warn, code });
    });
  });
}

function parseLastJson(out) {
  const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l[0] === '{' || l[0] === '[' || l === 'null' || l === 'true' || l === 'false' || /^-?\d/.test(l) || l[0] === '"') {
      try { return JSON.parse(l); } catch {}
    }
  }
  throw new Error('Resposta inválida do PowerShell: ' + out.slice(-300));
}

/** Executa e interpreta a última linha JSON da saída. */
async function json(script, opts) {
  const { out } = await run(script, opts);
  return parseLastJson(out);
}

/** Literal PowerShell seguro para dados JSON (here-string literal). */
function data(obj) {
  const s = JSON.stringify(obj === undefined ? null : obj);
  return `(ConvertFrom-Json @'\n${s}\n'@)`;
}
/** String literal PowerShell entre aspas simples. */
function q(s) { return `'${String(s).replace(/'/g, "''")}'`; }

/** Processo PowerShell de longa duração (ex.: resolução do timer). */
function spawnPersistent(script) {
  if (!IS_WIN) return null;
  const file = path.join(os.tmpdir(), `wb-p-${crypto.randomBytes(8).toString('hex')}.ps1`);
  fs.writeFileSync(file, '\ufeff' + PRELUDE + '\n' + script, 'utf8');
  const p = spawn(psExe(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true });
  p.on('close', () => { try { fs.unlinkSync(file); } catch {} });
  return p;
}

/** Abre uma janela de console visível (para SFC, DISM, CHKDSK...). */
function openConsole(command) {
  if (!IS_WIN) throw new Error('Esta função só funciona no Windows.');
  spawn('cmd.exe', ['/c', `start "Windows Boost" cmd.exe /k ${command}`], {
    detached: true, windowsHide: false, windowsVerbatimArguments: true,
  }).unref();
}

module.exports = { run, json, data, q, spawnPersistent, openConsole, IS_WIN };
