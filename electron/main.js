// Windows Boost — processo principal. Nenhum dado sai do computador: não há login, licença,
// telemetria nem atualização automática, e o renderer tem toda requisição de rede bloqueada.
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !!process.env.VITE_DEV;

// Chromium: sem rede em segundo plano, sem relatórios, sem dicionários baixados.
for (const s of ['disable-background-networking', 'disable-component-update', 'disable-domain-reliability', 'no-pings', 'disable-breakpad', 'disable-features=SpareRendererForSitePerProcess,AutofillServerCommunication,OptimizationHints,MediaRouter,DialMediaRouteProvider']) {
  const [k, v] = s.split('=');
  app.commandLine.appendSwitch(k, v);
}
app.setAppUserModelId('local.windowsboost.app');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const log = require('./log');
const store = require('./store');
const ps = require('./ps');

const userData = app.getPath('userData');
log.init(path.join(userData, 'logs'));
store.init(userData);

const restore = require('./modules/restore');
restore.init(path.join(userData, 'backups'));
const tweaks = require('./modules/tweaks');
const system = require('./modules/system');
const gamemode = require('./modules/gamemode');
const cleaner = require('./modules/cleaner');
const ram = require('./modules/ram');
const debloat = require('./modules/debloat');
const apps = require('./modules/apps');
const dns = require('./modules/dns');
const bios = require('./modules/bios');
const drivers = require('./modules/drivers');
const utilities = require('./modules/utilities');
const advisor = require('./modules/advisor');

let win = null;
let tray = null;
let quitting = false;

function send(name, payload) { if (win && !win.isDestroyed()) win.webContents.send('event', name, payload); }
log.onLog((e) => send('log', e));
gamemode.onStatus((s) => { send('gamemode', s); updateTrayMenu(); });
ram.setProtection(() => ({ names: gamemode.protectedNames(), gaming: gamemode.isSessionActive() }));

const ICON = path.join(__dirname, 'assets', 'icon.png');

function createWindow(show) {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 1020, minHeight: 640, show: false,
    backgroundColor: '#0a0d14', title: 'Windows Boost', icon: ICON,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a0d14', symbolColor: '#c9d1e3', height: 38 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, devTools: isDev },
  });
  win.setMenu(null);
  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.once('ready-to-show', () => { if (show) win.show(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://') && !(isDev && url.startsWith('http://localhost:5173'))) e.preventDefault(); });
  win.on('close', (e) => {
    if (!quitting && store.get().settings.closeToTray) { e.preventDefault(); win.hide(); }
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const gm = gamemode.statusInfo();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Windows Boost', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: 'Limpar RAM agora', click: () => ram.clean().then((r) => send('toast', { type: 'ok', text: `RAM: ${(r.freed / 1048576).toFixed(0)} MB liberados` })).catch(() => {}) },
    { label: gm.active ? `Desligar Modo Jogo (${gm.game})` : 'Ligar Modo Jogo', click: () => (gm.active ? gamemode.stop('bandeja') : gamemode.start(null, 'bandeja')).catch(() => {}) },
    { label: 'Modo Jogo automático', type: 'checkbox', checked: gm.auto, click: (i) => gamemode.setAuto(i.checked) },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.setToolTip(gm.active ? `Windows Boost — Modo Jogo ativo (${gm.game})` : 'Windows Boost');
}

function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    tray.on('click', () => { win.show(); win.focus(); });
    updateTrayMenu();
  } catch (e) { log.warn(`Bandeja indisponível: ${e.message}`); }
}

// ---------------- inicialização com o Windows (tarefa agendada com privilégio elevado) ----------------
async function setStartWithWindows(on) {
  // Na versão portátil o executável real é o PORTABLE_EXECUTABLE_FILE (o execPath aponta para a pasta temporária).
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  if (on) {
    await ps.run(`$a = New-ScheduledTaskAction -Execute ${ps.q(exe)} -Argument '--hidden'
$t = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\\$env:USERNAME"
$p = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\\$env:USERNAME" -RunLevel Highest -LogonType Interactive
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0
Register-ScheduledTask -TaskName 'WindowsBoost' -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null`);
  } else {
    await ps.run(`Unregister-ScheduledTask -TaskName 'WindowsBoost' -Confirm:$false -ErrorAction SilentlyContinue`);
  }
}

async function applySettings(patch) {
  const before = store.get().settings;
  store.update((d) => { d.settings = { ...d.settings, ...patch }; });
  const s = store.get().settings;
  if ('startWithWindows' in patch && patch.startWithWindows !== before.startWithWindows && ps.IS_WIN) await setStartWithWindows(s.startWithWindows);
  if ('keepTimerResolution' in patch) s.keepTimerResolution ? system.timerStart() : system.timerStop();
  return s;
}

async function isAdmin() {
  if (!ps.IS_WIN) return false;
  try { return await ps.json('Out-Json ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'); }
  catch { return false; }
}

const SAFE_EXTERNAL = /^(https:\/\/(www\.)?(nvidia\.com|amd\.com|intel\.com(\.br)?|realtek\.com|github\.com\/Orbmu2k)\/|ms-settings:|ms-windows-store:)/i;

// ---------------- API exposta ao renderer ----------------
const H = {
  'app.info': async () => ({ version: app.getVersion(), windows: ps.IS_WIN, admin: await isAdmin(), userData, logs: log.dir }),
  'app.openLogs': () => shell.openPath(log.dir),
  'app.openBackups': () => shell.openPath(restore.backupDir),
  'app.reboot': () => ps.run('Exec shutdown /r /t 5 | Out-Null'),
  'app.openExternal': (url) => { if (!SAFE_EXTERNAL.test(url)) throw new Error('Link não permitido.'); return shell.openExternal(url); },
  'settings.get': () => store.get().settings,
  'settings.set': (patch) => applySettings(patch),

  'dialog.file': async (filters, title) => { const r = await dialog.showOpenDialog(win, { title, properties: ['openFile'], filters }); return r.canceled ? null : r.filePaths[0]; },
  'dialog.folder': async (title) => { const r = await dialog.showOpenDialog(win, { title, properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; },
  'dialog.save': async (name, filters) => { const r = await dialog.showSaveDialog(win, { defaultPath: name, filters }); return r.canceled ? null : r.filePath; },

  'sys.static': (force) => system.staticInfo(force),
  'sys.disks': () => system.disks(),
  'sys.monitorStart': () => system.startMonitor((d) => send('monitor', d)),
  'sys.monitorStop': () => system.stopMonitor(),

  'advisor.analyze': () => advisor.analyze(),
  'tweaks.list': () => tweaks.list(),
  'tweaks.status': () => tweaks.status(),
  'tweaks.apply': (ids) => tweaks.applyMany(ids),
  'tweaks.unapply': (ids) => tweaks.unapplyMany(ids),
  'tweaks.applied': () => tweaks.appliedList(),

  'gm.list': () => gamemode.list(),
  'gm.detect': () => gamemode.detect(),
  'gm.add': async () => { const f = await H['dialog.file']([{ name: 'Executável', extensions: ['exe'] }], 'Escolha o executável do jogo'); return f ? gamemode.addManual(f) : gamemode.list(); },
  'gm.update': (id, patch) => gamemode.updateGame(id, patch),
  'gm.remove': (id) => gamemode.removeGame(id),
  'gm.perGame': (id, key, on) => gamemode.setPerGame(id, key, on),
  'gm.start': (id) => gamemode.start(id, 'manual'),
  'gm.stop': () => gamemode.stop('manual'),
  'gm.auto': (on) => gamemode.setAuto(on),
  'gm.status': () => gamemode.statusInfo(),
  'gm.parts': () => gamemode.parts(),
  'gm.options': () => gamemode.options(),
  'gm.setOptions': (o) => gamemode.setOptions(o),
  'gm.lists': () => ({ heavy: gamemode.HEAVY, protected: gamemode.PROTECTED }),

  'hw.timerInfo': () => system.timerInfo(),
  'hw.timerStart': () => system.timerStart(),
  'hw.timerStop': () => system.timerStop(),
  'hw.msiList': () => system.msiList(),
  'hw.msiSet': (id, on) => system.msiSet(id, on),
  'hw.volumes': () => system.volumes(),
  'hw.optimize': (letter, mode) => system.optimizeVolume(letter, mode),
  'hw.peripherals': () => system.peripherals(),

  'bios.info': () => bios.info(),
  'bios.guide': (platform, vendor) => bios.guideFor(platform, vendor),
  'bios.export': () => bios.scewinExport(),
  'bios.apply': (changes) => bios.scewinApply(changes),
  'bios.backups': () => bios.biosBackups(),
  'bios.restore': (file) => bios.scewinRestore(file),
  'bios.bootState': () => bios.bootState(),
  'bios.bootSet': (k, on) => bios.bootSet(k, on),
  'bios.bcdBackups': () => bios.bcdBackups(),
  'bios.bcdRestore': (file) => bios.bcdRestore(file),
  'bios.rebootFirmware': () => bios.rebootToFirmware(),

  'drivers.list': () => drivers.list(),
  'drivers.install': async () => { const f = await H['dialog.folder']('Pasta com o driver (.inf) baixado'); return f ? drivers.installInf(f) : null; },
  'drivers.vendor': (v) => shell.openExternal(drivers.VENDOR_PAGES[v]),
  'drivers.windowsUpdate': () => shell.openExternal('ms-settings:windowsupdate-optionalupdates'),

  'clean.list': () => cleaner.list(),
  'clean.scan': (ids) => cleaner.scan(ids),
  'clean.run': (ids, opts) => cleaner.clean(ids, opts),
  'clean.addFolder': async () => { const f = await H['dialog.folder']('Pasta para limpar (o CONTEÚDO será apagado)'); return f ? cleaner.addCustomFolder(f) : cleaner.list(); },
  'clean.removeFolder': (dir) => cleaner.removeCustomFolder(dir),
  'reg.scan': () => cleaner.regScan(),
  'reg.clean': (ids) => cleaner.regClean(ids),

  'ram.info': () => ram.info(),
  'ram.clean': (areas) => ram.clean(areas),
  'ram.setAuto': (cfg) => ram.setAuto(cfg),

  'debloat.list': () => debloat.list(),
  'debloat.remove': (names) => debloat.remove(names),
  'debloat.removed': () => debloat.removed(),
  'debloat.restore': async (name) => {
    const r = await debloat.restoreApp(name);
    if (!r.ok && r.family) await shell.openExternal(`ms-windows-store://pdp/?PFN=${encodeURIComponent(r.family)}`);
    return r;
  },

  'apps.catalog': () => apps.catalog(),
  'apps.managers': () => apps.managers(),
  'apps.install': (ids) => apps.install(ids, (p) => send('apps.progress', p)),
  'apps.export': async (ids) => { const f = await H['dialog.save']('meus-apps.json', [{ name: 'Lista', extensions: ['json'] }]); return f ? apps.exportList(f, ids) : false; },
  'apps.import': async () => { const f = await H['dialog.file']([{ name: 'Lista', extensions: ['json'] }], 'Importar lista de apps'); return f ? apps.importList(f) : null; },
  'apps.programs': () => apps.programs(),
  'apps.uninstall': (list, opts) => apps.uninstall(list, opts, (p) => send('apps.uninstallProgress', p)),
  'apps.leftovers': (list) => apps.leftovers(list),
  'apps.removeLeftovers': (items) => apps.removeLeftovers(items),
  'apps.updates': () => apps.updates(),
  'apps.removeUpdate': (kb) => apps.removeUpdate(kb),

  'dns.presets': () => dns.PRESETS,
  'dns.current': () => dns.current(),
  'dns.apply': (servers) => dns.apply(servers),
  'dns.benchmark': (extra) => dns.benchmark(extra),

  'utils.list': () => utilities.list(),
  'utils.run': (id) => utilities.run(id),
  'utils.powerPlans': () => utilities.powerPlans(),
  'utils.setPowerPlan': (g) => utilities.setPowerPlan(g),

  'restore.list': () => restore.listRestorePoints(),
  'restore.create': (desc) => restore.createRestorePoint(desc),
  'restore.restore': (seq) => restore.restoreTo(seq),
  'restore.delete': (seq) => restore.deleteRestorePoint(seq),
  'restore.deleteAll': () => restore.deleteAllRestorePoints(),
  'restore.regBackups': () => restore.listRegBackups(),
  'restore.regRestore': (id) => restore.restoreRegBackup(id),
  'restore.regDelete': (id) => restore.deleteRegBackup(id),
};

ipcMain.handle('call', async (_e, name, ...args) => {
  const fn = H[name];
  if (!fn) return { __error: `Função desconhecida: ${name}` };
  try { const r = await fn(...args); return r === undefined ? null : r; }
  catch (e) { log.error(`${name}: ${e.message}`); return { __error: e.message || String(e) }; }
});

app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
app.on('before-quit', () => { quitting = true; system.timerStop(); system.stopMonitor(true); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.whenReady().then(async () => {
  // Bloqueia qualquer requisição de rede do renderer (o app é 100% local).
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, cb) => {
    const allowed = isDev && /^(http|ws):\/\/localhost:5173\//.test(d.url);
    cb({ cancel: !allowed });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));

  const hidden = process.argv.includes('--hidden') || store.get().settings.startMinimized;
  createWindow(!hidden);
  createTray();
  log.info(`Windows Boost ${app.getVersion()} iniciado.`);
  if (store.get().settings.keepTimerResolution) system.timerStart();
  ram.schedule();
  gamemode.recover().catch(() => {});
});
