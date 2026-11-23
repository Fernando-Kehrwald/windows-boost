// Drivers: inventário local por categoria. Não consulta nenhum servidor — a busca de
// atualizações é feita pelo próprio Windows Update ou nos sites dos fabricantes, quando o usuário pedir.
const ps = require('../ps');
const log = require('../log');
const restore = require('./restore');

const CATS = {
  Display: 'Vídeo', MEDIA: 'Áudio', AudioEndpoint: 'Áudio', Net: 'Rede', Bluetooth: 'Bluetooth', System: 'Chipset / Sistema',
  HDC: 'Armazenamento', SCSIAdapter: 'Armazenamento', DiskDrive: 'Armazenamento', USB: 'USB', HIDClass: 'Periféricos',
  Mouse: 'Periféricos', Keyboard: 'Periféricos', Printer: 'Impressora', PrintQueue: 'Impressora', Camera: 'Câmera', Image: 'Câmera',
  SecurityDevices: 'Segurança', Biometric: 'Segurança', SmartCardReader: 'Segurança', Monitor: 'Monitor', Battery: 'Energia',
  Firmware: 'Firmware', SoftwareComponent: 'Componentes de software', Sensor: 'Sensores',
};

async function list() {
  const r = await ps.json(`$items = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName } | ForEach-Object {
  @{ device = $_.DeviceName; version = $_.DriverVersion; date = if ($_.DriverDate) { ([datetime]$_.DriverDate).ToString('yyyy-MM-dd') } else { '' }
     maker = $_.Manufacturer; provider = $_.DriverProviderName; cls = [string]$_.DeviceClass; inf = $_.InfName; signed = [bool]$_.IsSigned; id = $_.DeviceID } })
Out-Json @{ items = $items }`, { timeout: 120000 });
  return (r.items || []).map((d) => ({ ...d, category: CATS[d.cls] || 'Outros', generic: /^Microsoft$|^\(Standard|^\(Padr/i.test(d.provider || d.maker || '') }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.device.localeCompare(b.device));
}

/** Instala um driver baixado pelo usuário (.inf ou pasta com .inf). */
async function installInf(target) {
  await restore.ensureRestorePoint('driver');
  const isDir = !/\.inf$/i.test(target);
  const out = await ps.run(`$o = Run pnputil /add-driver ${ps.q(isDir ? target.replace(/\\$/, '') + '\\*.inf' : target)} ${isDir ? '/subdirs ' : ''}/install
Write-Output $o`, { timeout: 30 * 60 * 1000 });
  log.info(`pnputil: ${out.out.trim().split(/\r?\n/).slice(-3).join(' ')}`);
  return out.out;
}

const VENDOR_PAGES = {
  nvidia: 'https://www.nvidia.com/pt-br/drivers/',
  amd: 'https://www.amd.com/pt/support/download/drivers.html',
  intel: 'https://www.intel.com.br/content/www/br/pt/support/detect.html',
  realtek: 'https://www.realtek.com/Download/Index',
};

module.exports = { list, installInf, VENDOR_PAGES };
