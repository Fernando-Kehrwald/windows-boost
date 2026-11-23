// Definições dos ajustes. Cada ajuste pode ter:
//  reg:     operações de registro declarativas (o motor faz backup do valor anterior e restaura ao desfazer)
//  apply:   script PowerShell extra ao aplicar (pode gravar $state para usar no desfazer)
//  unapply: script PowerShell extra ao desfazer (recebe $state)
//  check:   script que retorna $true se o ajuste já estiver aplicado (quando não há reg)
//  risk:    'safe' | 'caution' | 'risky'   rec: recomendado   reboot: pede reinício   noUndo: sem desfazer automático
//  hw:      peças de hardware relacionadas (aba Hardware)

const R = (path, name, value, o = {}) => ({ path, name, value, type: 'DWord', ...o });
const RS = (path, name, value, o = {}) => R(path, name, value, { ...o, type: 'String' });
const DEL = (path, name, o = {}) => ({ path, name, delete: true, ...o });

const ADV = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced';
const CDM = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager';
const MMCSS = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile';
const GAMES = MMCSS + '\\Tasks\\Games';
const MEMMGMT = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management';
const FS = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem';
const TCPIP6 = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters';

// ---------------- Serviços (ajuste "Definir serviços como Manual") ----------------
// Windows Update (wuauserv, UsoSvc, WaaSMedicSvc), Segurança do Windows e Defender NÃO são alterados.
const SVC_DISABLED = ['AJRouter', 'AppVClient', 'AssignedAccessManagerSvc', 'DiagTrack', 'DialogBlockingService',
  'NetTcpPortSharing', 'RemoteAccess', 'RemoteRegistry', 'UevAgentService', 'shpamsvc', 'ssh-agent', 'tzautoupdate', 'uhssvc'];
const SVC_DELAYED = ['BITS', 'DoSvc', 'MapsBroker', 'WSearch', 'sppsvc', 'wscsvc'];
const SVC_MANUAL = ['ALG', 'AppMgmt', 'AppReadiness', 'Appinfo', 'AxInstSV', 'BDESVC', 'BTAGService', 'CDPSvc',
  'COMSysApp', 'CertPropSvc', 'CscService', 'DevQueryBroker', 'DeviceAssociationService', 'DeviceInstall',
  'DisplayEnhancementService', 'DmEnrollmentSvc', 'DsSvc', 'DsmSvc', 'EFS', 'EapHost', 'EntAppSvc', 'FDResPub', 'Fax',
  'FrameServer', 'FrameServerMonitor', 'GraphicsPerfSvc', 'HvHost', 'IKEEXT', 'InstallService', 'InventorySvc',
  'IpxlatCfgSvc', 'KtmRm', 'LicenseManager', 'LxpSvc', 'MSDTC', 'MSiSCSI', 'McpManagementService',
  'MicrosoftEdgeElevationService', 'MixedRealityOpenXRSvc', 'NaturalAuthentication', 'NcaSvc', 'NcbService',
  'NcdAutoSetup', 'NetSetupSvc', 'Netlogon', 'Netman', 'PNRPAutoReg', 'PNRPsvc', 'PcaSvc', 'PeerDistSvc', 'PerfHost',
  'PhoneSvc', 'PlugPlay', 'PolicyAgent', 'PrintNotify', 'PushToInstall', 'QWAVE', 'RasAuto', 'RasMan', 'RetailDemo',
  'RmSvc', 'RpcLocator', 'SCPolicySvc', 'SCardSvr', 'SDRSVC', 'SEMgrSvc', 'SNMPTrap', 'SSDPSRV', 'ScDeviceEnum',
  'SensorDataService', 'SensorService', 'SensrSvc', 'SessionEnv', 'SharedAccess', 'SharedRealitySvc', 'SmsRouter',
  'SstpSvc', 'StiSvc', 'StorSvc', 'TapiSrv', 'TermService', 'TieringEngineService', 'TokenBroker', 'TroubleshootingSvc',
  'TrkWks', 'UmRdpService', 'VSS', 'VaultSvc', 'W32Time', 'WEPHOSTSVC', 'WFDSConMgrSvc', 'WMPNetworkSvc', 'WManSvc',
  'WPDBusEnum', 'WalletService', 'WarpJITSvc', 'WbioSrvc', 'WcsPlugInService', 'WdiServiceHost', 'WdiSystemHost',
  'WebClient', 'Wecsvc', 'WerSvc', 'WiaRpc', 'WinRM', 'WpcMonSvc', 'XblAuthManager', 'XblGameSave', 'XboxGipSvc',
  'XboxNetApiSvc', 'autotimesvc', 'bthserv', 'camsvc', 'cloudidsvc', 'dcsvc', 'defragsvc',
  'diagnosticshub.standardcollector.service', 'diagsvc', 'dmwappushservice', 'dot3svc', 'edgeupdate', 'edgeupdatem',
  'embeddedmode', 'fdPHost', 'fhsvc', 'hidserv', 'icssvc', 'lfsvc', 'lltdsvc', 'lmhosts', 'msiserver', 'netprofm',
  'p2pimsvc', 'p2psvc', 'perceptionsimulation', 'pla', 'seclogon', 'smphost', 'spectrum', 'svsvc', 'swprv',
  'upnphost', 'vds', 'wbengine', 'wcncsvc', 'wercplsupport', 'wisvc', 'wlidsvc', 'wlpasvc', 'wmiApSrv',
  'workfolderssvc', 'GameInputSvc', 'BcastDVRUserService', 'CaptureService', 'MessagingService', 'PimIndexMaintenanceSvc',
  'UnistoreSvc', 'UserDataSvc', 'DevicePickerUserSvc', 'DevicesFlowUserSvc', 'PrintWorkflowUserSvc', 'cbdhsvc',
  'ConsentUxUserSvc', 'CredentialEnrollmentManagerUserSvc', 'BluetoothUserService'];

const powerIndexTweak = (sub, setting, ac, dc) => ({
  apply: `$state = Get-PowerIndex $PWR.${sub} $PWR.${setting}\nSet-PowerIndex $PWR.${sub} $PWR.${setting} ${ac} ${dc}`,
  unapply: `if ($state) { Set-PowerIndex $PWR.${sub} $PWR.${setting} $state.ac $state.dc }`,
  check: `$v = Get-PowerIndex $PWR.${sub} $PWR.${setting}; ($null -ne $v) -and ($v.ac -eq ${ac})`,
});

// Bits de DisabledComponents (IPv6): só mexe no próprio bit para não sobrescrever outros ajustes.
const ipv6Bit = (bit) => ({
  apply: `$p='${TCPIP6}'; $cur = Get-RegValue $p 'DisabledComponents'; $state = @{ had = ($null -ne $cur) }
$n = if ($null -ne $cur) { ConvertTo-U32 $cur } else { 0 }
Set-RegValue $p 'DisabledComponents' ($n -bor ${bit})`,
  unapply: `$p='${TCPIP6}'; $cur = Get-RegValue $p 'DisabledComponents'
if ($null -ne $cur) { $n = (ConvertTo-U32 $cur) -band (-bnot ${bit}) -band 0xFFFFFFFFL
  if ($n -eq 0 -and $state -and -not $state.had) { Remove-RegValue $p 'DisabledComponents' } else { Set-RegValue $p 'DisabledComponents' $n } }`,
  check: `$cur = Get-RegValue '${TCPIP6}' 'DisabledComponents'; ($null -ne $cur) -and (((ConvertTo-U32 $cur) -band ${bit}) -eq ${bit})`,
});

const tweaks = [
  // =====================================================================
  // 2.1 DESEMPENHO E SISTEMA
  // =====================================================================
  {
    id: 'ultimate_power', cat: 'desempenho', name: 'Plano de energia Desempenho Máximo', rec: true, risk: 'caution', hw: ['cpu'],
    desc: 'Cria (se não existir) e ativa o plano oculto "Desempenho Máximo" (Ultimate Performance) do Windows.',
    warn: 'Aumenta o consumo de energia. Em notebooks na bateria, a autonomia cai.',
    apply: `$o = Run powercfg /getactivescheme
$m = [regex]::Match($o, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
$state = @{ previous = $m.Value }
$list = Run powercfg /list
$ult = [regex]::Matches($list, '([0-9a-fA-F-]{36})\\s+\\(([^)]*)\\)') | Where-Object { $_.Groups[2].Value -match 'Ultimate|Desempenho M|M.ximo' -or $_.Groups[1].Value -eq 'e9a42b02-d5df-448d-aa00-03f14749eb61' } | Select-Object -First 1
if ($ult) { $guid = $ult.Groups[1].Value } else {
  $dup = Run powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61
  $guid = [regex]::Match($dup, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}').Value
  if (-not $guid) { throw "Não foi possível criar o plano: $dup" }
  $state.created = $guid
}
Exec powercfg /setactive $guid | Out-Null`,
    unapply: `if ($state -and $state.previous) { Exec powercfg /setactive $state.previous | Out-Null }
if ($state -and $state.created) { Run powercfg /delete $state.created | Out-Null }`,
    check: `$o = Run powercfg /getactivescheme; $o -match 'e9a42b02|Ultimate|Desempenho M|ximo'`,
  },
  {
    id: 'services_manual', cat: 'desempenho', name: 'Definir serviços como Manual', rec: true, risk: 'caution', reboot: true,
    desc: `Muda o tipo de inicialização de ~${SVC_MANUAL.length + SVC_DISABLED.length + SVC_DELAYED.length} serviços. A maioria vai para Manual (iniciam quando algo precisa). Alguns ficam Desativados (${SVC_DISABLED.join(', ')}) e ${SVC_DELAYED.join(', ')} ficam em início atrasado. Windows Update e Segurança do Windows não são tocados.`,
    warn: 'O tipo anterior de cada serviço é salvo e restaurado ao desfazer.',
    params: { disabled: SVC_DISABLED, delayed: SVC_DELAYED, manual: SVC_MANUAL },
    apply: `$snaps = New-Object System.Collections.ArrayList
function Do-Svc($pattern, $mode) {
  $names = @(Get-Service -Name $pattern -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
  foreach ($n in $names) {
    $s = Get-ServiceStartSnapshot $n
    if ($null -eq $s) { continue }
    if ($mode -eq 'Manual' -and $s.start -ne 2) { continue }  # só rebaixa os que estão em Automático
    try { Set-ServiceStart $n $mode; [void]$snaps.Add($s) } catch {}
  }
}
foreach ($n in $P.disabled) { Do-Svc $n 'Disabled' }
foreach ($n in $P.delayed) { Do-Svc $n 'AutomaticDelayed' }
foreach ($n in $P.manual) { Do-Svc $n 'Manual'; Do-Svc ($n + '_*') 'Manual' }
$state = @{ services = $snaps.ToArray() }`,
    unapply: `if ($state -and $state.services) { foreach ($s in $state.services) { Restore-ServiceStart $s } }`,
    check: `$s = Get-ServiceStartSnapshot 'DiagTrack'; $m = Get-ServiceStartSnapshot 'MapsBroker'; ($null -ne $s) -and $s.start -eq 4 -and ($null -eq $m -or $m.delayed -eq 1)`,
  },
  {
    id: 'core_parking', cat: 'desempenho', name: 'Desativar Core Parking', risk: 'caution', hw: ['cpu'],
    desc: 'Define o mínimo de núcleos não estacionados = 100% no plano ativo (todos os núcleos sempre acordados).',
    warn: 'Aumenta consumo e temperatura em repouso.',
    ...powerIndexTweak('SUB_PROCESSOR', 'CPMINCORES', 100, 100),
  },
  {
    id: 'cooling_active', cat: 'desempenho', name: 'Política de resfriamento ativa', risk: 'safe', hw: ['cpu'],
    desc: 'O Windows acelera as ventoinhas ANTES de reduzir o clock do processador (o padrão "passivo" em muitos notebooks reduz o clock primeiro). Mais barulho, menos queda de FPS.',
    ...powerIndexTweak('SUB_PROCESSOR', 'SYSCOOLPOL', 1, 1),
  },
  {
    id: 'cpu_max_99', cat: 'desempenho', name: 'Limitar o processador a 99% (desliga o turbo)', risk: 'caution', hw: ['cpu'],
    desc: 'Estado máximo do processador = 99% no plano ativo. Na maioria das CPUs isso desliga o turbo: o processador esquenta MUITO menos e perde pouco desempenho. Resolve quedas de FPS por thermal throttling em notebooks (ex.: CS2 caindo de 120 para 30 FPS após algumas partidas).',
    warn: 'Em desktops bem refrigerados reduz o desempenho máximo. O Guardião térmico do Modo Jogo faz isso automaticamente só quando detecta superaquecimento — prefira ele se o problema só acontece em jogos.',
    ...powerIndexTweak('SUB_PROCESSOR', 'PROCTHROTTLEMAX', 99, 99),
  },
  {
    id: 'dynamic_tick', cat: 'desempenho', name: 'Desativar Dynamic Ticking', risk: 'risky', reboot: true, hw: ['timer'],
    desc: 'bcdedit /set disabledynamictick yes — o timer do sistema não "dorme".',
    warn: 'Aumenta consumo de energia; pode reduzir autonomia de notebooks.',
    apply: 'Exec bcdedit /set disabledynamictick yes | Out-Null',
    unapply: 'Run bcdedit /deletevalue disabledynamictick | Out-Null',
    check: `(Run bcdedit /enum '{current}') -match 'disabledynamictick\\s+(Yes|Sim)'`,
  },
  {
    id: 'global_timer', cat: 'desempenho', name: 'Resolução global do timer', reboot: true, risk: 'safe', hw: ['timer'],
    desc: 'GlobalTimerResolutionRequests = 1: um pedido de timer de alta resolução vale para o sistema inteiro (comportamento antigo). Só tem efeito no Windows 11 / Server 2022+.',
    reg: [R('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel', 'GlobalTimerResolutionRequests', 1)],
  },
  {
    id: 'win32_priority', cat: 'desempenho', name: 'Win32 Priority Separation', risk: 'safe', hw: ['cpu'],
    desc: 'Win32PrioritySeparation = 36 (0x24): quantum curto e fixo, favorecendo o programa em primeiro plano.',
    reg: [R('HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl', 'Win32PrioritySeparation', 36, { def: 2 })],
  },
  {
    id: 'svchost_split', cat: 'desempenho', name: 'Aumentar limite de divisão do SvcHost', reboot: true, risk: 'safe', hw: ['ram'],
    desc: 'SvcHostSplitThresholdInKB = total de RAM instalada, agrupando serviços em menos processos svchost.exe.',
    apply: `$kb = [int64]((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1KB)
$state = Get-RegSnapshot 'HKLM\\SYSTEM\\CurrentControlSet\\Control' 'SvcHostSplitThresholdInKB'
Set-RegValue 'HKLM\\SYSTEM\\CurrentControlSet\\Control' 'SvcHostSplitThresholdInKB' $kb 'DWord'`,
    unapply: `if ($state) { Restore-RegSnapshots @($state) } else { Set-RegValue 'HKLM\\SYSTEM\\CurrentControlSet\\Control' 'SvcHostSplitThresholdInKB' 3670016 }`,
    check: `$v = Get-RegValue 'HKLM\\SYSTEM\\CurrentControlSet\\Control' 'SvcHostSplitThresholdInKB'; ($null -ne $v) -and (ConvertTo-U32 $v) -gt 3670016`,
  },
  {
    id: 'sysmain', cat: 'desempenho', name: 'Desativar SysMain (Superfetch)', risk: 'safe', hw: ['storage', 'ram'],
    desc: 'Para o serviço SysMain e o desativa. Útil com SSD; em HDD o ganho pode ser negativo.',
    apply: `$state = Get-ServiceStartSnapshot 'SysMain'
Stop-Service SysMain -Force -ErrorAction SilentlyContinue
Set-ServiceStart 'SysMain' 'Disabled'`,
    unapply: `if ($state) { Restore-ServiceStart $state } else { Set-ServiceStart 'SysMain' 'Automatic' }
Start-Service SysMain -ErrorAction SilentlyContinue`,
    check: `$s = Get-ServiceStartSnapshot 'SysMain'; ($null -ne $s) -and $s.start -eq 4`,
  },
  {
    id: 'memory_compression', cat: 'desempenho', name: 'Desativar compressão de memória', risk: 'caution', hw: ['ram'],
    desc: 'Disable-MMAgent -MemoryCompression. Só faz sentido com bastante RAM (16 GB+).',
    apply: 'Disable-MMAgent -MemoryCompression',
    unapply: 'Enable-MMAgent -MemoryCompression',
    check: '-not (Get-MMAgent).MemoryCompression',
  },
  {
    id: 'paging_executive', cat: 'desempenho', name: 'Desativar paginação do executivo', reboot: true, risk: 'safe', hw: ['ram'],
    desc: 'DisablePagingExecutive = 1: kernel e drivers ficam sempre na RAM.',
    reg: [R(MEMMGMT, 'DisablePagingExecutive', 1, { def: 0 })],
  },
  {
    id: 'fast_startup', cat: 'desempenho', name: 'Desativar Inicialização Rápida', risk: 'safe',
    desc: 'HiberbootEnabled = 0. O desligamento passa a ser completo (evita problemas de drivers e dual boot).',
    reg: [R('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power', 'HiberbootEnabled', 0, { def: 1 })],
  },
  {
    id: 'hibernation', cat: 'desempenho', name: 'Desativar hibernação', risk: 'caution', hw: ['storage'],
    desc: 'powercfg /hibernate off (apaga o hiberfil.sys e libera espaço).',
    warn: 'Não recomendado em notebooks: sem hibernação, a bateria acabando pode fazer perder trabalho aberto.',
    apply: 'Exec powercfg /hibernate off | Out-Null',
    unapply: 'Exec powercfg /hibernate on | Out-Null',
    check: `(Get-RegValue 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power' 'HibernateEnabled' 1) -eq 0`,
  },
  {
    id: 'disable_8dot3', cat: 'desempenho', name: 'Desativar nomes curtos 8.3', risk: 'caution', reboot: true, hw: ['storage'],
    desc: 'fsutil behavior set disable8dot3 1 — o NTFS deixa de criar nomes no formato antigo (ARQUIV~1.TXT).',
    warn: 'Programas muito antigos que dependem de nomes 8.3 podem falhar em novas instalações.',
    reg: [R(FS, 'NtfsDisable8dot3NameCreation', 1, { def: 2 })],
  },
  {
    id: 'last_access', cat: 'desempenho', name: 'Desativar "último acesso" do NTFS', reboot: true, risk: 'safe', hw: ['storage'],
    desc: 'fsutil behavior set disableLastAccess 1 — não grava a data de último acesso a cada leitura de arquivo.',
    reg: [R(FS, 'NtfsDisableLastAccessUpdate', 2147483649, { def: 2147483650 })],
  },
  {
    id: 'reserved_storage', cat: 'desempenho', name: 'Desativar armazenamento reservado', risk: 'caution', hw: ['storage'],
    desc: 'DISM /Set-ReservedStorageState /State:Disabled (libera 7–10 GB).',
    warn: 'Reative antes de grandes atualizações do Windows para evitar falta de espaço durante a atualização.',
    apply: 'Exec DISM.exe /Online /Set-ReservedStorageState /State:Disabled /Quiet | Out-Null',
    unapply: 'Exec DISM.exe /Online /Set-ReservedStorageState /State:Enabled /Quiet | Out-Null',
    check: `(Run DISM.exe /Online /Get-ReservedStorageState) -match '(Disabled|Desabilitado|Desativado)'`,
  },
  {
    id: 'storage_sense', cat: 'desempenho', name: 'Desativar Sensor de Armazenamento', risk: 'safe', hw: ['storage'],
    desc: 'Desliga a limpeza automática de arquivos do Windows.',
    reg: [R('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy', '01', 0)],
  },
  {
    id: 'bg_apps', cat: 'desempenho', name: 'Desativar apps da Store em segundo plano', risk: 'safe',
    desc: 'GlobalUserDisabled = 1 para apps UWP (eles não rodam em segundo plano).',
    warn: 'Apps da Store (ex.: Mail, Teams novo) podem deixar de mostrar notificações com o app fechado.',
    reg: [
      R('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', 'GlobalUserDisabled', 1),
      R('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', 'BackgroundAppGlobalToggle', 0),
    ],
  },
  {
    id: 'hvci', cat: 'desempenho', name: 'Desativar Isolamento de Núcleo (HVCI)', risk: 'caution', reboot: true, hw: ['cpu'],
    desc: 'Desliga a Integridade de Memória (Memory Integrity), que custa alguns % de desempenho em CPUs mais antigas.',
    warn: 'Reduz a proteção do sistema. O anti-cheat do FACEIT (e o Vanguard em alguns casos) NÃO abre com isso desligado.',
    reg: [R('HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity', 'Enabled', 0, { def: 1 })],
  },
  {
    id: 'menu_delay', cat: 'desempenho', name: 'Atraso de menu zero', risk: 'safe',
    desc: 'MenuShowDelay = 0: submenus abrem instantaneamente.',
    reg: [RS('HKCU\\Control Panel\\Desktop', 'MenuShowDelay', '0', { def: '400' })],
  },
  {
    id: 'visual_effects', cat: 'desempenho', name: 'Otimizar efeitos visuais', rec: true, reboot: true, risk: 'safe', hw: ['gpu'],
    desc: 'Equivale a "Ajustar para melhor desempenho" + máscara UserPreferencesMask (sem animações, sombras e Aero Peek), mantendo fontes suaves (ClearType).',
    reg: [
      R('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting', 3),
      R('HKCU\\Control Panel\\Desktop', 'UserPreferencesMask', [0x90, 0x12, 0x03, 0x80, 0x10, 0x00, 0x00, 0x00], { type: 'Binary' }),
      RS('HKCU\\Control Panel\\Desktop\\WindowMetrics', 'MinAnimate', '0'),
      R(ADV, 'TaskbarAnimations', 0),
      R(ADV, 'ListviewAlphaSelect', 0),
      R(ADV, 'ListviewShadow', 0),
      R('HKCU\\Software\\Microsoft\\Windows\\DWM', 'EnableAeroPeek', 0),
      RS('HKCU\\Control Panel\\Desktop', 'FontSmoothing', '2'),
    ],
  },
  {
    id: 'logon_blur', cat: 'desempenho', name: 'Desativar desfoque na tela de login', risk: 'safe',
    desc: 'DisableAcrylicBackgroundOnLogon = 1.',
    reg: [R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'DisableAcrylicBackgroundOnLogon', 1)],
  },
  {
    id: 'usb_suspend', cat: 'desempenho', name: 'Desativar USB Selective Suspend', risk: 'safe', hw: ['input'],
    desc: 'Portas USB nunca são suspensas (evita atraso de mouse/teclado/dongle). O valor anterior é guardado para desfazer.',
    reg: [R('HKLM\\SYSTEM\\CurrentControlSet\\Services\\USB', 'DisableSelectiveSuspend', 1)],
    ...powerIndexTweak('SUB_USB', 'USBSUSPEND', 0, 0),
  },
  {
    id: 'standby_network', cat: 'desempenho', name: 'Desativar rede no Modern Standby', risk: 'safe',
    desc: 'Rede desligada durante o sono S0 (economia de bateria; o PC não baixa nada dormindo).',
    ...powerIndexTweak('SUB_NONE', 'STANDBYNET', 0, 0),
  },
  {
    id: 's3_sleep', cat: 'desempenho', name: 'Ativar sono S3', risk: 'caution', reboot: true,
    desc: 'PlatformAoAcOverride = 0: troca o Modern Standby pelo sono S3 clássico (se a placa suportar).',
    warn: 'Se a placa não suportar S3, o PC pode ficar sem opção de suspensão até desfazer.',
    reg: [R('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power', 'PlatformAoAcOverride', 0)],
  },

  // =====================================================================
  // 2.2 JOGOS
  // =====================================================================
  {
    id: 'mouse_accel', cat: 'jogos', name: 'Desativar aceleração do mouse', rec: true, risk: 'safe', hw: ['input'],
    desc: 'MouseSpeed, MouseThreshold1 e MouseThreshold2 = 0 ("Aumentar precisão do ponteiro" desligado). Vale após sair e entrar na conta.',
    reg: [
      RS('HKCU\\Control Panel\\Mouse', 'MouseSpeed', '0', { def: '1' }),
      RS('HKCU\\Control Panel\\Mouse', 'MouseThreshold1', '0', { def: '6' }),
      RS('HKCU\\Control Panel\\Mouse', 'MouseThreshold2', '0', { def: '10' }),
    ],
  },
  {
    id: 'input_queue', cat: 'jogos', name: 'Reduzir fila de entrada', reboot: true, risk: 'caution', hw: ['input'],
    desc: 'MouseDataQueueSize = 50 e KeyboardDataQueueSize = 50 (padrão 100).',
    warn: 'Valores muito baixos podem fazer perder eventos com mouses de polling rate alto.',
    reg: [
      R('HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters', 'MouseDataQueueSize', 50, { def: 100 }),
      R('HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters', 'KeyboardDataQueueSize', 50, { def: 100 }),
    ],
  },
  {
    id: 'keyboard_repeat', cat: 'jogos', name: 'Taxa de repetição do teclado no máximo', risk: 'safe', hw: ['input'],
    desc: 'KeyboardDelay = 0 e KeyboardSpeed = 31.',
    reg: [
      RS('HKCU\\Control Panel\\Keyboard', 'KeyboardDelay', '0', { def: '1' }),
      RS('HKCU\\Control Panel\\Keyboard', 'KeyboardSpeed', '31', { def: '31' }),
    ],
  },
  {
    id: 'sticky_keys', cat: 'jogos', name: 'Desativar Teclas de Aderência', rec: true, risk: 'safe', hw: ['input'],
    desc: 'Remove o atalho/janela do Shift 5 vezes (e dos atalhos de Teclas de Alternância e Filtro).',
    reg: [
      RS('HKCU\\Control Panel\\Accessibility\\StickyKeys', 'Flags', '506', { def: '510' }),
      RS('HKCU\\Control Panel\\Accessibility\\ToggleKeys', 'Flags', '58', { def: '62' }),
      RS('HKCU\\Control Panel\\Accessibility\\Keyboard Response', 'Flags', '122', { def: '126' }),
    ],
  },
  {
    id: 'game_mode', cat: 'jogos', name: 'Ativar Modo de Jogo', risk: 'safe',
    desc: 'Liga o Game Mode do Windows.',
    reg: [R('HKCU\\Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', 1), R('HKCU\\Software\\Microsoft\\GameBar', 'AllowAutoGameMode', 1)],
  },
  {
    id: 'hags', cat: 'jogos', name: 'Ativar HAGS', risk: 'safe', reboot: true, hw: ['gpu'],
    desc: 'Agendamento de GPU acelerado por hardware (HwSchMode = 2). Necessário para DLSS Frame Generation.',
    reg: [R('HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode', 2, { def: 1 })],
  },
  {
    id: 'fso', cat: 'jogos', name: 'Desativar Otimizações de Tela Cheia (FSO)', risk: 'safe', hw: ['gpu'],
    desc: 'Força tela cheia exclusiva (GameDVR_DXGIHonorFSEWindowsCompatible e afins).',
    warn: 'Desliga HDR automático/ICC em tela cheia exclusiva e pode deixar o Alt+Tab mais lento.',
    reg: [
      R('HKCU\\System\\GameConfigStore', 'GameDVR_FSEBehaviorMode', 2),
      R('HKCU\\System\\GameConfigStore', 'GameDVR_FSEBehavior', 2),
      R('HKCU\\System\\GameConfigStore', 'GameDVR_HonorUserFSEBehaviorMode', 1),
      R('HKCU\\System\\GameConfigStore', 'GameDVR_DXGIHonorFSEWindowsCompatible', 1),
      R('HKCU\\System\\GameConfigStore', 'GameDVR_EFSEFeatureFlags', 0),
    ],
  },
  {
    id: 'windowed_opt', cat: 'jogos', name: 'Otimização para jogos em janela', reboot: true, risk: 'safe', hw: ['gpu'],
    desc: 'DirectXUserGlobalSettings = SwapEffectUpgradeEnable=1; (flip model em jogos DX10/11 em janela/borderless). Preserva as outras opções já gravadas.',
    apply: `$p = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences'
$state = Get-RegSnapshot $p 'DirectXUserGlobalSettings'
$cur = [string](Get-RegValue $p 'DirectXUserGlobalSettings' '')
$parts = @($cur -split ';' | Where-Object { $_ -and $_ -notmatch '^SwapEffectUpgradeEnable=' })
$parts += 'SwapEffectUpgradeEnable=1'
Set-RegValue $p 'DirectXUserGlobalSettings' (($parts -join ';') + ';') 'String'`,
    unapply: `if ($state) { Restore-RegSnapshots @($state) }`,
    check: `[string](Get-RegValue 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences' 'DirectXUserGlobalSettings' '') -match 'SwapEffectUpgradeEnable=1'`,
  },
  {
    id: 'mpo', cat: 'jogos', name: 'Desativar Multiplane Overlay (MPO)', risk: 'caution', reboot: true, hw: ['gpu'],
    desc: 'OverlayTestMode = 5 (corrige flicker, tela preta e stutter em algumas GPUs/drivers).',
    warn: 'Pode aumentar levemente o uso de GPU em vídeo; em builds novas do Windows 11 o valor pode ser ignorado.',
    reg: [R('HKLM\\SOFTWARE\\Microsoft\\Windows\\Dwm', 'OverlayTestMode', 5)],
  },
  {
    id: 'xbox_gamebar', cat: 'jogos', name: 'Desativar Xbox Game Bar', risk: 'caution', hw: ['cpu'],
    desc: 'Desliga a Game Bar, a captura em segundo plano (Game DVR) e o atalho Win+G. Diferente do original, não remove o pacote (pode ser desfeito).',
    warn: 'Não use com CPUs Ryzen X3D: a Game Bar é o que direciona o jogo para os núcleos com 3D V-Cache.',
    x3dBlock: true,
    reg: [
      R('HKCU\\Software\\Microsoft\\GameBar', 'UseNexusForGameBarEnabled', 0),
      R('HKCU\\Software\\Microsoft\\GameBar', 'ShowStartupPanel', 0),
      R('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 0),
      R('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', 0),
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR', 'AllowGameDVR', 0),
    ],
  },
  {
    id: 'remove_game_apps', cat: 'jogos', name: 'Remover apps de jogos', risk: 'caution', noUndo: true,
    desc: 'Remove o app Xbox, Game Bar e Game Overlay (inclusive da imagem do sistema, para novos usuários). Mantém o Xbox Identity Provider (login em jogos).',
    warn: 'Sem desfazer automático: reinstale pela Microsoft Store se precisar. Não use com CPUs X3D. Jogos do Game Pass precisam do app Xbox.',
    x3dBlock: true,
    apply: `$r = @()
foreach ($p in 'Microsoft.XboxApp','Microsoft.GamingApp','Microsoft.XboxGamingOverlay','Microsoft.XboxGameOverlay','Microsoft.XboxSpeechToTextOverlay') { $r += Remove-AppxEverywhere $p }
$state = @{ removed = $r }`,
    check: `-not (Get-AppxPackage -AllUsers -Name 'Microsoft.XboxGamingOverlay' -ErrorAction SilentlyContinue)`,
  },
  {
    id: 'nvidia_profile', cat: 'jogos', name: 'Otimizar configurações NVIDIA', risk: 'caution', noUndo: true, hw: ['gpu'], vendor: 'nvidia',
    desc: 'Importa um perfil global no NVIDIA Profile Inspector: Low Latency On, Gerenciamento de energia "Máximo desempenho", Shader Cache ilimitado, Filtragem de textura "Alto desempenho", Otimização em threads On, V-Sync/Buffer triplo Off, FXAA/MFAA/AO Off, limite de FPS Off, quadros pré-renderizados VR = 1.',
    warn: 'Requer o nvidiaProfileInspector.exe (gratuito, código aberto) indicado em Configurações — o app não baixa nada da internet. Sem desfazer automático: use "Restaurar padrões" no próprio Inspector.',
    special: 'nvidia',
  },
  {
    id: 'amd_opt', cat: 'jogos', name: 'Otimizar configurações AMD', risk: 'caution', hw: ['gpu'], vendor: 'amd',
    desc: 'Em todas as GPUs AMD detectadas, define = 1 várias latências do driver (LTR Snoop/NoSnoop, KMD RPM, DAL Urgent, troca de clock de memória, transições PP, DRAM Clock Change, BGM LTR). Os valores anteriores são guardados (aqui há desfazer).',
    reboot: true,
    apply: `$names = 'LTRSnoopL1Latency','LTRSnoopL0Latency','LTRNoSnoopL1Latency','LTRMaxNoSnoopLatency','KMD_RpmComputeLatency','DalUrgentLatencyNs','memClockSwitchLatency','PP_RTPMComputeF1Latency','PP_DGBMMMaxTransitionLatencyUlv','PP_DGBPMMaxTransitionLatencyGfx','DalNBLatencyForUnderFlow','DalDramClockChangeLatencyNs','BGM_LTRSnoopL1Latency','BGM_LTRSnoopL0Latency','BGM_LTRNoSnoopL1Latency','BGM_LTRNoSnoopL0Latency','BGM_LTRMaxSnoopLatencyValue','BGM_LTRMaxNoSnoopLatencyValue'
$base = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'
$snaps = @(); $found = 0
$k = Open-RegKey $base $false $false
foreach ($sub in $k.GetSubKeyNames()) {
  if ($sub -notmatch '^\\d{4}$') { continue }
  $p = "$base\\$sub"
  $prov = [string](Get-RegValue $p 'ProviderName' '') + ' ' + [string](Get-RegValue $p 'DriverDesc' '')
  if ($prov -notmatch 'AMD|Advanced Micro Devices|Radeon|ATI') { continue }
  $found++
  foreach ($n in $names) { $snaps += Get-RegSnapshot $p $n; Set-RegValue $p $n 1 }
}
$k.Close()
if ($found -eq 0) { throw 'Nenhuma GPU AMD encontrada.' }
$state = @{ snaps = $snaps }`,
    unapply: `if ($state -and $state.snaps) { Restore-RegSnapshots $state.snaps }`,
    check: `$base = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'; $ok = $false
$k = Open-RegKey $base $false $false; foreach ($sub in $k.GetSubKeyNames()) { if ($sub -match '^\\d{4}$') { $p = "$base\\$sub"; if (([string](Get-RegValue $p 'ProviderName' '')) -match 'AMD|Advanced Micro|ATI') { if ((Get-RegValue $p 'DalUrgentLatencyNs') -eq 1) { $ok = $true } } } }; $k.Close(); $ok`,
  },

  // =====================================================================
  // 2.3 REDE
  // =====================================================================
  {
    id: 'network_opt', cat: 'rede', name: 'Otimizar configurações de rede', reboot: true, risk: 'safe', hw: ['network'],
    desc: 'netsh: heurísticas TCP off, congestionamento CTCP, RSS on, ECN on, timestamps off, TCP Fast Open on, janela inicial (ICW) = 10.',
    apply: `$t = Get-NetTCPSetting -SettingName Internet -ErrorAction SilentlyContinue
$state = @{ cp = if ($t) { [string]$t.CongestionProvider } else { $null }; ecn = if ($t) { [string]$t.EcnCapability } else { $null }; ts = if ($t) { [string]$t.Timestamps } else { $null }; icw = if ($t) { $t.InitialCongestionWindowMss } else { $null }; rss = [string](Get-NetOffloadGlobalSetting).ReceiveSideScaling }
Run netsh int tcp set heuristics disabled | Out-Null
Run netsh int tcp set supplemental template=internet congestionprovider=ctcp | Out-Null
Run netsh int tcp set global rss=enabled | Out-Null
Run netsh int tcp set global ecncapability=enabled | Out-Null
Run netsh int tcp set global timestamps=disabled | Out-Null
Run netsh int tcp set global fastopen=enabled | Out-Null
Run netsh int tcp set supplemental template=internet icw=10 | Out-Null`,
    unapply: `Run netsh int tcp set heuristics default | Out-Null
$cp = if ($state -and $state.cp) { $state.cp.ToLower() } else { 'cubic' }; if ($cp -notin 'cubic','ctcp','newreno','dctcp','bbr2') { $cp = 'cubic' }
Run netsh int tcp set supplemental template=internet congestionprovider=$cp | Out-Null
$ecn = if ($state -and $state.ecn -match 'Enabled') { 'enabled' } else { 'disabled' }
Run netsh int tcp set global ecncapability=$ecn | Out-Null
$ts = if ($state -and $state.ts -match 'Enabled') { 'enabled' } else { 'disabled' }
Run netsh int tcp set global timestamps=$ts | Out-Null
if ($state -and $state.icw) { Run netsh int tcp set supplemental template=internet icw=$($state.icw) | Out-Null }
if ($state -and $state.rss -match 'Disabled') { Run netsh int tcp set global rss=disabled | Out-Null }`,
    check: `$t = Get-NetTCPSetting -SettingName Internet -ErrorAction SilentlyContinue; ($null -ne $t) -and ([string]$t.CongestionProvider -eq 'CTCP') -and ([string]$t.EcnCapability -eq 'Enabled')`,
  },
  {
    id: 'prefer_ipv4', cat: 'rede', name: 'Preferir IPv4 sobre IPv6', reboot: true, risk: 'safe', hw: ['network'],
    desc: 'Liga o bit 0x20 de DisabledComponents (só esse bit; os outros são preservados).',
    ...ipv6Bit(0x20),
  },
  {
    id: 'teredo', cat: 'rede', name: 'Desativar Teredo', reboot: true, risk: 'safe', hw: ['network'],
    desc: 'Bit 0x01 de DisabledComponents + netsh interface teredo set state disabled.',
    apply: ipv6Bit(0x01).apply + '\nRun netsh interface teredo set state disabled | Out-Null',
    unapply: ipv6Bit(0x01).unapply + '\nRun netsh interface teredo set state default | Out-Null',
    check: ipv6Bit(0x01).check,
  },
  {
    id: 'disable_ipv6', cat: 'rede', name: 'Desativar IPv6', risk: 'caution', reboot: true, hw: ['network'],
    desc: 'DisabledComponents = 0xFF e desvincula ms_tcpip6 de todos os adaptadores.',
    warn: 'Sobrescreve "Preferir IPv4" e "Desativar Teredo". Algumas VPNs/provedores (e o Xbox Live) precisam de IPv6.',
    apply: `$state = @{ prev = Get-RegSnapshot '${TCPIP6}' 'DisabledComponents'; adapters = @(Get-NetAdapterBinding -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue | Where-Object Enabled | ForEach-Object { $_.Name }) }
Set-RegValue '${TCPIP6}' 'DisabledComponents' 255
Disable-NetAdapterBinding -Name '*' -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue`,
    unapply: `if ($state -and $state.prev) { Restore-RegSnapshots @($state.prev) } else { Remove-RegValue '${TCPIP6}' 'DisabledComponents' }
if ($state -and $state.adapters) { foreach ($a in $state.adapters) { Enable-NetAdapterBinding -Name $a -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue } } else { Enable-NetAdapterBinding -Name '*' -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue }`,
    check: `$v = Get-RegValue '${TCPIP6}' 'DisabledComponents'; ($null -ne $v) -and ((ConvertTo-U32 $v) -band 0xFF) -eq 0xFF`,
  },
  {
    id: 'delivery_opt', cat: 'rede', name: 'Desativar Otimização de Entrega', rec: true, risk: 'safe', hw: ['network'],
    desc: 'DODownloadMode = 0: o PC não envia atualizações a outros PCs (nem na rede local nem na internet).',
    reg: [R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization', 'DODownloadMode', 0)],
  },
  {
    id: 'wifi_sense', cat: 'rede', name: 'Desativar Wi-Fi Sense', risk: 'safe',
    desc: 'Não compartilha redes Wi-Fi nem conecta em hotspots abertos sugeridos.',
    reg: [
      R('HKLM\\SOFTWARE\\Microsoft\\PolicyManager\\default\\WiFi\\AllowWiFiHotSpotReporting', 'value', 0),
      R('HKLM\\SOFTWARE\\Microsoft\\PolicyManager\\default\\WiFi\\AllowAutoConnectToWiFiSenseHotspots', 'value', 0),
    ],
  },

  // =====================================================================
  // 2.4 PRIVACIDADE
  // =====================================================================
  {
    id: 'telemetry', cat: 'privacidade', name: 'Desativar telemetria', rec: true, risk: 'safe',
    desc: 'AllowTelemetry = 0, ID de publicidade off, experiências personalizadas off, coleta de digitação/tinta/contatos off, fala online off, feedback (SIUF) = 0, rastreio de programas no Iniciar off, Defender não envia amostras, serviço DiagTrack desativado, Relatório de Erros desligado e tarefas agendadas de telemetria desativadas. (Corrige o bug do SvcHostSplitThresholdInKB do original: este ajuste não mexe nele.)',
    reg: [
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry', 0),
      R('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection', 'AllowTelemetry', 0),
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'DoNotShowFeedbackNotifications', 1),
      R('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', 'Enabled', 0),
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\AdvertisingInfo', 'DisabledByGroupPolicy', 1),
      R('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy', 'TailoredExperiencesWithDiagnosticDataEnabled', 0),
      R('HKCU\\Software\\Microsoft\\InputPersonalization', 'RestrictImplicitInkCollection', 1),
      R('HKCU\\Software\\Microsoft\\InputPersonalization', 'RestrictImplicitTextCollection', 1),
      R('HKCU\\Software\\Microsoft\\InputPersonalization\\TrainedDataStore', 'HarvestContacts', 0),
      R('HKCU\\Software\\Microsoft\\Personalization\\Settings', 'AcceptedPrivacyPolicy', 0),
      R('HKCU\\Software\\Microsoft\\Speech_OneCore\\Settings\\OnlineSpeechPrivacy', 'HasAccepted', 0),
      R('HKCU\\Software\\Microsoft\\Siuf\\Rules', 'NumberOfSIUFInPeriod', 0),
      R('HKCU\\Software\\Microsoft\\Siuf\\Rules', 'PeriodInNanoSeconds', 0),
      R(ADV, 'Start_TrackProgs', 0),
      R('HKLM\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled', 1),
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppCompat', 'AITEnable', 0),
    ],
    apply: `$state = @{ svc = @(); tasks = @(); samples = $null }
foreach ($n in 'DiagTrack','dmwappushservice') { $s = Get-ServiceStartSnapshot $n; if ($s) { $state.svc += $s; Stop-Service $n -Force -ErrorAction SilentlyContinue; Set-ServiceStart $n 'Disabled' } }
$tasks = @(
  @('\\Microsoft\\Windows\\Application Experience\\','Microsoft Compatibility Appraiser'),
  @('\\Microsoft\\Windows\\Application Experience\\','ProgramDataUpdater'),
  @('\\Microsoft\\Windows\\Customer Experience Improvement Program\\','Consolidator'),
  @('\\Microsoft\\Windows\\Customer Experience Improvement Program\\','UsbCeip'),
  @('\\Microsoft\\Windows\\DiskDiagnostic\\','Microsoft-Windows-DiskDiagnosticDataCollector'),
  @('\\Microsoft\\Windows\\Feedback\\Siuf\\','DmClient'),
  @('\\Microsoft\\Windows\\Feedback\\Siuf\\','DmClientOnScenarioDownload'),
  @('\\Microsoft\\Windows\\Windows Error Reporting\\','QueueReporting'))
foreach ($t in $tasks) { $x = Get-ScheduledTask -TaskPath $t[0] -TaskName $t[1] -ErrorAction SilentlyContinue; if ($x -and $x.State -ne 'Disabled') { $x | Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null; $state.tasks += ,@($t[0], $t[1]) } }
try { $state.samples = (Get-MpPreference).SubmitSamplesConsent; Set-MpPreference -SubmitSamplesConsent 2 -ErrorAction Stop } catch {}`,
    unapply: `if ($state) {
  foreach ($s in @($state.svc)) { Restore-ServiceStart $s }
  foreach ($t in @($state.tasks)) { Enable-ScheduledTask -TaskPath $t[0] -TaskName $t[1] -ErrorAction SilentlyContinue | Out-Null }
  if ($null -ne $state.samples) { try { Set-MpPreference -SubmitSamplesConsent $state.samples } catch {} }
}`,
  },
  {
    id: 'activity_history', cat: 'privacidade', name: 'Desativar histórico de atividades', rec: true, risk: 'safe',
    desc: 'EnableActivityFeed, PublishUserActivities, UploadUserActivities = 0.',
    reg: [
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'EnableActivityFeed', 0),
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'PublishUserActivities', 0),
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'UploadUserActivities', 0),
    ],
  },
  {
    id: 'location', cat: 'privacidade', name: 'Desativar rastreamento de localização', rec: true, risk: 'safe',
    desc: 'Nega acesso à localização para apps e desliga o serviço de localização. (Corrigido em relação ao original: NÃO desliga a atualização automática do Windows nem o DiagTrack.)',
    reg: [
      RS('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location', 'Value', 'Deny', { def: 'Allow' }),
      R('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Sensor\\Overrides\\{BFA794E4-F964-4FDB-90F6-51056BFE4B44}', 'SensorPermissionState', 0),
      R('HKLM\\SYSTEM\\CurrentControlSet\\Services\\lfsvc\\Service\\Configuration', 'Status', 0),
    ],
  },
  {
    id: 'copilot', cat: 'privacidade', name: 'Desativar Copilot', rec: true, risk: 'safe',
    desc: 'Remove os pacotes Microsoft.Copilot de todos os usuários e bloqueia o Copilot por política (botão e atalho).',
    warn: 'Desfazer restaura as políticas; o app Copilot precisa ser reinstalado pela Store se quiser de volta.',
    reg: [
      R('HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot', 1),
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot', 1),
      R(ADV, 'ShowCopilotButton', 0),
    ],
    apply: `$state = @{ removed = @(Remove-AppxEverywhere 'Microsoft.Copilot*') + @(Remove-AppxEverywhere 'Microsoft.Windows.Ai.Copilot.Provider') }`,
  },
  {
    id: 'recall', cat: 'privacidade', name: 'Desativar Windows Recall', reboot: true, risk: 'safe',
    desc: 'AllowRecallEnablement = 0 e DisableAIDataAnalysis = 1 (o Windows não tira "fotos" da tela).',
    reg: [
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', 'AllowRecallEnablement', 0),
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableAIDataAnalysis', 1),
      R('HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableAIDataAnalysis', 1),
    ],
  },
  {
    id: 'consumer_features', cat: 'privacidade', name: 'Desativar recursos de consumidor', risk: 'safe',
    desc: 'Impede a instalação automática de jogos/apps sugeridos da Store e sugestões no Iniciar/Configurações.',
    reg: [
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent', 'DisableWindowsConsumerFeatures', 1),
      R(CDM, 'SilentInstalledAppsEnabled', 0), R(CDM, 'PreInstalledAppsEnabled', 0), R(CDM, 'OemPreInstalledAppsEnabled', 0),
      R(CDM, 'SystemPaneSuggestionsEnabled', 0), R(CDM, 'SubscribedContent-338388Enabled', 0), R(CDM, 'SubscribedContent-338393Enabled', 0),
      R(CDM, 'SubscribedContent-353694Enabled', 0), R(CDM, 'SubscribedContent-353696Enabled', 0),
    ],
  },
  {
    id: 'bing', cat: 'privacidade', name: 'Remover integração com o Bing', risk: 'safe',
    desc: 'Remove apps Bing (Notícias, Clima, Finanças, Esportes, Pesquisa) e a busca web na Pesquisa do Windows.',
    warn: 'Desfazer reativa a busca web; os apps removidos precisam ser reinstalados pela Store.',
    reg: [
      R('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', 'BingSearchEnabled', 0),
      R('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', 'CortanaConsent', 0),
      R('HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer', 'DisableSearchBoxSuggestions', 1),
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'ConnectedSearchUseWeb', 0),
    ],
    apply: `$r = @(); foreach ($p in 'Microsoft.BingNews','Microsoft.BingWeather','Microsoft.BingFinance','Microsoft.BingSports','Microsoft.BingSearch','Microsoft.BingTravel','Microsoft.BingFoodAndDrink','Microsoft.BingHealthAndFitness') { $r += Remove-AppxEverywhere $p }; $state = @{ removed = $r }`,
  },
  {
    id: 'onedrive', cat: 'privacidade', name: 'Remover OneDrive', risk: 'caution', noUndo: true,
    desc: 'Desinstala o OneDrive, limpa restos do programa e restaura as pastas do usuário (Área de Trabalho, Documentos, Imagens...) para os locais padrão.',
    warn: 'Seus arquivos NÃO são apagados: o que estava sincronizado continua em %USERPROFILE%\\OneDrive. Mova-os de volta manualmente se quiser. Para reinstalar, baixe o OneDrive no site da Microsoft.',
    apply: `Get-Process OneDrive -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
$setups = @("$env:SystemRoot\\System32\\OneDriveSetup.exe", "$env:SystemRoot\\SysWOW64\\OneDriveSetup.exe")
$setups += @(Get-ChildItem "$env:LOCALAPPDATA\\Microsoft\\OneDrive", "$env:ProgramFiles\\Microsoft OneDrive", "\${env:ProgramFiles(x86)}\\Microsoft OneDrive" -Filter OneDriveSetup.exe -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
foreach ($s in $setups) { if (Test-Path $s) { Start-Process $s -ArgumentList '/uninstall' -Wait -ErrorAction SilentlyContinue } }
Remove-Item "$env:LOCALAPPDATA\\Microsoft\\OneDrive", "$env:ProgramData\\Microsoft OneDrive", "$env:LOCALAPPDATA\\OneDrive" -Recurse -Force -ErrorAction SilentlyContinue
Remove-RegValue 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' 'OneDrive'
Set-RegValue 'HKCU\\Software\\Classes\\CLSID\\{018D5C66-4533-4307-9B53-224DE2ED1FE6}' 'System.IsPinnedToNameSpaceTree' 0
$usf = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'
$map = @{ 'Desktop'='Desktop'; 'Personal'='Documents'; 'My Pictures'='Pictures'; 'My Music'='Music'; 'My Video'='Videos'; '{374DE290-123F-4565-9164-39C4925E467B}'='Downloads' }
foreach ($k in $map.Keys) { $v = [string](Get-RegValue $usf $k ''); if ($v -match 'OneDrive') { $dst = "%USERPROFILE%\\" + $map[$k]; New-Item -ItemType Directory -Force -Path ([Environment]::ExpandEnvironmentVariables($dst)) | Out-Null; Set-RegValue $usf $k $dst 'ExpandString' } }
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue`,
    check: `-not (Test-Path "$env:LOCALAPPDATA\\Microsoft\\OneDrive\\OneDrive.exe") -and -not (Test-Path "$env:ProgramFiles\\Microsoft OneDrive\\OneDrive.exe")`,
  },
  {
    id: 'store_search', cat: 'privacidade', name: 'Desativar sugestões da Store na pesquisa', risk: 'caution',
    desc: 'Nega escrita no store.db da Store, que alimenta as sugestões de apps na busca do Iniciar.',
    warn: 'Se a Microsoft Store apresentar erro na busca, desfaça este ajuste.',
    apply: `$db = "$env:LOCALAPPDATA\\Packages\\Microsoft.WindowsStore_8wekyb3d8bbwe\\LocalState\\store.db"
if (-not (Test-Path $db)) { New-Item -ItemType File -Force -Path $db | Out-Null }
Exec icacls $db /deny '*S-1-1-0:F' | Out-Null`,
    unapply: `$db = "$env:LOCALAPPDATA\\Packages\\Microsoft.WindowsStore_8wekyb3d8bbwe\\LocalState\\store.db"
if (Test-Path $db) { Run icacls $db /remove:d '*S-1-1-0' | Out-Null }`,
    check: `$db = "$env:LOCALAPPDATA\\Packages\\Microsoft.WindowsStore_8wekyb3d8bbwe\\LocalState\\store.db"; (Test-Path $db) -and ((Run icacls $db) -match '(Everyone|Todos):\\(DENY\\)|S-1-1-0:\\(DENY\\)|\\(N\\)')`,
  },
  {
    id: 'wpbt', cat: 'privacidade', name: 'Desativar WPBT', risk: 'caution', reboot: true,
    desc: 'Impede que o fabricante do PC execute programas a partir do firmware a cada boot (Windows Platform Binary Table).',
    warn: 'Utilitários do fabricante (ex.: instaladores automáticos de drivers ASUS Armoury Crate / Lenovo) deixam de se reinstalar sozinhos — normalmente é o que se quer.',
    reg: [R('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager', 'DisableWpbtExecution', 1)],
  },
  {
    id: 'debloat', cat: 'privacidade', name: 'Debloat do Windows', rec: true, risk: 'safe', link: 'debloat',
    desc: 'Abre o seletor visual de remoção de apps (aba Remover Apps).',
  },

  // =====================================================================
  // 2.5 APARÊNCIA E INTERFACE
  // =====================================================================
  {
    id: 'dark_mode', cat: 'aparencia', name: 'Ativar modo escuro', rec: true, risk: 'safe',
    desc: 'Tema escuro do sistema e dos apps (funciona até em Windows não ativado).',
    reg: [
      R('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'AppsUseLightTheme', 0, { def: 1 }),
      R('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'SystemUsesLightTheme', 0, { def: 1 }),
    ],
  },
  {
    id: 'classic_context', cat: 'aparencia', name: 'Menu de contexto clássico', rec: true, risk: 'safe', win11: true,
    desc: 'Volta o menu do botão direito do Windows 10 no Windows 11 (sem "Mostrar mais opções").',
    apply: `Set-RegValue 'HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32' '' '' 'String'
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue`,
    unapply: `Remove-RegKey 'HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}'
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue`,
    check: `$k = Open-RegKey 'HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32' $false $false; if ($k) { $k.Close(); $true } else { $false }`,
  },
  {
    id: 'end_task', cat: 'aparencia', name: '"Finalizar tarefa" na barra de tarefas', rec: true, risk: 'safe', win11: true,
    desc: 'TaskbarEndTask = 1: clique direito num app da barra → Finalizar tarefa.',
    reg: [R(ADV + '\\TaskbarDeveloperSettings', 'TaskbarEndTask', 1)],
  },
  {
    id: 'hide_recommended', cat: 'aparencia', name: 'Ocultar "Recomendados" do Iniciar', rec: true, reboot: true, risk: 'safe', win11: true,
    desc: 'HideRecommendedSection (via política de "ambiente educacional", que também desliga o Spotlight na tela de bloqueio).',
    reg: [
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer', 'HideRecommendedSection', 1),
      R('HKLM\\SOFTWARE\\Microsoft\\PolicyManager\\current\\device\\Start', 'HideRecommendedSection', 1),
      R('HKLM\\SOFTWARE\\Microsoft\\PolicyManager\\current\\device\\Education', 'IsEducationEnvironment', 1),
    ],
  },
  {
    id: 'file_ext', cat: 'aparencia', name: 'Mostrar extensões de arquivos', rec: true, reboot: true, risk: 'safe',
    desc: 'HideFileExt = 0 (ajuda a identificar arquivos falsos como "foto.jpg.exe").',
    reg: [R(ADV, 'HideFileExt', 0, { def: 1 })],
  },
  {
    id: 'hidden_files', cat: 'aparencia', name: 'Mostrar arquivos ocultos', reboot: true, risk: 'safe',
    desc: 'Hidden = 1.', reg: [R(ADV, 'Hidden', 1, { def: 2 })],
  },
  {
    id: 'taskbar_left', cat: 'aparencia', name: 'Alinhar barra de tarefas à esquerda', risk: 'safe', win11: true,
    desc: 'TaskbarAl = 0.', reg: [R(ADV, 'TaskbarAl', 0, { def: 1 })],
  },
  {
    id: 'hide_search', cat: 'aparencia', name: 'Ocultar pesquisa da barra de tarefas', reboot: true, risk: 'safe',
    desc: 'SearchboxTaskbarMode = 0 (a busca continua funcionando ao digitar no Iniciar).',
    reg: [R('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', 'SearchboxTaskbarMode', 0)],
  },
  {
    id: 'taskview_widgets', cat: 'aparencia', name: 'Ocultar Visão de Tarefas e Widgets', risk: 'safe',
    desc: 'Remove os dois botões da barra de tarefas (Widgets via política, que é o que funciona nas builds novas).',
    reg: [
      R(ADV, 'ShowTaskViewButton', 0, { def: 1 }),
      R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Dsh', 'AllowNewsAndInterests', 0),
      R(ADV, 'TaskbarDa', 0, { optional: true }),
    ],
  },
  {
    id: 'explorer_home', cat: 'aparencia', name: 'Remover Início e Galeria do Explorer', reboot: true, risk: 'safe', win11: true,
    desc: 'Tira os itens "Início" e "Galeria" do painel lateral e abre "Este Computador" por padrão.',
    reg: [
      R('HKCU\\Software\\Classes\\CLSID\\{f874310e-b6b7-47dc-bc84-b9e6b38f5903}', 'System.IsPinnedToNameSpaceTree', 0),
      R('HKCU\\Software\\Classes\\CLSID\\{e88865ea-0e1c-4e20-9aa6-edcd0212c87c}', 'System.IsPinnedToNameSpaceTree', 0),
      R(ADV, 'LaunchTo', 1),
    ],
  },
  {
    id: 'settings_home', cat: 'aparencia', name: 'Ocultar página inicial das Configurações', risk: 'safe', win11: true,
    desc: 'SettingsPageVisibility = hide:home.',
    reg: [RS('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'SettingsPageVisibility', 'hide:home')],
  },
  {
    id: 'sync_ads', cat: 'aparencia', name: 'Desativar anúncios no Explorer', risk: 'safe',
    desc: 'ShowSyncProviderNotifications = 0 (remove as "dicas" de OneDrive/Microsoft 365 no Explorador de Arquivos). Substitui o item "Layout antigo do Menu Iniciar" do original, que dependia de feature flags não documentadas.',
    reg: [R(ADV, 'ShowSyncProviderNotifications', 0, { def: 1 })],
  },
  {
    id: 'no_lockscreen', cat: 'aparencia', name: 'Desativar tela de bloqueio', risk: 'safe',
    desc: 'NoLockScreen: vai direto para senha/PIN.',
    reg: [R('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization', 'NoLockScreen', 1)],
  },
  {
    id: 'lockscreen_tips', cat: 'aparencia', name: 'Desativar dicas na tela de bloqueio', risk: 'safe',
    desc: 'Remove curiosidades/anúncios da tela de bloqueio e dicas do Windows.',
    reg: [
      R(CDM, 'RotatingLockScreenOverlayEnabled', 0), R(CDM, 'SubscribedContent-338387Enabled', 0),
      R(CDM, 'SoftLandingEnabled', 0), R(CDM, 'SubscribedContent-310093Enabled', 0),
    ],
  },
  {
    id: 'notification_center', cat: 'aparencia', name: 'Desativar Central de Notificações', risk: 'caution', reboot: true,
    desc: 'Desliga notificações, toasts e o calendário do relógio.',
    warn: 'Você deixa de ver qualquer notificação do Windows e dos apps.',
    reg: [
      R('HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer', 'DisableNotificationCenter', 1),
      R('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications', 'ToastEnabled', 0),
    ],
  },
  {
    id: 'snap', cat: 'aparencia', name: 'Desativar encaixe de janelas (Snap)', risk: 'safe',
    desc: 'WindowArrangementActive = 0.', reg: [RS('HKCU\\Control Panel\\Desktop', 'WindowArrangementActive', '0', { def: '1' })],
  },
  {
    id: 'clock_24h', cat: 'aparencia', name: 'Relógio 24 horas', risk: 'safe',
    desc: 'Formato de hora 24h (HH:mm).',
    reg: [RS('HKCU\\Control Panel\\International', 'sShortTime', 'HH:mm'), RS('HKCU\\Control Panel\\International', 'sTimeFormat', 'HH:mm:ss')],
  },
  {
    id: 'clock_seconds', cat: 'aparencia', name: 'Mostrar segundos no relógio', reboot: true, risk: 'safe',
    desc: 'Segundos no relógio da barra de tarefas.', reg: [R(ADV, 'ShowSecondsInSystemClock', 1)],
  },
  {
    id: 'aero_shake', cat: 'aparencia', name: 'Desativar "chacoalhar para minimizar"', risk: 'safe',
    desc: 'DisallowShaking = 1 (sacudir uma janela não minimiza mais as outras). Substitui o item "% da bateria" do original, que não tem chave de registro documentada.',
    reg: [R(ADV, 'DisallowShaking', 1)],
  },
  {
    id: 'numlock', cat: 'aparencia', name: 'Num Lock ligado na inicialização', risk: 'safe', hw: ['input'],
    desc: 'Para o usuário e para a tela de login.',
    reg: [
      RS('HKCU\\Control Panel\\Keyboard', 'InitialKeyboardIndicators', '2'),
      RS('HKU\\.DEFAULT\\Control Panel\\Keyboard', 'InitialKeyboardIndicators', '2'),
    ],
  },

  // =====================================================================
  // 2.6 GERAL / DIAGNÓSTICO
  // =====================================================================
  {
    id: 'bsod_detailed', cat: 'geral', name: 'BSOD detalhada', risk: 'safe',
    desc: 'DisplayParameters = 1 na tela azul (mostra parâmetros técnicos do erro).',
    reg: [R('HKLM\\SYSTEM\\CurrentControlSet\\Control\\CrashControl', 'DisplayParameters', 1)],
  },
  {
    id: 'verbose_status', cat: 'geral', name: 'Mensagens detalhadas de login', risk: 'safe',
    desc: 'VerboseStatus = 1 (mostra o que o Windows está fazendo no boot/desligamento).',
    reg: [R('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', 'VerboseStatus', 1)],
  },
  {
    id: 'long_paths', cat: 'geral', name: 'Caminhos longos', reboot: true, risk: 'safe',
    desc: 'LongPathsEnabled = 1 (caminhos acima de 260 caracteres).', reg: [R(FS, 'LongPathsEnabled', 1, { def: 0 })],
  },
  {
    id: 'utc_time', cat: 'geral', name: 'Hora em UTC', risk: 'safe',
    desc: 'RealTimeIsUniversal = 1 (útil em dual boot com Linux; evita relógio errado ao trocar de sistema).',
    reg: [R('HKLM\\SYSTEM\\CurrentControlSet\\Control\\TimeZoneInformation', 'RealTimeIsUniversal', 1)],
  },
  {
    id: 'pwsh_default', cat: 'geral', name: 'PowerShell 7 como padrão', risk: 'safe',
    desc: 'Define o PowerShell 7 como perfil padrão do Windows Terminal. Se o PowerShell 7 não estiver instalado, instale-o pela Microsoft Store (o app não baixa nada sozinho).',
    apply: `$pw = @("$env:ProgramFiles\\PowerShell\\7\\pwsh.exe") | Where-Object { Test-Path $_ }
if (-not $pw) { throw 'PowerShell 7 não está instalado. Instale pela Microsoft Store e aplique de novo.' }
$files = @(Get-ChildItem "$env:LOCALAPPDATA\\Packages\\Microsoft.WindowsTerminal*_8wekyb3d8bbwe\\LocalState\\settings.json" -ErrorAction SilentlyContinue)
if (-not $files) { throw 'Windows Terminal não encontrado (ou nunca foi aberto). Abra-o uma vez e tente de novo.' }
$state = @{ files = @() }
foreach ($f in $files) {
  $txt = Get-Content -LiteralPath $f.FullName -Raw
  $m = [regex]::Match($txt, '"defaultProfile"\\s*:\\s*"([^"]*)"')
  $state.files += @{ path = $f.FullName; prev = $m.Groups[1].Value }
  if ($m.Success) { $txt = $txt.Substring(0, $m.Groups[1].Index) + '{574e775e-4f2a-5b96-ac1e-a2962a402336}' + $txt.Substring($m.Groups[1].Index + $m.Groups[1].Length) }
  else { $txt = $txt -replace '^\\s*\\{', '{ "defaultProfile": "{574e775e-4f2a-5b96-ac1e-a2962a402336}",' }
  [IO.File]::WriteAllText($f.FullName, $txt, (New-Object Text.UTF8Encoding $false))
}`,
    unapply: `if ($state -and $state.files) { foreach ($f in $state.files) { if ((Test-Path $f.path) -and $f.prev) {
  $txt = Get-Content -LiteralPath $f.path -Raw
  $txt = $txt -replace '"defaultProfile"\\s*:\\s*"[^"]*"', ('"defaultProfile": "' + $f.prev + '"')
  [IO.File]::WriteAllText($f.path, $txt, (New-Object Text.UTF8Encoding $false)) } } }`,
    check: `$f = Get-ChildItem "$env:LOCALAPPDATA\\Packages\\Microsoft.WindowsTerminal*_8wekyb3d8bbwe\\LocalState\\settings.json" -ErrorAction SilentlyContinue | Select-Object -First 1; ($null -ne $f) -and ((Get-Content -LiteralPath $f.FullName -Raw) -match '"defaultProfile"\\s*:\\s*"\\{574e775e-4f2a-5b96-ac1e-a2962a402336\\}"')`,
  },

  // =====================================================================
  // AJUSTES DE GPU / AGENDADOR (antes ficavam na aba Hardware)
  // =====================================================================
  {
    id: 'hw_gpu_latency', cat: 'jogos', name: 'Latência de energia da GPU', risk: 'caution', reboot: true, hw: ['gpu'],
    desc: '20 chaves DefaultD3TransitionLatency*/DefaultLatencyTolerance* = 1 em GraphicsDrivers\\Power (a GPU sai mais rápido dos estados de economia).',
    warn: 'A GPU tende a gastar mais energia em repouso.',
    reg: ['DefaultD3TransitionLatencyActivelyUsed', 'DefaultD3TransitionLatencyIdleLongTime', 'DefaultD3TransitionLatencyIdleMonitorOff',
      'DefaultD3TransitionLatencyIdleNoContext', 'DefaultD3TransitionLatencyIdleShortTime', 'DefaultD3TransitionLatencyIdleVeryLongTime',
      'DefaultLatencyToleranceIdle0', 'DefaultLatencyToleranceIdle0MonitorOff', 'DefaultLatencyToleranceIdle1',
      'DefaultLatencyToleranceIdle1MonitorOff', 'DefaultLatencyToleranceMemory', 'DefaultLatencyToleranceNoContext',
      'DefaultLatencyToleranceNoContextMonitorOff', 'DefaultLatencyToleranceOther', 'DefaultLatencyToleranceTimerPeriod',
      'DefaultMemoryRefreshLatencyToleranceActivelyUsed', 'DefaultMemoryRefreshLatencyToleranceMonitorOff',
      'DefaultMemoryRefreshLatencyToleranceNoContext', 'MonitorLatencyTolerance', 'MonitorRefreshLatencyTolerance',
    ].map((n) => R('HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers\\Power', n, 1)),
  },
  {
    id: 'hw_mmcss', cat: 'jogos', name: 'Agendador multimídia (MMCSS)', risk: 'safe', hw: ['gpu', 'cpu'],
    desc: 'SystemResponsiveness = 0, NetworkThrottlingIndex desligado, tarefa "Games" com GPU Priority 8, Priority 6, Clock Rate 10000, categoria High.',
    reg: [
      R(MMCSS, 'SystemResponsiveness', 0, { def: 20 }), R(MMCSS, 'NetworkThrottlingIndex', 4294967295, { def: 10 }),
      R(GAMES, 'GPU Priority', 8), R(GAMES, 'Priority', 6), R(GAMES, 'Clock Rate', 10000),
      RS(GAMES, 'Scheduling Category', 'High'), RS(GAMES, 'SFIO Priority', 'High'),
    ],
  },
];

module.exports = { tweaks, R, RS, DEL };
