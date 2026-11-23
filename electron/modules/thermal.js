// Guardião térmico e de desempenho do Modo Jogo.
// Durante o jogo, lê sensores do Windows (contadores de desempenho, zonas térmicas ACPI, bateria) e da GPU NVIDIA
// (nvidia-smi) — sem nunca abrir o processo do jogo — e ajusta o processador numa "escada" de níveis:
//   -1  Desempenho: turbo agressivo + preferência máxima de desempenho (quando há gargalo de CPU e está frio)
//    0  Padrão: valores originais do plano (+ resfriamento ativo: ventoinhas antes de reduzir clock)
//    1  CPU a 99%: desliga o turbo — esquenta bem menos e perde pouco desempenho
//    2  CPU a 90%      3  CPU a 80%
// Sobe um degrau quando detecta thermal throttling e desce quando está frio e a CPU vira gargalo.
// O nível que funcionou é lembrado por jogo e usado como ponto de partida na próxima sessão.
const ps = require('../ps');
const store = require('../store');
const log = require('../log');

const LEVELS = {
  '-1': { label: 'Desempenho (turbo agressivo)', max: 100 },
  0: { label: 'Padrão do plano', max: null },
  1: { label: 'CPU a 99% (turbo desligado)', max: 99 },
  2: { label: 'CPU a 90%', max: 90 },
  3: { label: 'CPU a 80%', max: 80 },
};
const MIN_LEVEL = -1;
const MAX_LEVEL = 3;

const DEFAULT_CFG = { cpuHot: 95, gpuHot: 87, learned: {}, lastReport: null };
function cfg() { return { ...DEFAULT_CFG, ...(store.get().gameMode.thermal || {}) }; }
function setConfig(patch) {
  store.update((d) => { d.gameMode.thermal = { ...cfg(), ...patch }; });
  return cfg();
}
function resetLearned(key) {
  store.update((d) => { const c = { ...cfg() }; c.learned = key ? { ...c.learned, [key]: undefined } : {}; if (key) delete c.learned[key]; d.gameMode.thermal = c; });
  return cfg();
}

let ram = null;
function setRam(r) { ram = r; }
let listeners = [];
let eventListeners = [];
function onState(fn) { listeners.push(fn); }
function onEvent(fn) { eventListeners.push(fn); }

// ---------------- leitura dos sensores ----------------
const SAMPLE_FN = `
$smi = @("$env:SystemRoot\\System32\\nvidia-smi.exe", "$env:ProgramFiles\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
$script:smiMode = 0
function N($s) { $d = 0.0; if ($null -ne $s -and [double]::TryParse(([string]$s).Trim(), [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$d)) { return $d }; return $null }
function Read-Smi($o) {
  $ErrorActionPreference = 'Continue'
  if (-not $smi -or $script:smiMode -ge 3) { return }
  $base = 'temperature.gpu,utilization.gpu,clocks.gr,clocks.max.gr,power.draw'
  $q = switch ($script:smiMode) { 0 { "$base,clocks_event_reasons.hw_thermal_slowdown,clocks_event_reasons.sw_thermal_slowdown,clocks_event_reasons.sw_power_cap" } 1 { "$base,clocks_throttle_reasons.hw_thermal_slowdown,clocks_throttle_reasons.sw_thermal_slowdown,clocks_throttle_reasons.sw_power_cap" } default { $base } }
  $line = (& $smi "--query-gpu=$q" '--format=csv,noheader,nounits' 2>$null | Select-Object -First 1)
  if ($LASTEXITCODE -ne 0 -or -not $line -or $line -match 'Field|valid|ERROR') { $script:smiMode++; return }
  $v = @($line -split ',\\s*')
  $o.gpuTemp = N $v[0]; $o.gpuUtil = N $v[1]; $o.gpuClock = N $v[2]; $o.gpuClockMax = N $v[3]; $o.gpuPower = N $v[4]
  if ($v.Count -ge 8) { $o.gpuThermal = ([string]$v[5]).Trim() -eq 'Active' -or ([string]$v[6]).Trim() -eq 'Active'; $o.gpuPowerCap = ([string]$v[7]).Trim() -eq 'Active' }
}
function Get-Sample {
  $o = [ordered]@{}
  try {
    $pi = @(Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -ErrorAction Stop)
    $tot = $pi | Where-Object { $_.Name -eq '_Total' } | Select-Object -First 1
    if ($tot) { $o.cpu = [double]$tot.PercentProcessorTime; $o.perf = [double]$tot.PercentProcessorPerformance; $o.limit = [double]$tot.PercentPerformanceLimit; $o.freq = [double]$tot.ProcessorFrequency }
    $o.maxCore = [double](($pi | Where-Object { $_.Name -notmatch '_Total' } | Measure-Object PercentProcessorTime -Maximum).Maximum)
  } catch {}
  try {
    $tz = @(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction Stop)
    $temps = @($tz | ForEach-Object { if ($_.HighPrecisionTemperature) { $_.HighPrecisionTemperature / 10.0 - 273.15 } elseif ($_.Temperature) { $_.Temperature - 273.15 } } | Where-Object { $_ -gt 20 -and $_ -lt 125 })
    if ($temps.Count) { $o.cpuTemp = [math]::Round(($temps | Measure-Object -Maximum).Maximum, 1) }
    $pl = @($tz | ForEach-Object { [double]$_.PercentPassiveLimit } | Where-Object { $_ -gt 0 -and $_ -le 100 })
    if ($pl.Count) { $o.passive = ($pl | Measure-Object -Minimum).Minimum }
  } catch {}
  try { $b = Get-CimInstance Win32_Battery -ErrorAction Stop | Select-Object -First 1
    if ($b) { $o.onAC = ([int]$b.BatteryStatus -notin 1, 4, 5); $o.battery = [int]$b.EstimatedChargeRemaining } } catch {}
  try { $os = Get-CimInstance Win32_OperatingSystem; $o.ramTotal = [int64]$os.TotalVisibleMemorySize * 1024; $o.ramFree = [int64]$os.FreePhysicalMemory * 1024 } catch {}
  try {
    $eng = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop | Where-Object { $_.Name -match 'engtype_3D' }
    $o.gpuUtil = [math]::Min(100, [double](($eng | Group-Object { ($_.Name -split '_eng_')[0] } | ForEach-Object { ($_.Group | Measure-Object UtilizationPercentage -Sum).Sum } | Measure-Object -Maximum).Maximum))
  } catch {}
  Read-Smi $o
  return $o
}`;
const MONITOR = `${SAMPLE_FN}
while ($true) { [Console]::Out.WriteLine(((Get-Sample) | ConvertTo-Json -Compress)); [Console]::Out.Flush(); Start-Sleep -Seconds 2 }`;

/** Uma leitura avulsa — para o usuário ver quais sensores o PC tem. */
async function probe() {
  return ps.json(`${SAMPLE_FN}\n$null = Get-Sample; Start-Sleep -Milliseconds 800\nOut-Json (Get-Sample)`, { timeout: 60000 });
}

// ---------------- plano de energia ----------------
const READ_ORIG = `$ch = @((Get-CimInstance Win32_SystemEnclosure -ErrorAction SilentlyContinue).ChassisTypes)
$lap = [bool]($ch | Where-Object { $_ -in 8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32 })
Out-Json @{ laptop = $lap; max = (Get-PowerIndex $PWR.SUB_PROCESSOR $PWR.PROCTHROTTLEMAX); epp = (Get-PowerIndex $PWR.SUB_PROCESSOR $PWR.PERFEPP)
  boost = (Get-PowerIndex $PWR.SUB_PROCESSOR $PWR.PERFBOOSTMODE); cool = (Get-PowerIndex $PWR.SUB_PROCESSOR $PWR.SYSCOOLPOL) }`;

const num = (v) => (v === null || v === undefined ? '$null' : String(Math.round(v)));
function setLine(name, ac, dc) { return `Set-PowerIndex $PWR.SUB_PROCESSOR $PWR.${name} ${num(ac)} ${num(dc)}`; }

function levelScript(n, orig) {
  const L = [];
  if (orig.max) {
    const cap = LEVELS[n].max;
    const pick = (o) => (n === 0 ? o : n === -1 ? Math.max(o, 100) : Math.min(o, cap));
    L.push(setLine('PROCTHROTTLEMAX', pick(orig.max.ac), pick(orig.max.dc)));
  }
  if (orig.epp) L.push(setLine('PERFEPP', n === -1 ? 0 : orig.epp.ac, orig.epp.dc));
  if (orig.boost) L.push(setLine('PERFBOOSTMODE', n === -1 ? 2 : orig.boost.ac, orig.boost.dc));
  if (orig.cool) L.push(setLine('SYSCOOLPOL', 1, 1));
  return L.join('\n');
}
function restoreScript(orig) {
  const L = [];
  for (const [k, name] of [['max', 'PROCTHROTTLEMAX'], ['epp', 'PERFEPP'], ['boost', 'PERFBOOSTMODE'], ['cool', 'SYSCOOLPOL']]) {
    if (orig && orig[k]) L.push(setLine(name, orig[k].ac, orig[k].dc));
  }
  return L.join('\n');
}

// ---------------- controlador ----------------
let proc = null;
let st = null;

function publicState() {
  if (!st) return { running: false, report: cfg().lastReport, learned: cfg().learned };
  return {
    running: true, game: st.name, level: st.level, levelLabel: LEVELS[st.level].label, floor: st.floor,
    last: st.last, peaks: st.peaks, throttleSecs: st.throttleSecs, events: st.events.slice(-40), since: st.startedAt,
    learned: cfg().learned,
  };
}
function emit() { const s = publicState(); listeners.forEach((f) => { try { f(s); } catch {} }); }
function event(type, text) {
  if (!st) return;
  const e = { at: Date.now(), type, text };
  st.events.push(e);
  if (st.events.length > 80) st.events.shift();
  log[type === 'warn' ? 'warn' : 'info'](`Guardião térmico: ${text}`);
  eventListeners.forEach((f) => { try { f(e); } catch {} });
}

let applying = false;
async function setLevel(n, reason) {
  if (!st) return;
  applying = true;
  try {
    await ps.run(levelScript(n, st.orig));
    const prev = st.level;
    st.level = n; st.lastChange = Date.now();
    if (n > st.maxLevel) st.maxLevel = n;
    store.update((d) => { if (d.gameSession && d.gameSession.thermal) d.gameSession.thermal.level = n; });
    event('act', `${reason} → ${LEVELS[n].label}${prev !== n ? '' : ''}`);
  } catch (e) {
    event('warn', `Não foi possível ajustar o plano de energia: ${e.message}`);
  } finally { applying = false; emit(); }
}

const avg = (arr, k) => { const v = arr.map((s) => s[k]).filter((x) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

function onSample(s) {
  if (!st) return;
  const now = Date.now();
  const c = cfg();
  st.last = s;
  st.samples.push(s);
  if (st.samples.length > 6) st.samples.shift();
  if (typeof s.cpuTemp === 'number') st.peaks.cpuTemp = Math.max(st.peaks.cpuTemp || 0, s.cpuTemp);
  if (typeof s.gpuTemp === 'number') st.peaks.gpuTemp = Math.max(st.peaks.gpuTemp || 0, s.gpuTemp);

  // --- sinais de thermal throttling ---
  const cap = LEVELS[st.level].max || 100;
  const reasons = [];
  if (typeof s.passive === 'number' && s.passive < 100) reasons.push(`o Windows está freando a CPU por temperatura (${Math.round(s.passive)}%)`);
  if (typeof s.cpuTemp === 'number' && s.cpuTemp >= c.cpuHot) reasons.push(`sensor a ${s.cpuTemp} °C`);
  if (s.onAC !== false && typeof s.limit === 'number' && s.limit > 0 && s.limit < cap - 5 && (s.cpu || 0) >= 25) reasons.push(`desempenho da CPU limitado a ${Math.round(s.limit)}% pela plataforma`);
  // Em notebook, CPU e GPU dividem os heat pipes: segurar a CPU dá folga térmica para a GPU. Em desktop, não.
  if (st.orig.laptop) {
    if (s.gpuThermal) reasons.push('GPU baixando clock por temperatura (o calor é dividido com a CPU)');
    else if (typeof s.gpuTemp === 'number' && s.gpuTemp >= c.gpuHot) reasons.push(`GPU a ${s.gpuTemp} °C`);
  }
  const throttle = reasons.length > 0;
  if (throttle) { st.throttleRun++; st.throttleSecs += 2; st.coolSince = null; } else { st.throttleRun = 0; if (!st.coolSince) st.coolSince = now; }
  st.lastReasons = reasons;

  // --- gargalo de CPU (a GPU fica esperando a CPU) ---
  const w = st.samples;
  const gpuU = avg(w, 'gpuUtil');
  const cpuBusy = (avg(w, 'maxCore') || 0) >= 90 || (avg(w, 'cpu') || 0) >= 85;
  const bottleneck = w.length >= 5 && gpuU !== null && gpuU < 70 && cpuBusy;
  const hotGpu = s.gpuThermal || (typeof s.gpuTemp === 'number' && s.gpuTemp >= c.gpuHot);

  if (!applying) {
    const since = now - st.lastChange;
    if (st.throttleRun >= 3 && st.level < MAX_LEVEL && (since >= 45000 || st.level <= 0)) {
      const next = st.level <= 0 ? 1 : st.level + 1;
      // Se tinha acabado de liberar e voltou a esquentar, esse degrau vira o "piso" da sessão (evita ficar oscilando).
      if (st.relaxedAt && now - st.relaxedAt < 300000) { st.floor = Math.max(st.floor, next); st.relaxedAt = 0; }
      setLevel(next, `Thermal throttling detectado (${reasons.join('; ')})`);
    } else if (bottleneck && st.coolSince && since >= 120000) {
      const cool = now - st.coolSince;
      if (st.level >= 1 && st.level > st.floor && cool >= 240000) {
        st.relaxedAt = now;
        setLevel(st.level - 1, 'Temperatura estável há 4 min e a CPU está segurando a GPU (gargalo)');
      } else if (st.level === 0 && st.floor <= 0 && st.throttleSecs === 0 && cool >= 60000 && s.onAC !== false) {
        // Turbo agressivo só se o PC não esquentou nenhuma vez nesta sessão.
        setLevel(-1, 'Gargalo de CPU com temperatura sob controle');
      } else if (!st.warned.bottleneck || now - st.warned.bottleneck > 600000) {
        st.warned.bottleneck = now;
        event('info', `Gargalo de CPU (GPU em ${Math.round(gpuU)}%): feche programas pesados e reduza opções que pesam na CPU (distância de visão, física, multidões).`);
      }
    }
  }

  // --- outros problemas ---
  if (s.onAC === false && !st.warned.battery) { st.warned.battery = true; event('warn', `Notebook na bateria (${s.battery ?? '?'}%): o Windows e o fabricante limitam CPU e GPU. Ligue o carregador para jogar.`); }
  if (s.onAC === true) st.warned.battery = false;
  if (hotGpu && !st.warned.gpuTip) { st.warned.gpuTip = true; event('info', 'GPU quente: limitar o FPS no jogo à taxa do monitor (no CS2: fps_max igual aos Hz da tela) reduz bastante o calor sem perder fluidez. Notebook: use uma base com ventilação e mantenha as saídas de ar livres.'); }
  if (s.ramTotal && s.ramFree / s.ramTotal < 0.08 && now - st.lastRamPurge > 300000 && ram) {
    st.lastRamPurge = now;
    ram.clean({ workingSets: false, modified: false, standby: true, lowStandby: true, systemCache: false })
      .then((r) => event('act', `Memória quase cheia → cache standby liberado (+${Math.round((r.freed || 0) / 1048576)} MB)`)).catch(() => {});
  }
  emit();
}

async function start({ key, name }) {
  if (!ps.IS_WIN || st) return;
  let orig;
  try { orig = await ps.json(READ_ORIG); } catch (e) { log.warn(`Guardião térmico não iniciou: ${e.message}`); return; }
  st = { key, name, level: 0, floor: 0, maxLevel: 0, orig, samples: [], events: [], peaks: {}, throttleSecs: 0, lastChange: Date.now(),
    relaxedAt: 0, throttleRun: 0, coolSince: Date.now(), warned: {}, startedAt: Date.now(), last: null, lastRamPurge: 0 };
  store.update((d) => { if (d.gameSession) d.gameSession.thermal = { orig, level: 0, key }; });
  const learned = cfg().learned[key];
  if (typeof learned === 'number' && learned >= 1) await setLevel(Math.min(learned, MAX_LEVEL), `Começando no nível que funcionou da última vez em ${name}`);
  else await setLevel(0, 'Resfriamento ativo ligado (ventoinhas aceleram antes de o processador perder clock)');
  proc = ps.spawnPersistent(MONITOR);
  if (proc) {
    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      const lines = buf.split(/\r?\n/); buf = lines.pop();
      for (const l of lines) { try { onSample(JSON.parse(l)); } catch {} }
    });
    proc.on('close', () => { proc = null; });
  }
  emit();
}

async function stop() {
  if (proc) { try { proc.kill(); } catch {} proc = null; }
  const saved = st ? { orig: st.orig } : (store.get().gameSession && store.get().gameSession.thermal);
  if (saved && saved.orig) {
    try { await ps.run(restoreScript(saved.orig)); } catch (e) { log.error(`Guardião térmico: falha ao restaurar o plano de energia: ${e.message}`); }
  }
  if (st) {
    const c = cfg();
    const learned = { ...c.learned };
    // Aprendizado: se houve throttling, guarda o nível em que a sessão terminou; se não houve, relaxa um degrau para a próxima.
    if (st.throttleSecs > 0 && st.level >= 1) learned[st.key] = st.level;
    else if (typeof learned[st.key] === 'number' && st.throttleSecs === 0) learned[st.key] = learned[st.key] - 1 >= 1 ? learned[st.key] - 1 : undefined;
    if (learned[st.key] === undefined) delete learned[st.key];
    const report = {
      game: st.name, at: Date.now(), minutes: Math.round((Date.now() - st.startedAt) / 60000), peaks: st.peaks,
      throttleSecs: st.throttleSecs, finalLevel: LEVELS[st.level].label, maxLevel: LEVELS[st.maxLevel].label,
      learned: learned[st.key] !== undefined ? LEVELS[learned[st.key]].label : null,
      events: st.events.filter((e) => e.type !== 'info' || /Gargalo/.test(e.text)).slice(-15),
    };
    setConfig({ learned, lastReport: report });
    log.info(`Guardião térmico encerrado: pico CPU ${st.peaks.cpuTemp ?? '?'} °C, GPU ${st.peaks.gpuTemp ?? '?'} °C, ${st.throttleSecs}s em throttling.`);
  }
  st = null;
  emit();
}

module.exports = { start, stop, probe, publicState, onState, onEvent, setRam, cfg, setConfig, resetLearned, LEVELS, levelScript, restoreScript, onSample: (s) => onSample(s) };
