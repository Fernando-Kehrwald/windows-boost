// Gera src/mock-data.json (usado só na pré-visualização no navegador, sem Electron).
const fs = require('fs');
const path = require('path');
const store = require('../electron/store');
store.init(path.join(require('os').tmpdir(), 'wb-mock-store'));
const tweaks = require('../electron/modules/tweaks');
const gamemode = require('../electron/modules/gamemode');
const cleaner = require('../electron/modules/cleaner');
const bios = require('../electron/modules/bios');
const dns = require('../electron/modules/dns');
const out = {
  tweaks: tweaks.list(),
  parts: gamemode.parts(),
  options: gamemode.options(),
  clean: cleaner.list(),
  guideAmd: bios.guideFor('amd', 'asus'),
  apps: require('../electron/data/apps'),
  dns: dns.PRESETS,
};
fs.writeFileSync(path.join(__dirname, '..', 'src', 'mock-data.json'), JSON.stringify(out));
console.log('mock-data.json gerado:', out.tweaks.length, 'ajustes');
