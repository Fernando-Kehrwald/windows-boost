// Modo Jogo: otimizações que valem só enquanto o jogo está aberto e são desfeitas ao fechar.
const crypto = require('crypto');
const { execFile } = require('child_process');
const ps = require('../ps');
const store = require('../store');
const log = require('../log');
const engine = require('./tweaks');
const thermal = require('./thermal');

const MMCSS = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile';
const GAMES = MMCSS + '\\Tasks\\Games';
const R = (path, name, value, type = 'DWord') => ({ path, name, value, type });

const HEAVY = ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'zen', 'librewolf', 'Code', 'devenv', 'idea64', 'pycharm64',
  'webstorm64', 'rider64', 'studio64', 'Acrobat', 'AcroRd32', 'Photoshop', 'Illustrator', 'AfterFX', 'Adobe Premiere Pro',
  'Creative Cloud', 'CCXProcess', 'CoreSync', 'OneDrive', 'Dropbox', 'GoogleDriveFS', 'qbittorrent', 'uTorrent', 'BitTorrent',
  'Notion', 'Figma', 'Postman', 'WINWORD', 'EXCEL', 'POWERPNT', 'Obsidian', 'Evernote', 'Slack'];
const PROTECTED = ['steam', 'steamwebhelper', 'EpicGamesLauncher', 'EpicWebHelper', 'Battle.net', 'Agent', 'EADesktop', 'EABackgroundService',
  'Origin', 'GalaxyClient', 'upc', 'UbisoftConnect', 'RiotClientServices', 'RiotClientUx', 'vgc', 'vgtray', 'EasyAntiCheat',
  'EasyAntiCheat_EOS', 'BEService', 'FACEIT', 'faceitclient', 'Discord', 'TeamSpeak', 'ts3client_win64', 'Spotify', 'AnyDesk',
  'TeamViewer', 'Parsec', 'obs64', 'NVIDIA Share', 'RadeonSoftware', 'openvpn', 'wireguard', 'ProtonVPN', 'NordVPN', 'mullvad-daemon',
  'explorer', 'dwm', 'csrss', 'audiodg'];
// Processos de anti-cheat e da plataforma: o Modo Jogo nunca abre, suspende ou altera nenhum deles.
const ANTICHEAT = ['steamservice', 'steam*', 'cs2', 'csgo', 'vgc', 'vgtray', 'vgk', 'EasyAntiCheat*', 'EACLauncher', 'BEService*', 'BEDaisy',
  'FACEIT*', 'faceit*', 'ESEA*', 'GameMon*', 'GameGuard*', 'xigncode*', 'xcoronahost', 'PnkBstr*', 'mhyprot*', 'nProtect*', 'EAAntiCheat*',
  'RiotClient*', 'Valorant*', 'atvi-*', 'ricochet*', 'javelin*', 'TslGame*', 'zakynthos*', 'GameInput*'];
const SERVICES = ['SysMain', 'WSearch', 'DiagTrack', 'dmwappushservice', 'DoSvc', 'MapsBroker', 'RetailDemo', 'TrkWks', 'WerSvc',
  'PcaSvc', 'Fax', 'TabletInputService', 'WbioSrvc', 'WMPNetworkSvc', 'XblAuthManager', 'XblGameSave', 'XboxNetApiSvc'];

// Abre o processo só com PROCESS_SUSPEND_RESUME (0x0800) — nunca com acesso total.
const PROC_TYPE = `Add-Type -Namespace WB -Name Proc -MemberDefinition '
[DllImport("ntdll.dll")] public static extern int NtSuspendProcess(IntPtr h);
[DllImport("ntdll.dll")] public static extern int NtResumeProcess(IntPtr h);
[DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
[DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
public static bool Suspend(int pid, bool resume) { IntPtr h = OpenProcess(0x0800, false, pid); if (h == IntPtr.Zero) return false; try { return (resume ? NtResumeProcess(h) : NtSuspendProcess(h)) == 0; } finally { CloseHandle(h); } }' -ErrorAction SilentlyContinue
function Test-Protected([string]$n) { foreach ($pat in @($P.protect) + @($P.games)) { if ($pat -and $n -like $pat) { return $true } }; return $false }`;

const powerPart = (setting, sub, value) => ({
  apply: `$state = Get-PowerIndex $PWR.${sub} $PWR.${setting}\nSet-PowerIndex $PWR.${sub} $PWR.${setting} ${value} ${value}`,
  unapply: `if ($state) { Set-PowerIndex $PWR.${sub} $PWR.${setting} $state.ac $state.dc }`,
});

const PARTS = {
  thermal: {
    name: 'Guardião térmico e de desempenho',
    desc: 'Monitora thermal throttling, gargalo de CPU, bateria e memória durante o jogo e ajusta o processador sozinho (ex.: limita a 99% para desligar o turbo quando esquenta; libera quando há gargalo). Lembra o que funcionou em cada jogo. Ideal para notebooks.',
    special: true,
  },
  background: {
    name: 'Aliviar segundo plano',
    desc: 'Baixa a prioridade (ou congela, se marcado) de apps pesados: navegadores, editores/IDE, Adobe, OneDrive/Dropbox, torrents, Notion etc. Launchers, anti-cheats, Discord/TeamSpeak, acesso remoto, VPNs e players de música são protegidos.',
    apply: `${PROC_TYPE}
$list = @()
foreach ($p in Get-Process) {
  $n = $p.ProcessName
  if (Test-Protected $n) { continue }
  $heavy = $false; foreach ($pat in $P.heavy) { if ($n -like $pat) { $heavy = $true; break } }
  if (-not $heavy) { continue }
  try {
    $e = @{ id = $p.Id; name = $n; prio = [string]$p.PriorityClass; suspended = $false }
    if ($P.suspend) { $e.suspended = [WB.Proc]::Suspend($p.Id, $false) } else { $p.PriorityClass = 'Idle' }
    $list += $e
  } catch {}
}
$state = @{ procs = $list }`,
    unapply: `${PROC_TYPE}
foreach ($e in @($state.procs)) { if ($null -eq $e) { continue }
  try { $p = Get-Process -Id $e.id -ErrorAction Stop; if ($p.ProcessName -ne $e.name) { continue }
    if ($e.suspended) { [void][WB.Proc]::Suspend($e.id, $true) } elseif ($e.prio) { $p.PriorityClass = $e.prio } } catch {} }`,
  },
  services: {
    name: 'Parar serviços não essenciais',
    desc: `Para durante o jogo: ${SERVICES.join(', ')}. São reiniciados ao fechar o jogo (só os que estavam rodando).`,
    apply: `$stopped = @()
foreach ($n in $P.services) { $s = Get-Service -Name $n -ErrorAction SilentlyContinue
  if ($s -and $s.Status -eq 'Running') { try { Stop-Service -Name $n -Force -ErrorAction Stop; $stopped += $n } catch {} } }
$state = @{ stopped = $stopped }`,
    unapply: `foreach ($n in @($state.stopped)) { if ($n) { Start-Service -Name $n -ErrorAction SilentlyContinue } }`,
  },
  network: {
    name: 'Prioridade de rede',
    desc: 'NetworkThrottlingIndex = 0xFFFFFFFF e SystemResponsiveness = 0.',
    reg: [R(MMCSS, 'NetworkThrottlingIndex', 4294967295), R(MMCSS, 'SystemResponsiveness', 0)],
  },
  bbr2: {
    name: 'Congestionamento TCP BBR2',
    desc: 'Troca o algoritmo de congestionamento TCP para BBR2 (Windows 11). Desligado por padrão: em algumas builds o BBR2 atrapalha conexões locais.',
    apply: `$t = Get-NetTCPSetting -SettingName Internet -ErrorAction SilentlyContinue
$state = @{ cp = if ($t) { ([string]$t.CongestionProvider).ToLower() } else { 'cubic' } }
if (-not (Test-IsWin11)) { throw 'BBR2 exige Windows 11.' }
Run netsh int tcp set supplemental template=Internet congestionprovider=bbr2 | Out-Null`,
    unapply: `$cp = if ($state -and $state.cp -in 'cubic','ctcp','newreno','dctcp') { $state.cp } else { 'cubic' }
Run netsh int tcp set supplemental template=Internet congestionprovider=$cp | Out-Null`,
  },
  gpu: {
    name: 'Prioridade de GPU',
    desc: 'Tarefa "Games" do MMCSS com Priority = 6, GPU Priority = 8 e Scheduling Category = High.',
    reg: [R(GAMES, 'Priority', 6), R(GAMES, 'GPU Priority', 8), R(GAMES, 'Scheduling Category', 'High', 'String')],
  },
  io: { name: 'Prioridade de E/S', desc: 'SFIO Priority = High na tarefa "Games".', reg: [R(GAMES, 'SFIO Priority', 'High', 'String')] },
  cpuidle: {
    name: 'Desativar estados ociosos da CPU',
    desc: 'Desliga o idle do processador no plano de energia (menor latência, mas aumenta bastante a temperatura).',
    ...powerPart('IDLEDISABLE', 'SUB_PROCESSOR', 1),
  },
  aspm: { name: 'ASPM do PCIe', desc: 'Desliga a economia de energia dos links PCIe (GPU, SSD, rede).', ...powerPart('ASPM', 'SUB_PCIE', 0) },
};

const DEFAULT_OPTIONS = { thermal: true, background: true, suspend: false, services: true, network: true, bbr2: false, gpu: true, io: true, cpuidle: false, aspm: true };

function options() { return { ...DEFAULT_OPTIONS, ...(store.get().gameMode.options || {}) }; }
function parts() { return Object.entries(PARTS).map(([id, p]) => ({ id, name: p.name, desc: p.desc })); }

// ---------------- detecção de jogos ----------------
const DETECT_SCRIPT = `
$games = New-Object System.Collections.ArrayList
function Add-Game($name, $source, $dir, $exe) { if ($name -and $dir -and (Test-Path -LiteralPath $dir)) { [void]$games.Add(@{ name = [string]$name; source = $source; dir = ([string]$dir).TrimEnd('\\'); exe = $exe }) } }
# Steam
$steam = Get-RegValue 'HKCU\\Software\\Valve\\Steam' 'SteamPath'
if ($steam) { $steam = $steam -replace '/', '\\'
  $libs = @($steam)
  $vdf = Join-Path $steam 'steamapps\\libraryfolders.vdf'
  if (Test-Path $vdf) { foreach ($m in [regex]::Matches((Get-Content $vdf -Raw), '"path"\\s+"([^"]+)"')) { $libs += ($m.Groups[1].Value -replace '\\\\\\\\', '\\') } }
  foreach ($lib in ($libs | Select-Object -Unique)) {
    Get-ChildItem (Join-Path $lib 'steamapps') -Filter 'appmanifest_*.acf' -ErrorAction SilentlyContinue | ForEach-Object {
      $t = Get-Content $_.FullName -Raw
      $n = [regex]::Match($t, '"name"\\s+"([^"]+)"').Groups[1].Value
      $d = [regex]::Match($t, '"installdir"\\s+"([^"]+)"').Groups[1].Value
      if ($n -and $d -and $n -notmatch 'Steamworks|Redistributable|Proton|Steam Linux Runtime|SteamVR|Wallpaper Engine') { Add-Game $n 'Steam' (Join-Path $lib "steamapps\\common\\$d") $null }
    }
  }
}
# Epic
Get-ChildItem "$env:ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests" -Filter *.item -ErrorAction SilentlyContinue | ForEach-Object {
  try { $j = Get-Content $_.FullName -Raw | ConvertFrom-Json
    if ($j.InstallLocation) { $exe = if ($j.LaunchExecutable) { Join-Path $j.InstallLocation $j.LaunchExecutable } else { $null }; Add-Game $j.DisplayName 'Epic' $j.InstallLocation $exe } } catch {}
}
# GOG
foreach ($root in 'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games', 'HKLM\\SOFTWARE\\GOG.com\\Games') { $k = Open-RegKey $root $false $false
  if ($k) { foreach ($s in $k.GetSubKeyNames()) { $p = "$root\\$s"; Add-Game (Get-RegValue $p 'gameName') 'GOG' (Get-RegValue $p 'path') (Get-RegValue $p 'exe') }; $k.Close() } }
# Ubisoft
$root = 'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs'; $k = Open-RegKey $root $false $false
if ($k) { foreach ($s in $k.GetSubKeyNames()) { $d = Get-RegValue "$root\\$s" 'InstallDir'; if ($d) { $d = ($d -replace '/', '\\').TrimEnd('\\'); Add-Game (Split-Path $d -Leaf) 'Ubisoft' $d $null } }; $k.Close() }
# EA, Battle.net, Riot, Rockstar (pelas entradas de desinstalação)
foreach ($root in 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall') {
  $k = Open-RegKey $root $false $false; if (-not $k) { continue }
  foreach ($s in $k.GetSubKeyNames()) { $p = "$root\\$s"; $pub = [string](Get-RegValue $p 'Publisher' ''); $name = [string](Get-RegValue $p 'DisplayName' '')
    $src = if ($pub -match 'Electronic Arts') { 'EA' } elseif ($pub -match 'Blizzard') { 'Battle.net' } elseif ($pub -match 'Riot Games') { 'Riot' } elseif ($pub -match 'Rockstar Games') { 'Rockstar' } else { $null }
    if ($src -and $name -and $name -notmatch 'EA app|^Origin|Battle\\.net|Riot Client|Launcher|Social Club') { Add-Game $name $src (Get-RegValue $p 'InstallLocation') $null } }
  $k.Close() }
# Xbox / Game Pass
Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | ForEach-Object { $x = Join-Path $_.Root 'XboxGames'
  if (Test-Path $x) { Get-ChildItem $x -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'GameSave' } | ForEach-Object { Add-Game $_.Name 'Xbox' $_.FullName $null } } }
# Descobre o executável principal (o maior .exe que não é instalador/crash reporter)
$skip = '(?i)unins|setup|install|redist|vc_?redist|dxsetup|crash|report|helper|updater|easyanticheat|battleye|beservice|unitycrash|prereq|dotnet|cefprocess|webhelper|7z|python|launcherpatcher|cleanup|touchup'
foreach ($g in $games) {
  if (-not $g.exe -or -not (Test-Path -LiteralPath $g.exe)) {
    $best = Get-ChildItem -LiteralPath $g.dir -Filter *.exe -Recurse -Depth 4 -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch $skip } | Sort-Object Length -Descending | Select-Object -First 1
    $g.exe = if ($best) { $best.FullName } else { $null }
  }
}
Out-Json @{ items = $games.ToArray() }`;

const gid = (dir) => crypto.createHash('md5').update(String(dir).toLowerCase()).digest('hex').slice(0, 12);
const exeName = (p) => String(p || '').split(/[\\/]/).pop().replace(/\.exe$/i, '');

async function detect() {
  const r = await ps.json(DETECT_SCRIPT, { timeout: 5 * 60 * 1000 });
  const found = (r.items || []);
  store.update((d) => {
    const map = Object.fromEntries(d.gameMode.games.map((g) => [g.id, g]));
    for (const f of found) {
      const id = gid(f.dir);
      if (map[id]) { if (!map[id].manual && f.exe && !map[id].exePath) map[id].exePath = f.exe; continue; }
      map[id] = { id, name: f.name, source: f.source, dir: f.dir, exePath: f.exe || '', extraExes: [], enabled: true, manual: false };
    }
    d.gameMode.games = Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  });
  log.info(`Detecção de jogos: ${found.length} encontrados.`);
  return list();
}

function list() { return store.get().gameMode.games.map((g) => ({ ...g, perGame: store.get().gameMode.perGame[g.id] || {} })); }

function addManual(exePath) {
  const dir = exePath.replace(/[\\/][^\\/]+$/, '');
  const id = gid(exePath);
  store.update((d) => { d.gameMode.games = d.gameMode.games.filter((g) => g.id !== id); d.gameMode.games.push({ id, name: exeName(exePath), source: 'Manual', dir, exePath, extraExes: [], enabled: true, manual: true }); });
  return list();
}
function updateGame(id, patch) {
  store.update((d) => { const g = d.gameMode.games.find((x) => x.id === id); if (g) Object.assign(g, patch); });
  return list();
}
function removeGame(id) {
  store.update((d) => { d.gameMode.games = d.gameMode.games.filter((g) => g.id !== id); });
  return list();
}
function processNames(g) { return [exeName(g.exePath), ...(g.extraExes || []).map(exeName)].filter(Boolean); }

// ---------------- ajustes por jogo (persistentes, por .exe) ----------------
const LAYERS = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers';
const GPUPREF = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';
const IFEO = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options';

async function setPerGame(id, key, enabled) {
  const g = store.get().gameMode.games.find((x) => x.id === id);
  if (!g || !g.exePath) throw new Error('Defina o executável do jogo primeiro.');
  const exe = ps.q(g.exePath);
  let script;
  if (key === 'fso' || key === 'dpi') {
    const flag = key === 'fso' ? 'DISABLEDXMAXIMIZEDWINDOWEDMODE' : 'HIGHDPIAWARE';
    script = `$cur = [string](Get-RegValue '${LAYERS}' ${exe} '')
$tok = @($cur -replace '^~\\s*', '' -split '\\s+' | Where-Object { $_ -and $_ -ne '${flag}' })
if (${enabled ? '$true' : '$false'}) { $tok += '${flag}' }
if ($tok.Count) { Set-RegValue '${LAYERS}' ${exe} ('~ ' + ($tok -join ' ')) 'String' } else { Remove-RegValue '${LAYERS}' ${exe} }`;
  } else if (key === 'gpu') {
    script = enabled ? `Set-RegValue '${GPUPREF}' ${exe} 'GpuPreference=2;' 'String'` : `Remove-RegValue '${GPUPREF}' ${exe}`;
  } else if (key === 'segheap' && enabled) {
    throw new Error('Removido por segurança: o Segment Heap muda como a memória do jogo é alocada (opção de depuração do Windows), o que anti-cheats podem interpretar como adulteração.');
  } else if (key === 'segheap') {
    const name = ps.q(g.exePath.split(/[\\/]/).pop());
    script = enabled ? `Set-RegValue ('${IFEO}\\' + ${name}) 'FrontEndHeapDebugOptions' 8` : `Remove-RegValue ('${IFEO}\\' + ${name}) 'FrontEndHeapDebugOptions'`;
  } else throw new Error('Opção inválida');
  await ps.run(script);
  store.update((d) => { d.gameMode.perGame[id] = { ...(d.gameMode.perGame[id] || {}), [key]: enabled }; });
  log.info(`Jogo ${g.name}: ${key} ${enabled ? 'ligado' : 'desligado'}`);
  return list();
}

// ---------------- sessão ----------------
let busy = false;
let listeners = [];
function onStatus(fn) { listeners.push(fn); }
function emit() { const s = statusInfo(); listeners.forEach((f) => { try { f(s); } catch {} }); }
function statusInfo() {
  const s = store.get().gameSession;
  return { active: !!s, game: s ? s.game : null, since: s ? s.at : null, auto: !!store.get().gameMode.auto, busy };
}

async function start(gameId, reason) {
  if (busy || store.get().gameSession) return statusInfo();
  busy = true; emit();
  try {
    const opts = options();
    const game = gameId ? store.get().gameMode.games.find((g) => g.id === gameId) : null;
    const games = game ? processNames(game) : [];
    const services = SERVICES.filter((s) => !(game && game.source === 'Xbox' && /^Xbl|^Xbox/.test(s)));
    // Protege TODOS os jogos da lista (não só o atual), a plataforma e os anti-cheats.
    const params = { heavy: HEAVY, protect: protectedNames(), suspend: !!opts.suspend, services, games };
    const chosen = Object.keys(PARTS).filter((k) => opts[k]);
    const defs = chosen.filter((k) => !PARTS[k].special).map((k) => ({ id: `gm_${k}`, ...PARTS[k] }));
    // Marca a sessão ANTES de mexer em algo, para conseguir desfazer se o PC desligar no meio.
    store.update((d) => { d.gameSession = { at: Date.now(), game: game ? game.name : 'Manual', gameId: gameId || null, parts: {}, params }; });
    const script = `$__R = [ordered]@{}\n${defs.map((t) => engine.applyBlock(t, params)).join('\n')}\nOut-Json $__R`;
    const r = await ps.json(script, { timeout: 120000 });
    store.update((d) => { for (const t of defs) if (r[t.id] && r[t.id].ok) d.gameSession.parts[t.id] = { backup: r[t.id].backup, state: r[t.id].state }; });
    const failed = defs.filter((t) => !(r[t.id] && r[t.id].ok)).map((t) => `${t.name}: ${(r[t.id] || {}).error || 'falhou'}`);
    if (opts.thermal) await thermal.start({ key: game ? game.id : 'manual', name: game ? game.name : 'sessão manual' }).catch((e) => log.warn(e.message));
    log.info(`Modo Jogo ligado (${reason || 'manual'})${game ? ` para ${game.name}` : ''}. ${failed.length ? 'Falhas: ' + failed.join('; ') : ''}`);
    return { ...statusInfo(), failed };
  } catch (e) {
    log.error(`Falha ao ligar o Modo Jogo: ${e.message}`);
    throw e;
  } finally { busy = false; emit(); }
}

async function stop(reason) {
  const s = store.get().gameSession;
  if (!s || busy) return statusInfo();
  busy = true; emit();
  try {
    await thermal.stop().catch((e) => log.warn(e.message));
    const defs = Object.keys(s.parts).filter((id) => PARTS[id.replace(/^gm_/, '')]).map((id) => ({ id, ...PARTS[id.replace(/^gm_/, '')], params: s.params }));
    if (defs.length) {
      const script = `$__R = [ordered]@{}\n${defs.map((t) => engine.unapplyBlock(t, s.parts[t.id])).join('\n')}\nOut-Json $__R`;
      await ps.json(script, { timeout: 120000 });
    }
    store.update((d) => { d.gameSession = null; });
    log.info(`Modo Jogo desligado (${reason || 'manual'}); tudo desfeito.`);
  } catch (e) {
    log.error(`Falha ao desfazer o Modo Jogo: ${e.message}`);
    throw e;
  } finally { busy = false; emit(); }
  return statusInfo();
}

// ---------------- modo automático ----------------
let watchTimer = null;
let missing = 0;
function runningProcesses() {
  return new Promise((resolve) => {
    execFile('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve(new Set());
      const set = new Set();
      for (const line of out.split(/\r?\n/)) { const m = line.match(/^"([^"]+)"/); if (m) set.add(m[1].replace(/\.exe$/i, '').toLowerCase()); }
      resolve(set);
    });
  });
}
async function tick() {
  if (busy) return;
  const procs = await runningProcesses();
  const s = store.get().gameSession;
  const games = store.get().gameMode.games.filter((g) => g.enabled);
  const runningGame = games.find((g) => processNames(g).some((n) => procs.has(n.toLowerCase())));
  if (!s && runningGame) { missing = 0; await start(runningGame.id, 'automático').catch(() => {}); return; }
  if (s && s.gameId) {
    const g = games.find((x) => x.id === s.gameId);
    const alive = g && processNames(g).some((n) => procs.has(n.toLowerCase()));
    if (!alive) { missing++; if (missing >= 2) { missing = 0; await stop('jogo fechado').catch(() => {}); } } else missing = 0;
  }
}
function setAuto(on) {
  store.update((d) => { d.gameMode.auto = !!on; });
  if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
  if (on && ps.IS_WIN) watchTimer = setInterval(() => { tick().catch(() => {}); }, 4000);
  emit();
  return statusInfo();
}
function setOptions(o) { store.update((d) => { d.gameMode.options = { ...options(), ...o }; }); return options(); }

/** Chamado na abertura do app: se o PC desligou com o Modo Jogo ativo, desfaz agora. */
/** Nomes que nunca podem ser tocados: launchers, anti-cheats e todos os jogos da lista. */
function protectedNames() {
  const games = store.get().gameMode.games.flatMap(processNames);
  return [...new Set([...PROTECTED, ...ANTICHEAT, ...games])];
}
function isSessionActive() { return !!store.get().gameSession; }

async function recover() {
  // Versões anteriores permitiam Segment Heap por jogo (IFEO). Remove para não deixar nada no executável do jogo.
  const seg = store.get().gameMode.games.filter((g) => (store.get().gameMode.perGame[g.id] || {}).segheap);
  for (const g of seg) await setPerGame(g.id, 'segheap', false).catch(() => {});
  if (store.get().gameSession) {
    log.warn('Sessão do Modo Jogo pendente encontrada (o app ou o PC fechou no meio). Desfazendo...');
    await stop('recuperação').catch((e) => log.error(e.message));
  }
  if (store.get().gameMode.auto) setAuto(true);
}

module.exports = { protectedNames, isSessionActive, ANTICHEAT, detect, list, addManual, updateGame, removeGame, setPerGame, start, stop, setAuto, setOptions, options, parts, statusInfo, onStatus, recover, HEAVY, PROTECTED };
