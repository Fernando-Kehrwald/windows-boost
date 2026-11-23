// API falsa para pré-visualizar a interface no navegador (fora do Electron/Windows).
import D from './mock-data.json';

const GB = 1024 ** 3;
const applied = new Set(['telemetry', 'mouse_accel', 'dark_mode', 'file_ext', 'delivery_opt', 'game_mode', 'hags', 'sticky_keys']);
const listeners = {};
const emit = (n, p) => (listeners[n] || []).forEach((f) => f(p));
let gm = { active: false, game: null, auto: true, busy: false };
const games = [
  { id: 'a1', name: 'Counter-Strike 2', source: 'Steam', dir: 'D:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive', exePath: 'D:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe', extraExes: [], enabled: true, perGame: { fso: true, gpu: true } },
  { id: 'a2', name: 'Fortnite', source: 'Epic', dir: 'C:\\Program Files\\Epic Games\\Fortnite', exePath: 'C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe', extraExes: [], enabled: true, perGame: {} },
  { id: 'a3', name: 'VALORANT', source: 'Riot', dir: 'C:\\Riot Games\\VALORANT\\live', exePath: 'C:\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64\\VALORANT-Win64-Shipping.exe', extraExes: [], enabled: true, perGame: {} },
  { id: 'a4', name: 'Forza Horizon 5', source: 'Xbox', dir: 'C:\\XboxGames\\Forza Horizon 5', exePath: '', extraExes: [], enabled: false, perGame: {} },
];
const H = {
  'app.info': { version: '1.0.0', windows: true, admin: true, userData: 'C:\\Users\\voce\\AppData\\Roaming\\Windows Boost', logs: '' },
  'gm.status': () => gm,
  'gm.list': games,
  'thermal.config': { cpuHot: 95, gpuHot: 87, learned: { a1: 1 }, lastReport: { game: 'Counter-Strike 2', at: Date.now() - 3600000, minutes: 52, peaks: { cpuTemp: 97, gpuTemp: 84 }, throttleSecs: 18, maxLevel: 'CPU a 99% (turbo desligado)', learned: 'CPU a 99% (turbo desligado)', events: [
    { at: Date.now() - 6000000, type: 'act', text: 'Resfriamento ativo ligado (ventoinhas aceleram antes de o processador perder clock) → Padrão do plano' },
    { at: Date.now() - 4800000, type: 'act', text: 'Thermal throttling detectado (o Windows está freando a CPU por temperatura (64%); sensor a 97 °C) → CPU a 99% (turbo desligado)' }] } },
  'thermal.state': () => (gm.active ? { running: true, game: 'Counter-Strike 2', level: 1, levelLabel: 'CPU a 99% (turbo desligado)', peaks: { cpuTemp: 97, gpuTemp: 84 }, throttleSecs: 18,
    last: { cpuTemp: 86.5, perf: 99, limit: 99, passive: 100, gpuUtil: 97, gpuTemp: 79, gpuClock: 1845, gpuClockMax: 2100, onAC: true, ramTotal: 16e9, ramFree: 6.2e9 },
    events: [{ at: Date.now() - 120000, type: 'act', text: 'Começando no nível que funcionou da última vez em Counter-Strike 2 → CPU a 99% (turbo desligado)' }, { at: Date.now() - 30000, type: 'info', text: 'GPU quente: limitar o FPS no jogo à taxa do monitor reduz bastante o calor.' }] } : { running: false }), 'gm.parts': D.parts, 'gm.options': D.options,
  'gm.start': () => { gm = { ...gm, active: true, game: 'Manual' }; emit('gamemode', gm); return gm; },
  'gm.stop': () => { gm = { ...gm, active: false, game: null }; emit('gamemode', gm); return gm; },
  'sys.static': { cpu: { brand: 'AMD Ryzen 7 7800X3D 8-Core Processor', cores: 16, physicalCores: 8, speed: 4.2, speedMax: 5.05, x3d: true, hybrid: false, vendor: 'amd' },
    gpus: [{ model: 'NVIDIA GeForce RTX 4070 SUPER', vendor: 'NVIDIA', vram: 12288, driver: '566.36', kind: 'nvidia' }], displays: [{ model: 'LG ULTRAGEAR', res: '2560x1440', hz: 165 }],
    ram: { total: 32 * GB, modules: [{ size: 16 * GB, type: 'DDR5', clock: 6000, maker: 'Kingston', part: 'KF560C30-16', slot: 'DIMM A2' }, { size: 16 * GB, type: 'DDR5', clock: 6000, maker: 'Kingston', part: 'KF560C30-16', slot: 'DIMM B2' }] },
    disks: [{ name: 'Samsung SSD 990 PRO 1TB', type: 'NVMe', size: 1000 * GB, iface: 'PCIe' }, { name: 'ST2000DM008', type: 'HD', size: 2000 * GB, iface: 'SATA' }],
    os: { distro: 'Microsoft Windows 11 Pro', build: '26100', arch: 'x64' }, system: { maker: 'ASUS', model: 'System Product Name' }, board: { maker: 'ASUSTeK COMPUTER INC.', model: 'TUF GAMING B650-PLUS WIFI' }, bios: { version: '3072', date: '2025-02-10' } },
  'sys.disks': [{ mount: 'C:', size: 1000 * GB, used: 412 * GB, use: 41.2, fs: 'NTFS' }, { mount: 'D:', size: 2000 * GB, used: 1530 * GB, use: 76.5, fs: 'NTFS' }],
  'tweaks.list': D.tweaks,
  'advisor.analyze': D.advisor,
  'tweaks.status': () => Object.fromEntries(D.tweaks.map((t) => [t.id, applied.has(t.id)])),
  'tweaks.applied': () => [...applied].map((id) => ({ id, name: (D.tweaks.find((t) => t.id === id) || {}).name, at: Date.now() - 86400000 })),
  'tweaks.apply': (ids) => { ids.forEach((i) => applied.add(i)); return Object.fromEntries(ids.map((i) => [i, { ok: true }])); },
  'tweaks.unapply': (ids) => { ids.forEach((i) => applied.delete(i)); return Object.fromEntries(ids.map((i) => [i, { ok: true }])); },
  'clean.list': D.clean,
  'clean.scan': (ids) => Object.fromEntries(ids.map((id, i) => [id, { bytes: ((i * 7919) % 900) * 1048576 + 3 * 1048576, files: 120, running: id.startsWith('chrome') ? ['chrome'] : [] }])),
  'bios.info': { boardMaker: 'ASUSTeK COMPUTER INC.', boardModel: 'TUF GAMING B650-PLUS WIFI', biosVendor: 'American Megatrends Inc.', biosVersion: '3072', biosDate: '2025-02-10', cpu: 'AMD Ryzen 7 7800X3D 8-Core Processor', socketName: 'AM5', firmware: 'UEFI', secureBoot: true, acpi: ['DSDT', 'FACS', 'FADT', 'RSDT'], vendor: 'asus', platform: 'amd', ami: true },
  'bios.guide': D.guideAmd, 'bios.backups': [], 'bios.bcdBackups': [], 'bios.bootState': { disabledynamictick: false, noplatformclock: true, tscsyncpolicy: false, hypervisoroff: false },
  'apps.catalog': D.apps, 'apps.managers': { winget: true, choco: false },
  'dns.presets': D.dns, 'dns.current': [{ name: 'Ethernet', desc: 'Realtek PCIe 2.5GbE Family Controller', index: 12, v4: ['192.168.0.1'], v6: [] }],
  'dns.benchmark': () => D.dns.map((p, i) => ({ id: p.id, name: p.name, ms: [9, 14, 11, 22, 31, 18][i] })).sort((a, b) => a.ms - b.ms),
  'ram.info': { total: 32 * GB, free: 17.4 * GB, standby: 9.1 * GB, modified: 0.3 * GB, cache: 1 * GB },
  'settings.get': { autoRestorePoint: true, closeToTray: true, startWithWindows: false, startMinimized: false, keepTimerResolution: false, ramAuto: { enabled: false, minutes: 30, onlyBelowPercent: 0 }, nvidiaInspectorPath: '', scewinPath: '' },
  'restore.list': [{ seq: 41, desc: 'WindowsBoostBackup-ajustes-2026-11-20 14:02', type: 12, at: '2026-11-20T14:02:00' }, { seq: 40, desc: 'Windows Update', type: 0, at: '2026-11-14T03:10:00' }],
  'restore.regBackups': [], 'debloat.removed': [], 'debloat.list': [], 'utils.list': [], 'utils.powerPlans': [], 'drivers.list': [], 'apps.programs': [], 'apps.updates': [],
  'hw.timerInfo': { coarsest: 15.625, finest: 0.5, current: 1, active: false }, 'hw.msiList': [], 'hw.volumes': [], 'hw.peripherals': { mice: [], keyboards: [] },
};

export function install() {
  window.api = {
    call: async (name, ...args) => {
      await new Promise((r) => setTimeout(r, 120));
      const h = H[name];
      if (h === undefined) return null;
      return typeof h === 'function' ? h(...args) : JSON.parse(JSON.stringify(h));
    },
    on: (n, cb) => { (listeners[n] = listeners[n] || []).push(cb); if (n === 'monitor') { const t = setInterval(() => cb({ cpu: 18 + Math.random() * 20, ramTotal: 32 * GB, ramFree: 17 * GB, gpu: 42 + Math.random() * 15, gpuTemp: 58, vramUsed: 5.2 * GB, vramTotal: 12 * GB }), 1200); return () => clearInterval(t); } return () => {}; },
  };
}
