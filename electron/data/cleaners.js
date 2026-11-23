// Definições de limpeza. dirs = apaga o CONTEÚDO da pasta (aceita curingas); globs = apaga arquivos que casam com o padrão.
// def: marcado por padrão. Itens de "histórico/cookies/sessões" ficam desmarcados (deslogam você de sites/apps).

const L = '%LOCALAPPDATA%';
const A = '%APPDATA%';

const windows = [
  { id: 'win_temp_user', name: 'Arquivos temporários do usuário', dirs: ['%TEMP%'], def: true },
  { id: 'win_temp_sys', name: 'Arquivos temporários do Windows', dirs: ['%SystemRoot%\\Temp'], def: true },
  { id: 'win_prefetch', name: 'Prefetch', desc: 'O Windows recria aos poucos; o primeiro boot após limpar pode ser um pouco mais lento.', dirs: ['%SystemRoot%\\Prefetch'], def: false },
  { id: 'win_recycle', name: 'Lixeira', special: 'recyclebin', def: true },
  { id: 'win_wu', name: 'Cache de downloads do Windows Update', desc: 'SoftwareDistribution\\Download (atualizações já instaladas).', dirs: ['%SystemRoot%\\SoftwareDistribution\\Download'], special: 'wu', def: true },
  { id: 'win_do', name: 'Cache da Otimização de Entrega', dirs: ['%SystemRoot%\\ServiceProfiles\\NetworkService\\AppData\\Local\\Microsoft\\Windows\\DeliveryOptimization\\Cache'], special: 'do', def: true },
  { id: 'win_thumbs', name: 'Cache de miniaturas', globs: [`${L}\\Microsoft\\Windows\\Explorer\\thumbcache_*.db`, `${L}\\Microsoft\\Windows\\Explorer\\iconcache_*.db`], def: true },
  { id: 'win_wer', name: 'Relatórios de erro', dirs: ['%ProgramData%\\Microsoft\\Windows\\WER\\ReportArchive', '%ProgramData%\\Microsoft\\Windows\\WER\\ReportQueue', `${L}\\Microsoft\\Windows\\WER\\ReportArchive`, `${L}\\Microsoft\\Windows\\WER\\ReportQueue`], def: true },
  { id: 'win_dumps', name: 'Despejos de memória (crash dumps)', dirs: [`${L}\\CrashDumps`, '%SystemRoot%\\Minidump', '%SystemRoot%\\LiveKernelReports'], globs: ['%SystemRoot%\\MEMORY.DMP'], def: true },
  { id: 'win_d3d', name: 'Cache de shaders DirectX', desc: 'Os jogos recompilam shaders na próxima execução (pode haver travadas no início).', dirs: [`${L}\\D3DSCache`], def: false },
  { id: 'win_nv_shaders', name: 'Cache de shaders NVIDIA', dirs: [`${L}\\NVIDIA\\DXCache`, `${L}\\NVIDIA\\GLCache`, `${L}Low\\NVIDIA\\PerDriverVersion\\DXCache`], def: false },
  { id: 'win_amd_shaders', name: 'Cache de shaders AMD', dirs: [`${L}\\AMD\\DxCache`, `${L}\\AMD\\DxcCache`, `${L}\\AMD\\VkCache`, `${L}\\AMD\\GLCache`], def: false },
  { id: 'win_logs', name: 'Logs do Windows (instalação/CBS/DISM)', globs: ['%SystemRoot%\\Logs\\CBS\\*.log', '%SystemRoot%\\Logs\\DISM\\*.log', '%SystemRoot%\\Panther\\*.log', '%SystemRoot%\\*.log'], def: false },
  { id: 'win_recent', name: 'Documentos recentes e Jump Lists', desc: 'Limpa a lista de itens recentes do Explorer/Iniciar.', globs: [`${A}\\Microsoft\\Windows\\Recent\\*.lnk`], dirs: [`${A}\\Microsoft\\Windows\\Recent\\AutomaticDestinations`, `${A}\\Microsoft\\Windows\\Recent\\CustomDestinations`], def: false },
  { id: 'win_fontcache', name: 'Cache de fontes', dirs: ['%SystemRoot%\\ServiceProfiles\\LocalService\\AppData\\Local\\FontCache'], def: false },
];

// Navegadores baseados em Chromium: user data dir + pasta de cache (às vezes separada)
const chromium = (id, name, ud, procs, cacheRoot) => {
  const p = `${ud}\\*`;
  const c = cacheRoot ? `${cacheRoot}\\*` : p;
  return [
    { id: `${id}_cache`, app: name, name: 'Cache', procs, dirs: [`${c}\\Cache\\Cache_Data`, `${c}\\Code Cache`, `${c}\\GPUCache`, `${p}\\Service Worker\\CacheStorage`, `${p}\\Service Worker\\ScriptCache`, `${ud}\\ShaderCache`, `${ud}\\GrShaderCache`], def: true },
    { id: `${id}_cookies`, app: name, name: 'Cookies (desloga dos sites)', procs, globs: [`${p}\\Network\\Cookies`, `${p}\\Network\\Cookies-journal`, `${p}\\Cookies`], def: false },
    { id: `${id}_history`, app: name, name: 'Histórico', procs, globs: [`${p}\\History`, `${p}\\History-journal`, `${p}\\Visited Links`, `${p}\\Top Sites`, `${p}\\Top Sites-journal`], def: false },
    { id: `${id}_sessions`, app: name, name: 'Sessões (abas abertas)', procs, dirs: [`${p}\\Sessions`], globs: [`${p}\\Current Session`, `${p}\\Current Tabs`, `${p}\\Last Session`, `${p}\\Last Tabs`], def: false },
  ];
};
// Navegadores baseados em Firefox (o histórico fica junto com os favoritos em places.sqlite, por isso não é apagado)
const gecko = (id, name, roamingProfiles, localProfiles, procs) => [
  { id: `${id}_cache`, app: name, name: 'Cache', procs, dirs: [`${localProfiles}\\*\\cache2`, `${localProfiles}\\*\\startupCache`, `${localProfiles}\\*\\thumbnails`, `${roamingProfiles}\\*\\shader-cache`], def: true },
  { id: `${id}_cookies`, app: name, name: 'Cookies (desloga dos sites)', procs, globs: [`${roamingProfiles}\\*\\cookies.sqlite`, `${roamingProfiles}\\*\\cookies.sqlite-wal`], def: false },
  { id: `${id}_sessions`, app: name, name: 'Sessões (abas abertas)', procs, dirs: [`${roamingProfiles}\\*\\sessionstore-backups`], globs: [`${roamingProfiles}\\*\\sessionstore.jsonlz4`], def: false },
];
// Apps Electron/CEF: estrutura padrão de cache
const electron = (id, name, base, procs, extra = {}) => ({
  id: `${id}_cache`, app: name, name: 'Cache e logs', procs,
  dirs: [`${base}\\Cache`, `${base}\\Code Cache`, `${base}\\GPUCache`, `${base}\\DawnCache`, `${base}\\DawnGraphiteCache`, `${base}\\Service Worker\\CacheStorage`, `${base}\\logs`, ...(extra.dirs || [])],
  globs: extra.globs || [], def: true,
});

const programs = [
  ...chromium('chrome', 'Google Chrome', `${L}\\Google\\Chrome\\User Data`, ['chrome']),
  ...chromium('edge', 'Microsoft Edge', `${L}\\Microsoft\\Edge\\User Data`, ['msedge']),
  ...chromium('brave', 'Brave', `${L}\\BraveSoftware\\Brave-Browser\\User Data`, ['brave']),
  ...chromium('vivaldi', 'Vivaldi', `${L}\\Vivaldi\\User Data`, ['vivaldi']),
  ...chromium('chromium', 'Chromium', `${L}\\Chromium\\User Data`, ['chrome']),
  { id: 'opera_cache', app: 'Opera', name: 'Cache', procs: ['opera'], dirs: [`${L}\\Opera Software\\Opera Stable\\Cache`, `${A}\\Opera Software\\Opera Stable\\Code Cache`, `${A}\\Opera Software\\Opera Stable\\GPUCache`, `${L}\\Opera Software\\Opera Stable\\Default\\Cache`, `${A}\\Opera Software\\Opera Stable\\Default\\Code Cache`], def: true },
  { id: 'opera_history', app: 'Opera', name: 'Histórico', procs: ['opera'], globs: [`${A}\\Opera Software\\Opera Stable\\History`, `${A}\\Opera Software\\Opera Stable\\Default\\History`, `${A}\\Opera Software\\Opera Stable\\Visited Links`], def: false },
  { id: 'operagx_cache', app: 'Opera GX', name: 'Cache', procs: ['opera'], dirs: [`${L}\\Opera Software\\Opera GX Stable\\Cache`, `${A}\\Opera Software\\Opera GX Stable\\Code Cache`, `${A}\\Opera Software\\Opera GX Stable\\GPUCache`], def: true },
  ...gecko('firefox', 'Mozilla Firefox', `${A}\\Mozilla\\Firefox\\Profiles`, `${L}\\Mozilla\\Firefox\\Profiles`, ['firefox']),
  ...gecko('zen', 'Zen Browser', `${A}\\zen\\Profiles`, `${L}\\zen\\Profiles`, ['zen']),
  ...gecko('librewolf', 'LibreWolf', `${A}\\librewolf\\Profiles`, `${L}\\librewolf\\Profiles`, ['librewolf']),
  ...gecko('waterfox', 'Waterfox', `${A}\\Waterfox\\Profiles`, `${L}\\Waterfox\\Profiles`, ['waterfox']),
  ...gecko('floorp', 'Floorp', `${A}\\Floorp\\Profiles`, `${L}\\Floorp\\Profiles`, ['floorp']),
  { id: 'thunderbird_cache', app: 'Thunderbird', name: 'Cache', procs: ['thunderbird'], dirs: [`${L}\\Thunderbird\\Profiles\\*\\cache2`, `${L}\\Thunderbird\\Profiles\\*\\startupCache`], def: true },

  electron('discord', 'Discord', `${A}\\discord`, ['Discord']),
  electron('slack', 'Slack', `${A}\\Slack`, ['slack']),
  electron('teams', 'Microsoft Teams (clássico)', `${A}\\Microsoft\\Teams`, ['Teams'], { dirs: [`${A}\\Microsoft\\Teams\\blob_storage`, `${A}\\Microsoft\\Teams\\tmp`] }),
  { id: 'teams2_cache', app: 'Microsoft Teams (novo)', name: 'Cache', procs: ['ms-teams'], dirs: [`${L}\\Packages\\MSTeams_8wekyb3d8bbwe\\LocalCache\\Microsoft\\MSTeams\\EBWebView\\Default\\Cache`, `${L}\\Packages\\MSTeams_8wekyb3d8bbwe\\LocalCache\\Microsoft\\MSTeams\\EBWebView\\Default\\Code Cache`, `${L}\\Packages\\MSTeams_8wekyb3d8bbwe\\LocalCache\\Microsoft\\MSTeams\\Logs`], def: true },
  { id: 'skype_cache', app: 'Skype', name: 'Cache', procs: ['Skype'], dirs: [`${A}\\Microsoft\\Skype for Desktop\\Cache`, `${A}\\Microsoft\\Skype for Desktop\\GPUCache`, `${A}\\Microsoft\\Skype for Desktop\\logs`], def: true },
  { id: 'zoom_logs', app: 'Zoom', name: 'Logs', procs: ['Zoom'], dirs: [`${A}\\Zoom\\logs`, `${A}\\Zoom\\data\\WebviewCacheX64`], def: true },
  electron('whatsapp', 'WhatsApp (desktop antigo)', `${A}\\WhatsApp`, ['WhatsApp']),
  { id: 'telegram_cache', app: 'Telegram', name: 'Cache de mídia', procs: ['Telegram'], dirs: [`${A}\\Telegram Desktop\\tdata\\user_data\\cache`, `${A}\\Telegram Desktop\\tdata\\user_data\\media_cache`, `${A}\\Telegram Desktop\\tdata\\emoji`], def: true },
  electron('signal', 'Signal', `${A}\\Signal`, ['Signal']),
  electron('vscode', 'Visual Studio Code', `${A}\\Code`, ['Code'], { dirs: [`${A}\\Code\\CachedData`, `${A}\\Code\\CachedExtensionVSIXs`, `${A}\\Code\\CachedProfilesData`] }),
  electron('cursor', 'Cursor', `${A}\\Cursor`, ['Cursor'], { dirs: [`${A}\\Cursor\\CachedData`] }),
  electron('notion', 'Notion', `${A}\\Notion`, ['Notion']),
  electron('obsidian', 'Obsidian', `${A}\\obsidian`, ['Obsidian']),
  electron('figma', 'Figma', `${A}\\Figma\\DesktopProfile\\v2`, ['Figma']),
  electron('postman', 'Postman', `${A}\\Postman`, ['Postman']),
  electron('spotify_web', 'Spotify', `${L}\\Spotify\\Browser`, ['Spotify'], { dirs: [`${L}\\Spotify\\Data`, `${L}\\Spotify\\Storage`] }),
  { id: 'steam_cache', app: 'Steam', name: 'Cache web e logs', procs: ['steam', 'steamwebhelper'], dirs: [`${L}\\Steam\\htmlcache`, '%STEAM%\\appcache\\httpcache', '%STEAM%\\logs', '%STEAM%\\dumps'], def: true },
  { id: 'steam_shaders', app: 'Steam', name: 'Cache de shaders', desc: 'Jogos podem travar um pouco no início enquanto recompilam shaders.', procs: ['steam'], dirs: ['%STEAM%\\steamapps\\shadercache'], def: false },
  { id: 'steam_downloads', app: 'Steam', name: 'Downloads incompletos', procs: ['steam'], dirs: ['%STEAM%\\steamapps\\downloading', '%STEAM%\\steamapps\\temp'], def: false },
  { id: 'epic_cache', app: 'Epic Games Launcher', name: 'Cache web e logs', procs: ['EpicGamesLauncher', 'EpicWebHelper'], dirs: [`${L}\\EpicGamesLauncher\\Saved\\webcache`, `${L}\\EpicGamesLauncher\\Saved\\webcache_4147`, `${L}\\EpicGamesLauncher\\Saved\\webcache_4430`, `${L}\\EpicGamesLauncher\\Saved\\Logs`], def: true },
  { id: 'battlenet_cache', app: 'Battle.net', name: 'Cache', procs: ['Battle.net'], dirs: [`${L}\\Battle.net\\BrowserCache`, `${L}\\Battle.net\\Cache`, `${L}\\Blizzard Entertainment\\Battle.net\\Cache`], def: true },
  { id: 'ea_cache', app: 'EA app', name: 'Cache e logs', procs: ['EADesktop'], dirs: [`${L}\\Electronic Arts\\EA Desktop\\CEF\\BrowserCache`, `${L}\\Electronic Arts\\EA Desktop\\Logs`], def: true },
  { id: 'gog_cache', app: 'GOG Galaxy', name: 'Cache e logs', procs: ['GalaxyClient'], dirs: ['%ProgramData%\\GOG.com\\Galaxy\\webcache', '%ProgramData%\\GOG.com\\Galaxy\\logs'], def: true },
  { id: 'ubisoft_cache', app: 'Ubisoft Connect', name: 'Cache e logs', procs: ['upc', 'UbisoftConnect'], dirs: [`${L}\\Ubisoft Game Launcher\\cache`, `${L}\\Ubisoft Game Launcher\\logs`], def: true },
  { id: 'riot_logs', app: 'Riot Client', name: 'Logs', procs: ['RiotClientServices'], dirs: [`${L}\\Riot Games\\Riot Client\\Logs`, `${L}\\Riot Games\\Riot Client\\Data\\Logs`], def: true },
  { id: 'office_cache', app: 'Microsoft Office', name: 'Cache e temporários', procs: ['WINWORD', 'EXCEL', 'POWERPNT', 'OUTLOOK'], dirs: [`${L}\\Microsoft\\Office\\16.0\\Wef`, `${L}\\Microsoft\\Windows\\INetCache\\Content.MSO`, `${L}\\Microsoft\\Windows\\INetCache\\Content.Word`], def: true },
  { id: 'office_recent', app: 'Microsoft Office', name: 'Documentos recentes', procs: ['WINWORD', 'EXCEL', 'POWERPNT'], globs: [`${A}\\Microsoft\\Office\\Recent\\*.lnk`], def: false },
  { id: 'libreoffice_cache', app: 'LibreOffice', name: 'Cache', procs: ['soffice', 'soffice.bin'], dirs: [`${A}\\LibreOffice\\4\\cache`, `${A}\\LibreOffice\\4\\user\\uno_packages\\cache`], def: true },
  { id: 'adobe_media', app: 'Adobe (Premiere/After Effects)', name: 'Cache de mídia', procs: ['Adobe Premiere Pro', 'AfterFX'], dirs: [`${A}\\Adobe\\Common\\Media Cache Files`, `${A}\\Adobe\\Common\\Media Cache`, `${A}\\Adobe\\Common\\Peak Files`], def: true },
  { id: 'adobe_acrobat', app: 'Adobe Acrobat', name: 'Cache', procs: ['Acrobat', 'AcroRd32'], dirs: [`${L}Low\\Adobe\\Acrobat\\DC\\Cache`, `${L}\\Adobe\\Acrobat\\DC\\Cache`], def: true },
  { id: 'vlc_cache', app: 'VLC', name: 'Cache de capas e histórico', procs: ['vlc'], dirs: [`${A}\\vlc\\art`], globs: [`${A}\\vlc\\ml.xspf`], def: true },
  { id: 'java_cache', app: 'Java', name: 'Cache de deploy', procs: ['javaw', 'java'], dirs: [`${L}Low\\Sun\\Java\\Deployment\\cache`], def: true },
  { id: 'python_pip', app: 'Python', name: 'Cache do pip', procs: [], dirs: [`${L}\\pip\\cache`], def: true },
  { id: 'npm_cache', app: 'Node.js', name: 'Cache do npm/yarn', procs: [], dirs: [`${L}\\npm-cache\\_cacache`, `${L}\\Yarn\\Cache`], def: false },
  { id: 'nuget_cache', app: '.NET', name: 'Cache HTTP do NuGet', procs: [], dirs: [`${L}\\NuGet\\v3-cache`, `${L}\\NuGet\\plugins-cache`], def: false },
  { id: 'teamviewer_logs', app: 'TeamViewer', name: 'Logs', procs: ['TeamViewer'], globs: [`${A}\\TeamViewer\\*.log`, '%ProgramFiles%\\TeamViewer\\*.log'], def: true },
  { id: 'anydesk_logs', app: 'AnyDesk', name: 'Logs', procs: ['AnyDesk'], globs: [`${A}\\AnyDesk\\*.trace`, '%ProgramData%\\AnyDesk\\*.trace'], def: true },
  { id: 'winrar_history', app: 'WinRAR', name: 'Histórico de arquivos', procs: ['WinRAR'], regKeys: ['HKCU\\Software\\WinRAR\\ArcHistory', 'HKCU\\Software\\WinRAR\\DialogEditHistory\\ArcName', 'HKCU\\Software\\WinRAR\\DialogEditHistory\\ExtrPath'], def: false },
  { id: '7zip_history', app: '7-Zip', name: 'Histórico de pastas', procs: ['7zFM'], regValues: [['HKCU\\Software\\7-Zip\\Compression', 'ArcHistory'], ['HKCU\\Software\\7-Zip\\Extraction', 'PathHistory']], def: false },
  { id: 'nvidia_app', app: 'NVIDIA App / GeForce Experience', name: 'Cache e logs', procs: [], dirs: [`${L}\\NVIDIA Corporation\\NVIDIA app\\CefCache`, `${L}\\NVIDIA Corporation\\GeForce Experience\\CefCache`, '%ProgramData%\\NVIDIA Corporation\\NV_Cache', `${L}\\NVIDIA Corporation\\NvTmRep`], def: true },
  { id: 'obs_logs', app: 'OBS Studio', name: 'Logs e relatórios de crash', procs: ['obs64'], dirs: [`${A}\\obs-studio\\logs`, `${A}\\obs-studio\\crashes`, `${A}\\obs-studio\\profiler_data`], def: true },
  { id: 'explorer_mru', app: 'Explorador de Arquivos', name: 'Histórico do Executar e caminhos digitados', procs: [], regKeys: ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TypedPaths', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\WordWheelQuery'], def: false },
  { id: 'explorer_opensave', app: 'Explorador de Arquivos', name: 'Histórico de Abrir/Salvar', procs: [], regKeys: ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\ComDlg32\\OpenSavePidlMRU', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\ComDlg32\\LastVisitedPidlMRU', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs'], def: false },
];

module.exports = { windows: windows.map((w) => ({ ...w, group: 'windows', app: 'Windows' })), programs: programs.map((p) => ({ ...p, group: 'programas' })) };
