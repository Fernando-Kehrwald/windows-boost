// Gera src/mock-data.json (usado só na pré-visualização no navegador, sem Electron).
const fs = require('fs');
const path = require('path');
const store = require('../electron/store');
store.init(path.join(require('os').tmpdir(), 'wb-mock-store'));
const tweaks = require('../electron/modules/tweaks');
const gamemode = require('../electron/modules/gamemode');
const cleaner = require('../electron/modules/cleaner');
const dns = require('../electron/modules/dns');
const out = {
  tweaks: tweaks.list(),
  parts: gamemode.parts(),
  options: gamemode.options(),
  clean: cleaner.list(),
  dns: dns.PRESETS,
  advisor: (() => {
    const { decide, GROUPS, FRIENDLY } = require('../electron/modules/advisor');
    const list = Object.fromEntries(tweaks.list().map((t) => [t.id, t]));
    const plan = decide({ laptop: false, ramGB: 32, win11: true, build: 26100, allSsd: true, anyHdd: false, dGpu: true, nvidia: true, x3d: true, vanguard: false, faceit: false, cFree: 400e9 })
      .filter((d) => list[d.id]).map((d) => { const [group, title] = FRIENDLY[d.id] || ['sys', list[d.id].name]; return { ...d, group, title, name: list[d.id].name, risk: list[d.id].risk, reboot: list[d.id].reboot, noUndo: list[d.id].noUndo }; });
    return { groups: GROUPS, laptop: false, profile: { tipo: 'Desktop', cpu: 'AMD Ryzen 7 7800X3D 8-Core Processor', gpu: 'NVIDIA GeForce RTX 4070 SUPER', ram: '32 GB', os: 'Microsoft Windows 11 Pro (build 26100)', disco: 'Só SSD', x3d: true, hybrid: false, anticheats: [], virtualizacao: [] }, plan };
  })(),
};
fs.writeFileSync(path.join(__dirname, '..', 'src', 'mock-data.json'), JSON.stringify(out));
console.log('mock-data.json gerado:', out.tweaks.length, 'ajustes');
