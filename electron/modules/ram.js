// Limpador de RAM: working sets, lista modificada, standby e cache do sistema (APIs nativas do Windows).
const ps = require('../ps');
const store = require('../store');
const log = require('../log');

const MEM_TYPE = `Add-Type -ErrorAction SilentlyContinue -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Diagnostics;
public static class WBMem {
  [DllImport("psapi.dll")] static extern bool EmptyWorkingSet(IntPtr h);
  [DllImport("ntdll.dll")] static extern uint NtSetSystemInformation(int cls, IntPtr info, int len);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetSystemFileCacheSize(IntPtr min, IntPtr max, int flags);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr h, uint acc, out IntPtr tok);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool LookupPrivilegeValue(string sys, string name, out long luid);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool AdjustTokenPrivileges(IntPtr tok, bool disableAll, ref TP ns, int len, IntPtr prev, IntPtr retLen);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [StructLayout(LayoutKind.Sequential, Pack=4)] struct TP { public int Count; public long Luid; public int Attr; }
  public static bool Enable(string priv) {
    IntPtr tok; if (!OpenProcessToken(GetCurrentProcess(), 0x28, out tok)) return false;
    TP tp = new TP(); tp.Count = 1; tp.Attr = 2;
    if (!LookupPrivilegeValue(null, priv, out tp.Luid)) return false;
    return AdjustTokenPrivileges(tok, false, ref tp, Marshal.SizeOf(tp), IntPtr.Zero, IntPtr.Zero);
  }
  public static int WorkingSets() { int n = 0; foreach (var p in Process.GetProcesses()) { try { if (EmptyWorkingSet(p.Handle)) n++; } catch {} } return n; }
  public static uint Command(int cmd) { IntPtr p = Marshal.AllocHGlobal(4); try { Marshal.WriteInt32(p, cmd); return NtSetSystemInformation(80, p, 4); } finally { Marshal.FreeHGlobal(p); } }
  public static bool FlushFileCache() { return SetSystemFileCacheSize(new IntPtr(-1), new IntPtr(-1), 0); }
}
'@`;

const INFO = `function Get-MemInfo {
  $os = Get-CimInstance Win32_OperatingSystem
  $pm = Get-CimInstance Win32_PerfRawData_PerfOS_Memory
  return @{ total = [int64]$os.TotalVisibleMemorySize * 1024; free = [int64]$os.FreePhysicalMemory * 1024
    standby = [int64]$pm.StandbyCacheNormalPriorityBytes + [int64]$pm.StandbyCacheReserveBytes + [int64]$pm.StandbyCacheCoreBytes
    modified = [int64]$pm.ModifiedPageListBytes; cache = [int64]$pm.SystemCacheResidentBytes }
}`;

async function info() { return ps.json(`${INFO}\nOut-Json (Get-MemInfo)`); }

/** areas: { workingSets, modified, standby, lowStandby, systemCache } */
async function clean(areas = { workingSets: true, modified: true, standby: true, lowStandby: true, systemCache: true }) {
  const r = await ps.json(`${MEM_TYPE}
${INFO}
$before = Get-MemInfo
[void][WBMem]::Enable('SeProfileSingleProcessPrivilege'); [void][WBMem]::Enable('SeIncreaseQuotaPrivilege'); [void][WBMem]::Enable('SeDebugPrivilege')
$done = @()
if (${areas.workingSets ? '$true' : '$false'}) { [void][WBMem]::WorkingSets(); [void][WBMem]::Command(2); $done += 'workingSets' }
if (${areas.systemCache ? '$true' : '$false'}) { if ([WBMem]::FlushFileCache()) { $done += 'systemCache' } }
if (${areas.modified ? '$true' : '$false'}) { if ([WBMem]::Command(3) -eq 0) { $done += 'modified' } }
if (${areas.standby ? '$true' : '$false'}) { if ([WBMem]::Command(4) -eq 0) { $done += 'standby' } }
elseif (${areas.lowStandby ? '$true' : '$false'}) { if ([WBMem]::Command(5) -eq 0) { $done += 'lowStandby' } }
Start-Sleep -Milliseconds 500
$after = Get-MemInfo
Out-Json @{ before = $before; after = $after; done = $done; freed = [math]::Max(0, $after.free - $before.free) }`, { timeout: 120000 });
  log.info(`Limpeza de RAM: ${(r.freed / 1048576).toFixed(0)} MB liberados (${(r.done || []).join(', ')}).`);
  return r;
}

let timer = null;
async function autoTick() {
  const cfg = store.get().settings.ramAuto;
  try {
    if (cfg.onlyBelowPercent > 0) {
      const m = await info();
      if ((m.free / m.total) * 100 >= cfg.onlyBelowPercent) return;
    }
    await clean();
  } catch (e) { log.warn(`Limpeza automática de RAM falhou: ${e.message}`); }
}
function schedule() {
  if (timer) { clearInterval(timer); timer = null; }
  const cfg = store.get().settings.ramAuto;
  if (cfg.enabled && cfg.minutes >= 1 && ps.IS_WIN) timer = setInterval(autoTick, cfg.minutes * 60 * 1000);
  return cfg;
}
function setAuto(cfg) {
  store.update((d) => { d.settings.ramAuto = { ...d.settings.ramAuto, ...cfg }; });
  return schedule();
}

module.exports = { info, clean, schedule, setAuto };
