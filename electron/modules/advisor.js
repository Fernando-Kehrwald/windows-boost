// Otimização automática: lê o hardware/sistema e decide, ajuste por ajuste, o que vale a pena
// para ESTE PC visando desempenho — com o motivo de cada decisão.
//   apply    = recomendado para você (vem marcado)
//   optional = pode ajudar, mas tem contrapartida (vem desmarcado)
//   skip     = não recomendado para o seu caso
const ps = require('../ps');
const log = require('../log');
const system = require('./system');
const tweaks = require('./tweaks');

const FACTS_SCRIPT = `
$enc = Get-CimInstance Win32_SystemEnclosure -ErrorAction SilentlyContinue
$chassis = @($enc.ChassisTypes)
$battery = @(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue).Count -gt 0
# Prioriza o tipo de gabinete; a bateria só decide quando o gabinete é desconhecido (nobreaks USB aparecem como bateria).
$isLaptopCase = [bool]($chassis | Where-Object { $_ -in 8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32 })
$isDesktopCase = [bool]($chassis | Where-Object { $_ -in 3, 4, 5, 6, 7, 13, 15, 16, 24, 35, 36 })
$laptop = $isLaptopCase -or ($battery -and -not $isDesktopCase)
function Feat($n) { try { return [int](Get-CimInstance Win32_OptionalFeature -Filter "Name='$n'" -ErrorAction Stop).InstallState -eq 1 } catch { return $false } }
$svc = @{}; foreach ($s in 'vgc', 'vgk', 'FACEIT', 'FACEITService', 'EasyAntiCheat', 'EasyAntiCheat_EOS', 'BEService', 'ESEADriver2', 'EAAntiCheatService') { $svc[$s] = [bool](Get-Service -Name $s -ErrorAction SilentlyContinue) }
$sysMedia = 'Unknown'; $anyHdd = $false
try {
  $pd = @(Get-PhysicalDisk -ErrorAction Stop)
  $anyHdd = [bool]($pd | Where-Object { [string]$_.MediaType -eq 'HDD' })
  $dn = (Get-Partition -DriveLetter $env:SystemDrive.Substring(0, 1) -ErrorAction Stop).DiskNumber
  $d = $pd | Where-Object { [string]$_.DeviceId -eq [string]$dn } | Select-Object -First 1
  if ($d) { $sysMedia = if ([string]$d.BusType -eq 'NVMe') { 'SSD' } else { [string]$d.MediaType } }
} catch {}
$cfree = 0; try { $cfree = (Get-Volume -DriveLetter $env:SystemDrive.Substring(0, 1)).SizeRemaining } catch {}
Out-Json @{
  laptop = $laptop; battery = $battery; build = [Environment]::OSVersion.Version.Build
  wsl = (Feat 'Microsoft-Windows-Subsystem-Linux'); vmp = (Feat 'VirtualMachinePlatform'); hyperv = (Feat 'Microsoft-Hyper-V-All'); sandbox = (Feat 'Containers-DisposableClientVM')
  docker = (Test-Path "$env:ProgramFiles\\Docker\\Docker")
  vanguard = ($svc.vgc -or $svc.vgk); faceit = ($svc.FACEIT -or $svc.FACEITService); eac = ($svc.EasyAntiCheat -or $svc.EasyAntiCheat_EOS); battleye = $svc.BEService; eaac = $svc.EAAntiCheatService
  sysMedia = $sysMedia; anyHdd = $anyHdd; cFree = [int64]$cfree
  nvInspector = $false
}`;

async function facts() {
  const [f, s] = await Promise.all([ps.json(FACTS_SCRIPT, { timeout: 120000 }), system.staticInfo()]);
  const gpus = s.gpus || [];
  return {
    ...f,
    cpu: s.cpu.brand, cpuVendor: s.cpu.vendor, x3d: !!s.cpu.x3d, hybrid: !!s.cpu.hybrid, cores: s.cpu.physicalCores,
    ramGB: Math.round((s.ram.total || 0) / 1073741824),
    gpu: gpus.map((g) => g.model).join(' + ') || 'não detectada',
    nvidia: gpus.some((g) => g.kind === 'nvidia'), amdGpu: gpus.some((g) => g.kind === 'amd'),
    dGpu: gpus.some((g) => g.kind === 'nvidia' || g.kind === 'amd'),
    win11: f.build >= 22000,
    virt: !!(f.wsl || f.vmp || f.hyperv || f.sandbox || f.docker),
    allSsd: f.sysMedia === 'SSD' && !f.anyHdd,
    os: s.os.distro,
  };
}

function decide(f) {
  const out = [];
  const A = (id, reason) => out.push({ id, action: 'apply', reason });
  const O = (id, reason) => out.push({ id, action: 'optional', reason });
  const S = (id, reason) => out.push({ id, action: 'skip', reason });
  const desk = !f.laptop;
  const NB = 'Em notebook isso reduz bastante a duração da bateria e aumenta o calor.';

  // ---------- desempenho e sistema ----------
  desk ? A('ultimate_power', 'Desktop na tomada: mantém o processador sempre pronto no clock máximo.') : S('ultimate_power', NB);
  A('services_manual', 'Menos serviços carregados no boot e em segundo plano. Windows Update e Segurança do Windows não são alterados.');
  desk ? A('core_parking', 'Mantém todos os núcleos acordados: menos atraso quando o jogo pede mais CPU.') : S('core_parking', NB);
  f.laptop ? A('cooling_active', 'Notebook: as ventoinhas aceleram antes de o processador perder clock — evita quedas de FPS por calor.')
    : O('cooling_active', 'Desktop: ventoinhas aceleram antes de reduzir clock (mais barulho).');
  f.laptop ? O('cpu_max_99', 'Se o notebook esquenta e o FPS cai depois de um tempo jogando, isso resolve na maioria dos casos. O Guardião térmico do Modo Jogo já faz isso automaticamente só quando precisa — aplique fixo apenas se esquentar também fora dos jogos.')
    : S('cpu_max_99', 'Desktop: reduziria o desempenho máximo sem necessidade. O Guardião térmico do Modo Jogo age se houver superaquecimento.');
  desk ? O('dynamic_tick', 'Pode reduzir latência, mas o ganho varia e aumenta o consumo. Teste com e sem.') : S('dynamic_tick', NB);
  f.win11 ? A('global_timer', 'Windows 11: faz o timer de alta resolução pedido pelo jogo valer para o sistema todo.') : S('global_timer', 'Só existe no Windows 11.');
  A('win32_priority', 'Dá mais tempo de CPU ao programa em primeiro plano (o jogo).');
  f.ramGB >= 16 ? A('svchost_split', `${f.ramGB} GB de RAM: agrupar serviços economiza CPU e memória.`) : S('svchost_split', `Com ${f.ramGB} GB de RAM é melhor manter os serviços separados.`);
  f.allSsd ? A('sysmain', 'Todos os discos são SSD: o pré-carregamento do SysMain não traz ganho e gasta disco/CPU.')
    : S('sysmain', f.anyHdd ? 'Você tem HD mecânico: o SysMain acelera a abertura de programas nele.' : 'Não foi possível confirmar que o disco do sistema é SSD.');
  f.ramGB >= 32 ? A('memory_compression', `${f.ramGB} GB de RAM: comprimir memória só gasta CPU.`)
    : f.ramGB >= 16 ? O('memory_compression', `Com ${f.ramGB} GB a compressão ainda pode evitar uso do arquivo de paginação em jogos pesados.`)
      : S('memory_compression', `Com ${f.ramGB} GB de RAM a compressão de memória ajuda mais do que atrapalha.`);
  f.ramGB >= 16 ? A('paging_executive', `${f.ramGB} GB de RAM: manter kernel e drivers na memória evita leituras do disco.`) : S('paging_executive', 'Pouca RAM: melhor deixar o Windows decidir.');
  A('fast_startup', 'Desligamento completo: drivers reiniciam limpos e evita problemas acumulados.');
  desk ? A('hibernation', 'Desktop: a hibernação não é usada e o hiberfil.sys ocupa vários GB.') : S('hibernation', 'Em notebook a hibernação protege o trabalho quando a bateria acaba.');
  O('disable_8dot3', 'Ganho pequeno em pastas com muitos arquivos; programas muito antigos podem estranhar.');
  A('last_access', 'Menos escritas no disco a cada arquivo lido.');
  f.cFree < 30 * 1073741824 ? O('reserved_storage', 'Seu disco do sistema está com pouco espaço: libera 7–10 GB. Reative antes de grandes atualizações.') : S('reserved_storage', 'Você tem espaço livre suficiente; o Windows usa essa reserva nas atualizações.');
  S('storage_sense', 'Não afeta desempenho e a limpeza automática é útil.');
  A('bg_apps', 'Apps da Store deixam de rodar escondidos consumindo CPU e rede.');
  if (f.faceit) S('hvci', 'O anti-cheat do FACEIT está instalado e não abre com a Integridade de Memória desligada.');
  else if (f.vanguard) S('hvci', 'O Vanguard (VALORANT) está instalado e pode exigir os recursos de segurança do Windows 11.');
  else O('hvci', 'Pode render alguns % de FPS (mais em CPUs antigas), mas reduz a proteção do sistema contra drivers maliciosos.');
  S('defender_realtime', 'Deixa o PC sem proteção; o ganho em jogos é mínimo.');
  A('menu_delay', 'Menus abrem instantaneamente.');
  A('visual_effects', 'Menos animações e efeitos = menos trabalho para a GPU e interface mais rápida.');
  A('logon_blur', 'Remove um efeito desnecessário.');
  desk ? A('usb_suspend', 'Mouse, teclado e headset USB nunca "dormem": evita atrasos e desconexões.') : S('usb_suspend', NB);
  f.laptop ? A('standby_network', 'Notebook: a rede desligada no sono economiza bateria.') : S('standby_network', 'Sem efeito relevante em desktop.');
  S('s3_sleep', 'Só faz sentido se você tiver problemas com o sono moderno e a placa suportar S3.');

  // ---------- jogos ----------
  A('mouse_accel', 'Mira consistente: o cursor anda sempre a mesma distância para o mesmo movimento.');
  O('input_queue', 'Ganho de latência muito pequeno; mouses de polling alto podem perder eventos.');
  A('keyboard_repeat', 'Teclado mais responsivo.');
  A('sticky_keys', 'Evita a janela das Teclas de Aderência ao apertar Shift várias vezes no jogo.');
  A('game_mode', 'O Windows prioriza o jogo e adia atualizações durante a partida.');
  f.dGpu && f.build >= 19041 ? A('hags', 'Sua placa de vídeo dedicada suporta: menos latência e necessário para DLSS Frame Generation.') : S('hags', f.dGpu ? 'Exige Windows 10 2004 ou mais novo.' : 'Sem placa de vídeo dedicada compatível.');
  S('fso', 'Nas versões atuais do Windows a otimização de tela cheia já tem a mesma latência da tela cheia exclusiva e mantém o Alt+Tab rápido.');
  f.dGpu ? A('windowed_opt', 'Jogos em janela/sem borda passam a usar o modo "flip": menos latência.') : S('windowed_opt', 'Sem placa de vídeo dedicada.');
  S('mpo', 'Só use se tiver tela piscando/preta; fora isso não traz ganho.');
  f.x3d ? S('xbox_gamebar', 'Sua CPU é X3D: a Game Bar é o que manda o jogo para os núcleos com 3D V-Cache.') : O('xbox_gamebar', 'Libera um pouco de memória, mas você perde a gravação/captura do Windows.');
  S('remove_game_apps', 'Pode quebrar o Game Pass e jogos da Microsoft; desligar a Game Bar já basta.');
  f.nvidia ? O('nvidia_profile', 'Precisa do NVIDIA Profile Inspector (indique o caminho em Configurações). Sem desfazer automático.') : S('nvidia_profile', 'Sem placa NVIDIA.');
  f.amdGpu ? O('amd_opt', 'Reduz latências do driver AMD; aumenta um pouco o consumo em repouso.') : S('amd_opt', 'Sem placa AMD.');

  // ---------- rede ----------
  A('network_opt', 'Ajustes TCP para menos latência e conexão mais estável.');
  S('prefer_ipv4', 'Só ajuda se o seu provedor tiver problemas com IPv6.');
  S('teredo', 'O Xbox Live (party e alguns jogos) usa o Teredo.');
  S('disable_ipv6', 'Pode quebrar VPNs, Xbox Live e alguns provedores.');
  A('delivery_opt', 'Seu PC para de enviar atualizações para outros PCs (economiza upload).');
  A('wifi_sense', 'Não conecta sozinho em redes abertas.');

  // ---------- privacidade (também reduzem processos em segundo plano) ----------
  A('telemetry', 'Menos coleta e envio de dados = menos CPU, disco e rede em segundo plano.');
  A('activity_history', 'Menos coleta em segundo plano.');
  A('location', 'Desliga o serviço de localização.');
  A('copilot', 'Remove um app que roda em segundo plano.');
  A('recall', 'Impede o Windows de tirar "fotos" da tela o tempo todo (pesado em disco e CPU).');
  A('consumer_features', 'Impede o Windows de instalar jogos/apps sugeridos sozinho.');
  A('bing', 'A busca do Iniciar fica local e mais rápida.');
  S('onedrive', 'Remove a sincronização dos seus arquivos — só faça se você não usa o OneDrive.');
  O('store_search', 'Remove sugestões da Store na busca; se a Store der erro, desfaça.');
  O('wpbt', 'Impede utilitários do fabricante de se reinstalarem sozinhos.');
  S('rdp_warnings', 'Reduz a proteção e não afeta desempenho.');
  S('debloat', 'Escolha os apps na aba Remover Apps.');

  // ---------- exclusivos da aba Hardware ----------
  A('hw_mmcss', 'O agendador multimídia passa a priorizar a tarefa "Games" (CPU, GPU e disco).');
  desk && f.dGpu ? A('hw_gpu_latency', 'Desktop com GPU dedicada: a placa sai mais rápido dos estados de economia.') : S('hw_gpu_latency', f.laptop ? NB : 'Sem placa de vídeo dedicada.');
  S('hw_storage', 'Desativa a otimização agendada, que também faz o TRIM dos SSDs. Os itens úteis dele já estão no plano.');
  S('hw_power_plan', 'Equivalente ao "Desempenho Máximo", que já está no plano.');
  return out;
}

async function analyze() {
  const f = await facts();
  const list = Object.fromEntries(tweaks.list().map((t) => [t.id, t]));
  const plan = decide(f).filter((d) => list[d.id]).map((d) => ({ ...d, name: list[d.id].name, risk: list[d.id].risk, reboot: list[d.id].reboot, noUndo: list[d.id].noUndo, cat: list[d.id].cat }));
  log.info(`Otimização automática: ${plan.filter((p) => p.action === 'apply').length} recomendados, ${plan.filter((p) => p.action === 'optional').length} opcionais.`);
  return {
    profile: {
      tipo: f.laptop ? 'Notebook' : 'Desktop', cpu: f.cpu, gpu: f.gpu, ram: `${f.ramGB} GB`, os: `${f.os || 'Windows'} (build ${f.build})`,
      disco: f.allSsd ? 'Só SSD' : f.anyHdd ? 'Tem HD mecânico' : f.sysMedia,
      x3d: f.x3d, hybrid: f.hybrid,
      anticheats: [f.vanguard && 'Vanguard (Riot)', f.faceit && 'FACEIT', f.eac && 'Easy Anti-Cheat', f.battleye && 'BattlEye', f.eaac && 'EA Anti-Cheat'].filter(Boolean),
      virtualizacao: [f.wsl && 'WSL', f.vmp && 'Plataforma de VM', f.hyperv && 'Hyper-V', f.sandbox && 'Sandbox', f.docker && 'Docker'].filter(Boolean),
    },
    plan,
  };
}

module.exports = { analyze, decide };
