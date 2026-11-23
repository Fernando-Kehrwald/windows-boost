// BIOS: leitura das informações da placa, guia de ajustes, SCEWIN (placas AMI) e ajustes de boot via bcdedit.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ps = require('../ps');
const store = require('../store');
const log = require('../log');
const restore = require('./restore');
const guide = require('../data/bios-guide');

function vendorOf(s) {
  s = String(s || '');
  if (/ASUS/i.test(s)) return 'asus';
  if (/Micro-Star|MSI/i.test(s)) return 'msi';
  if (/Gigabyte|AORUS/i.test(s)) return 'gigabyte';
  if (/ASRock/i.test(s)) return 'asrock';
  return 'other';
}
function socketOf(cpu, socketDesignation) {
  const c = String(cpu || '');
  const s = String(socketDesignation || '');
  const m = s.match(/AM4|AM5|sTRX4|sWRX8|sTR5|TR4|LGA ?\d{4}/i);
  if (m) return m[0].toUpperCase().replace(' ', '');
  if (/Ryzen.* (9|7|5|3) (7|8|9)\d{3}/i.test(c)) return 'AM5';
  if (/Ryzen.* (9|7|5|3) [1-5]\d{3}/i.test(c)) return 'AM4';
  if (/Threadripper PRO 79|Threadripper 79/i.test(c)) return 'sTR5';
  if (/Threadripper PRO/i.test(c)) return 'sWRX8';
  if (/Threadripper 3\d{3}/i.test(c)) return 'sTRX4';
  if (/Threadripper/i.test(c)) return 'TR4';
  if (/Core\(TM\) Ultra .* 2\d\d/i.test(c)) return 'LGA1851';
  if (/i\d-1[234]\d{3}/i.test(c)) return 'LGA1700';
  if (/i\d-1[01]\d{3}/i.test(c)) return 'LGA1200';
  if (/i\d-[6-9]\d{3}/i.test(c)) return 'LGA1151';
  return s || 'desconhecido';
}

async function info() {
  const r = await ps.json(`$b = Get-CimInstance Win32_BaseBoard; $bi = Get-CimInstance Win32_BIOS; $c = Get-CimInstance Win32_Processor | Select-Object -First 1
$acpi = @(); $k = Open-RegKey 'HKLM\\HARDWARE\\ACPI' $false $false; if ($k) { $acpi = $k.GetSubKeyNames(); $k.Close() }
$fw = 'BIOS (legado)'; try { if ($env:firmware_type) { $fw = $env:firmware_type } elseif (Test-Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\State') { $fw = 'UEFI' } } catch {}
$sb = $null; try { $sb = Confirm-SecureBootUEFI } catch {}
Out-Json @{ boardMaker = $b.Manufacturer; boardModel = $b.Product; biosVendor = $bi.Manufacturer; biosVersion = $bi.SMBIOSBIOSVersion
  biosDate = if ($bi.ReleaseDate) { $bi.ReleaseDate.ToString('yyyy-MM-dd') } else { '' }; cpu = $c.Name; socket = $c.SocketDesignation
  acpi = $acpi; firmware = $fw; secureBoot = $sb }`);
  const vendor = vendorOf(r.boardMaker);
  const platform = /AMD/i.test(r.cpu) ? 'amd' : 'intel';
  return { ...r, vendor, platform, socketName: socketOf(r.cpu, r.socket), ami: /American Megatrends|AMI/i.test(`${r.biosVendor} ${r.biosVersion}`) };
}

function guideFor(platform, vendor) {
  return guide.filter((g) => g.platform === 'both' || g.platform === platform).map((g) => {
    const p = g.paths[platform] || g.paths.amd || g.paths.intel || {};
    return { id: g.id, cat: g.cat, name: g.name, target: g.target, impact: g.impact, tradeoff: g.tradeoff, note: g.note,
      path: vendor && p[vendor] ? p[vendor] : null, paths: p };
  });
}

// ---------------- SCEWIN ----------------
function scewinExe() {
  const dir = store.get().settings.scewinPath;
  if (!dir) throw new Error('Indique a pasta do SCEWIN (SCEWIN_64.exe + amifldrv64.sys/amigendrv64.sys) em Configurações.');
  const exe = fs.statSync(dir).isDirectory() ? path.join(dir, 'SCEWIN_64.exe') : dir;
  if (!fs.existsSync(exe)) throw new Error(`SCEWIN_64.exe não encontrado em ${dir}`);
  return exe;
}
function runScewin(args) {
  const exe = scewinExe();
  return new Promise((resolve, reject) => {
    execFile(exe, args, { cwd: path.dirname(exe), windowsHide: true, timeout: 5 * 60 * 1000 }, (err, stdout, stderr) => {
      const out = `${stdout || ''}${stderr || ''}`;
      if (err && !/success|Script file exported|Imported/i.test(out)) return reject(new Error(`SCEWIN falhou: ${out.trim().split(/\r?\n/).slice(-3).join(' ') || err.message}`));
      resolve(out);
    });
  });
}

function parseNvram(text) {
  const lines = text.split(/\r?\n/);
  const qs = [];
  let cur = null;
  lines.forEach((line, i) => {
    const m = line.match(/^Setup Question\s*=\s*(.*)$/);
    if (m) { cur = { name: m[1].trim(), line: i, options: [], value: null }; qs.push(cur); return; }
    if (!cur) return;
    const t = line.match(/^Token\s*=\s*([0-9A-Fa-f]+)/); if (t) cur.token = t[1];
    const opt = line.match(/^(?:Options\s*=)?\s*(\*?)\[([0-9A-Fa-f]+)\]([^\t\/]*)/);
    if (opt && (/^Options\s*=/.test(line) || (cur.options.length && /^\s+\*?\[/.test(line)))) {
      cur.options.push({ line: i, selected: opt[1] === '*', code: opt[2], label: opt[3].trim() });
    }
    const v = line.match(/^Value\s*=\s*<(.*)>/); if (v) cur.value = v[1];
  });
  return { lines, qs };
}

let lastExport = null;
async function scewinExport() {
  const dir = path.join(restore.backupDir, 'bios');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `nvram-${Date.now()}.txt`);
  await runScewin(['/o', '/s', file]);
  if (!fs.existsSync(file)) throw new Error('O SCEWIN não gerou o arquivo de exportação (placa sem BIOS AMI ou driver bloqueado).');
  const text = fs.readFileSync(file, 'latin1');
  const { qs } = parseNvram(text);
  lastExport = { file, text };
  store.update((d) => { d.biosBackups = [{ file, at: Date.now() }, ...(d.biosBackups || [])].slice(0, 20); });
  log.info(`BIOS exportada pelo SCEWIN: ${qs.length} opções (backup em ${file}).`);
  // Relaciona os itens do guia com as opções encontradas
  const matches = guide.map((g) => {
    const found = qs.filter((q) => g.scewin.some((rx) => rx.test(q.name)) && q.options.length);
    return {
      id: g.id, name: g.name,
      questions: found.slice(0, 6).map((q) => {
        const sel = q.options.find((o) => o.selected);
        const tgt = q.options.find((o) => g.targetRx.test(o.label));
        return { name: q.name, token: q.token, current: sel ? sel.label : null, target: tgt ? tgt.label : null, ok: !!(sel && tgt && sel.code === tgt.code), options: q.options.map((o) => o.label) };
      }),
    };
  }).filter((m) => m.questions.length);
  return { file, total: qs.length, matches };
}

/** changes: [{ name, token, target }] — move o "*" para a opção desejada e importa. */
async function scewinApply(changes) {
  if (!lastExport) throw new Error('Exporte a BIOS primeiro.');
  const { lines, qs } = parseNvram(lastExport.text);
  let n = 0;
  for (const c of changes) {
    for (const q of qs.filter((x) => x.name === c.name && (!c.token || x.token === c.token))) {
      const tgt = q.options.find((o) => o.label === c.target);
      if (!tgt) continue;
      for (const o of q.options) lines[o.line] = lines[o.line].replace(/\*\[/, '[');
      lines[tgt.line] = lines[tgt.line].replace(/\[/, '*[');
      n++;
    }
  }
  if (!n) throw new Error('Nenhuma opção alterada.');
  const out = lastExport.file.replace(/\.txt$/, '-alterado.txt');
  fs.writeFileSync(out, lines.join('\r\n'), 'latin1');
  await runScewin(['/i', '/s', out]);
  // Confere se a alteração foi gravada
  const verify = out.replace(/\.txt$/, '-verificacao.txt');
  await runScewin(['/o', '/s', verify]);
  const v = parseNvram(fs.readFileSync(verify, 'latin1'));
  const result = changes.map((c) => {
    const q = v.qs.find((x) => x.name === c.name && (!c.token || x.token === c.token));
    const sel = q && q.options.find((o) => o.selected);
    return { name: c.name, wanted: c.target, now: sel ? sel.label : null, ok: !!(sel && sel.label === c.target) };
  });
  log.info(`SCEWIN: ${result.filter((r) => r.ok).length}/${result.length} opções gravadas na NVRAM.`);
  return result;
}
function biosBackups() { return (store.get().biosBackups || []).filter((b) => fs.existsSync(b.file)); }
async function scewinRestore(file) {
  if (!fs.existsSync(file)) throw new Error('Arquivo de backup não encontrado.');
  await runScewin(['/i', '/s', file]);
  log.info(`BIOS restaurada a partir de ${file}`);
  return true;
}

// ---------------- boot (bcdedit) ----------------
async function bootState() {
  const r = await ps.json(`$o = Run bcdedit /enum '{current}'
$m = @{}; foreach ($l in ($o -split "\\r?\\n")) { if ($l -match '^(\\S+)\\s+(.+)$') { $m[$matches[1].ToLower()] = $matches[2].Trim() } }
Out-Json $m`);
  return {
    disabledynamictick: /^(yes|sim)$/i.test(r.disabledynamictick || ''),
    noplatformclock: !r.useplatformclock && !r.useplatformtick,
    tscsyncpolicy: /enhanced|aprimorad/i.test(r.tscsyncpolicy || ''),
    hypervisoroff: /^(off|desativad)/i.test(r.hypervisorlaunchtype || ''),
    raw: r,
  };
}
const BOOT = {
  disabledynamictick: { on: 'Exec bcdedit /set disabledynamictick yes | Out-Null', off: "Run bcdedit /deletevalue disabledynamictick | Out-Null" },
  noplatformclock: { on: "Run bcdedit /deletevalue useplatformclock | Out-Null; Run bcdedit /deletevalue useplatformtick | Out-Null", off: null },
  tscsyncpolicy: { on: 'Exec bcdedit /set tscsyncpolicy enhanced | Out-Null', off: 'Run bcdedit /deletevalue tscsyncpolicy | Out-Null' },
  hypervisoroff: { on: 'Exec bcdedit /set hypervisorlaunchtype off | Out-Null', off: 'Exec bcdedit /set hypervisorlaunchtype auto | Out-Null' },
};
async function bootSet(key, on) {
  const b = BOOT[key];
  if (!b) throw new Error('Opção inválida');
  const cmd = on ? b.on : b.off;
  if (!cmd) throw new Error('Esta opção não tem desfazer (use "Restaurar backup do BCD").');
  const dir = path.join(restore.backupDir, 'bcd');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `bcd-${Date.now()}.bak`);
  await ps.run(`Exec bcdedit /export ${ps.q(file)} | Out-Null\n${cmd}`);
  store.update((d) => { d.bcdBackups = [{ file, at: Date.now() }, ...(d.bcdBackups || [])].slice(0, 20); });
  log.info(`Boot: ${key} ${on ? 'aplicado' : 'desfeito'} (backup do BCD: ${file})`);
  return bootState();
}
function bcdBackups() { return (store.get().bcdBackups || []).filter((b) => fs.existsSync(b.file)); }
async function bcdRestore(file) { await ps.run(`Exec bcdedit /import ${ps.q(file)} | Out-Null`); log.info(`BCD restaurado de ${file}`); return bootState(); }
async function rebootToFirmware() { await ps.run('Exec shutdown /r /fw /t 5 | Out-Null'); return true; }

module.exports = { info, guideFor, scewinExport, scewinApply, scewinRestore, biosBackups, bootState, bootSet, bcdBackups, bcdRestore, rebootToFirmware, parseNvram };
