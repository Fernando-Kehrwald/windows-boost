// Informações de hardware/sistema (100% local) e recursos da aba Hardware.
const si = require('systeminformation');
const ps = require('../ps');
const store = require('../store');
const log = require('../log');

let staticCache = null;

async function staticInfo(force) {
  if (staticCache && !force) return staticCache;
  const safe = (p, d) => p.catch((e) => { log.warn(`systeminformation: ${e.message}`); return d; });
  const [cpu, graphics, mem, memLayout, disks, os, system, board, bios] = await Promise.all([
    safe(si.cpu(), {}), safe(si.graphics(), { controllers: [], displays: [] }), safe(si.mem(), {}),
    safe(si.memLayout(), []), safe(si.diskLayout(), []), safe(si.osInfo(), {}), safe(si.system(), {}),
    safe(si.baseboard(), {}), safe(si.bios(), {}),
  ]);
  const gpus = (graphics.controllers || []).filter((g) => !/Basic Display|Remote Display|Virtual|Parsec|Meta Virtual/i.test(g.model || ''));
  staticCache = {
    cpu: {
      brand: `${cpu.manufacturer || ''} ${cpu.brand || ''}`.trim(), cores: cpu.cores, physicalCores: cpu.physicalCores,
      pCores: cpu.performanceCores, eCores: cpu.efficiencyCores, speed: cpu.speed, speedMax: cpu.speedMax, socket: cpu.socket,
      vendor: /AMD/i.test(cpu.manufacturer || cpu.brand || '') ? 'amd' : /Intel/i.test(cpu.manufacturer || '') ? 'intel' : 'other',
      x3d: /X3D/i.test(cpu.brand || ''),
      hybrid: !!(cpu.efficiencyCores && cpu.efficiencyCores > 0),
    },
    gpus: gpus.map((g) => ({
      model: g.model, vendor: g.vendor, vram: g.vram, driver: g.driverVersion,
      kind: /NVIDIA/i.test(`${g.vendor} ${g.model}`) ? 'nvidia' : /AMD|ATI|Radeon|Advanced Micro/i.test(`${g.vendor} ${g.model}`) ? 'amd' : /Intel/i.test(`${g.vendor} ${g.model}`) ? 'intel' : 'other',
    })),
    displays: (graphics.displays || []).map((d) => ({ model: d.model, res: d.currentResX ? `${d.currentResX}x${d.currentResY}` : '', hz: d.currentRefreshRate })),
    ram: {
      total: mem.total,
      modules: memLayout.map((m) => ({ size: m.size, type: m.type, clock: m.clockSpeed, maker: m.manufacturer, part: m.partNum, slot: m.bank })),
    },
    disks: disks.map((d) => ({ name: d.name, type: d.type, size: d.size, iface: d.interfaceType, vendor: d.vendor })),
    os: { distro: os.distro, release: os.release, build: os.build, arch: os.arch, hostname: os.hostname },
    system: { maker: system.manufacturer, model: system.model },
    board: { maker: board.manufacturer, model: board.model },
    bios: { vendor: bios.vendor, version: bios.version, date: bios.releaseDate },
  };
  return staticCache;
}

// ---------------- monitor em tempo real (um único processo PowerShell em loop) ----------------
let monitorProc = null;
let monitorListeners = 0;
const MONITOR_SCRIPT = `
$smi = @("$env:SystemRoot\\System32\\nvidia-smi.exe", "$env:ProgramFiles\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
while ($true) {
  $o = @{}
  try { $o.cpu = [math]::Round((Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime, 1) } catch {}
  try { $os = Get-CimInstance Win32_OperatingSystem; $o.ramTotal = [int64]$os.TotalVisibleMemorySize * 1024; $o.ramFree = [int64]$os.FreePhysicalMemory * 1024 } catch {}
  try {
    $eng = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop | Where-Object { $_.Name -match 'engtype_3D' }
    $o.gpu = [math]::Min(100, [math]::Round((($eng | Group-Object { ($_.Name -split '_eng_')[0] } | ForEach-Object { ($_.Group | Measure-Object UtilizationPercentage -Sum).Sum } | Measure-Object -Maximum).Maximum), 1))
  } catch {}
  try { $o.vramUsed = [int64](Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory -ErrorAction Stop | Measure-Object DedicatedUsage -Maximum).Maximum } catch {}
  if ($smi) { try { $l = (& $smi --query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits | Select-Object -First 1) -split ','
    $o.gpuTemp = [int]$l[0].Trim(); $o.gpu = [int]$l[1].Trim(); $o.vramUsed = [int64]$l[2].Trim() * 1MB; $o.vramTotal = [int64]$l[3].Trim() * 1MB } catch {} }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1500
}`;

function startMonitor(send) {
  monitorListeners++;
  if (monitorProc || !ps.IS_WIN) return;
  monitorProc = ps.spawnPersistent(MONITOR_SCRIPT);
  let buf = '';
  monitorProc.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    const lines = buf.split(/\r?\n/); buf = lines.pop();
    for (const l of lines) { try { send(JSON.parse(l)); } catch {} }
  });
  monitorProc.on('close', () => { monitorProc = null; });
}
function stopMonitor(force) {
  monitorListeners = Math.max(0, monitorListeners - 1);
  if ((monitorListeners === 0 || force) && monitorProc) { try { monitorProc.kill(); } catch {} monitorProc = null; }
}

async function disks() {
  const fsz = await si.fsSize().catch(() => []);
  return fsz.filter((f) => f.size > 0).map((f) => ({ mount: f.mount, size: f.size, used: f.used, use: f.use, fs: f.type }));
}

module.exports = { staticInfo, startMonitor, stopMonitor, disks };
