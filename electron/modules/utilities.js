// Utilitários: atalhos que rodam comandos do próprio Windows.
const ps = require('../ps');
const log = require('../log');
const { shell } = require('electron');

const KEYS = `Add-Type -Namespace WB -Name Kb -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);' -ErrorAction SilentlyContinue
function Send-Combo([byte[]]$keys) { foreach ($k in $keys) { [WB.Kb]::keybd_event($k, 0, 0, [UIntPtr]::Zero) }; Start-Sleep -Milliseconds 80; [array]::Reverse($keys); foreach ($k in $keys) { [WB.Kb]::keybd_event($k, 0, 2, [UIntPtr]::Zero) } }`;

const ACTIONS = {
  cleanmgr: { name: 'Limpeza de Disco', group: 'Manutenção', run: () => ps.run('Start-Process cleanmgr.exe') },
  storagesense: { name: 'Sensor de Armazenamento', group: 'Manutenção', run: () => shell.openExternal('ms-settings:storagesense') },
  msinfo: { name: 'Informações do Sistema', group: 'Sistema', run: () => ps.run('Start-Process msinfo32.exe') },
  startup: { name: 'Programas na inicialização', group: 'Sistema', run: () => shell.openExternal('ms-settings:startupapps') },
  taskmgr: { name: 'Gerenciador de Tarefas', group: 'Sistema', run: () => ps.run('Start-Process taskmgr.exe') },
  devmgmt: { name: 'Gerenciador de Dispositivos', group: 'Sistema', run: () => ps.run('Start-Process devmgmt.msc') },
  services: { name: 'Serviços', group: 'Sistema', run: () => ps.run('Start-Process services.msc') },
  diskmgmt: { name: 'Gerenciamento de Disco', group: 'Sistema', run: () => ps.run('Start-Process diskmgmt.msc') },
  eventvwr: { name: 'Visualizador de Eventos', group: 'Sistema', run: () => ps.run('Start-Process eventvwr.msc') },
  restart_gpu: { name: 'Reiniciar driver gráfico', group: 'Reparos', desc: 'Equivale a Win+Ctrl+Shift+B (a tela pisca).', run: () => ps.run(`${KEYS}\nSend-Combo @(0x5B, 0x11, 0x10, 0x42)`) },
  restart_search: { name: 'Reiniciar Pesquisa/UI do Windows', group: 'Reparos', run: () => ps.run(`Restart-Service WSearch -Force -ErrorAction SilentlyContinue
foreach ($p in 'SearchHost','SearchApp','StartMenuExperienceHost','ShellExperienceHost','TextInputHost') { Get-Process $p -ErrorAction SilentlyContinue | Stop-Process -Force }`) },
  restart_explorer: { name: 'Reiniciar o Explorer', group: 'Reparos', run: () => ps.run('Stop-Process -Name explorer -Force; Start-Sleep 2; if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }') },
  restart_audio: { name: 'Reiniciar o áudio', group: 'Reparos', run: () => ps.run('Restart-Service AudioEndpointBuilder -Force; Restart-Service Audiosrv -Force') },
  fix_bluetooth: { name: 'Corrigir Bluetooth', group: 'Reparos', desc: 'Reinicia os serviços e o adaptador Bluetooth.', run: () => ps.run(`foreach ($s in 'bthserv','BthAvctpSvc','BTAGService') { Restart-Service $s -Force -ErrorAction SilentlyContinue }
Get-PnpDevice -Class Bluetooth -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'Adapter|Radio|Wireless|Intel|Realtek|MediaTek|Qualcomm|Broadcom' -and $_.Status -eq 'OK' } | ForEach-Object { Disable-PnpDevice -InstanceId $_.InstanceId -Confirm:$false; Start-Sleep 2; Enable-PnpDevice -InstanceId $_.InstanceId -Confirm:$false }`) },
  flushdns: { name: 'Limpar cache DNS (flushdns)', group: 'Rede', run: () => ps.run('Exec ipconfig /flushdns | Out-Null') },
  release: { name: 'Liberar IP (release)', group: 'Rede', run: () => ps.run('Run ipconfig /release | Out-Null') },
  renew: { name: 'Renovar IP (renew)', group: 'Rede', run: () => ps.run('Run ipconfig /renew | Out-Null', { timeout: 120000 }) },
  reset_network: { name: 'Redefinir pilha de rede', group: 'Rede', desc: 'netsh winsock reset + netsh int ip reset + flushdns. Pede reinício.', confirm: true, run: () => ps.run('Run netsh winsock reset | Out-Null; Run netsh int ip reset | Out-Null; Run ipconfig /flushdns | Out-Null') },
  sfc: { name: 'SFC /scannow', group: 'Reparos', desc: 'Verifica e repara arquivos do sistema (abre um console).', run: () => ps.openConsole('sfc /scannow') },
  dism: { name: 'DISM RestoreHealth', group: 'Reparos', desc: 'Repara a imagem do Windows (o próprio Windows pode baixar arquivos do Windows Update).', run: () => ps.openConsole('DISM /Online /Cleanup-Image /RestoreHealth') },
  chkdsk: { name: 'CHKDSK (verificação online)', group: 'Reparos', desc: 'chkdsk C: /scan — sem reiniciar.', run: () => ps.openConsole('chkdsk %SystemDrive% /scan') },
  chkdsk_boot: { name: 'CHKDSK no próximo boot', group: 'Reparos', desc: 'Agenda chkdsk /f /r na próxima reinicialização.', confirm: true, run: () => ps.openConsole('echo S| chkdsk %SystemDrive% /f /r') },
  wu_open: { name: 'Abrir Windows Update', group: 'Windows Update', run: () => shell.openExternal('ms-settings:windowsupdate') },
  wu_pause: { name: 'Pausar atualizações por 7 dias', group: 'Windows Update', run: () => ps.run(`$p = 'HKLM\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX\\Settings'
$s = (Get-Date).ToUniversalTime(); $e = $s.AddDays(7); $f = 'yyyy-MM-ddTHH:mm:ssZ'
foreach ($n in 'PauseFeatureUpdatesStartTime','PauseQualityUpdatesStartTime','PauseUpdatesStartTime') { Set-RegValue $p $n $s.ToString($f) 'String' }
foreach ($n in 'PauseFeatureUpdatesEndTime','PauseQualityUpdatesEndTime','PauseUpdatesExpiryTime') { Set-RegValue $p $n $e.ToString($f) 'String' }`) },
  wu_resume: { name: 'Retomar atualizações', group: 'Windows Update', run: () => ps.run(`$p = 'HKLM\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX\\Settings'
foreach ($n in 'PauseFeatureUpdatesStartTime','PauseQualityUpdatesStartTime','PauseUpdatesStartTime','PauseFeatureUpdatesEndTime','PauseQualityUpdatesEndTime','PauseUpdatesExpiryTime') { Remove-RegValue $p $n }`) },
  power_options: { name: 'Opções de energia (Painel)', group: 'Energia', run: () => ps.run('Start-Process powercfg.cpl') },
};

function list() { return Object.entries(ACTIONS).map(([id, a]) => ({ id, name: a.name, group: a.group, desc: a.desc || '', confirm: !!a.confirm })); }
async function run(id) {
  const a = ACTIONS[id];
  if (!a) throw new Error('Ação desconhecida');
  log.info(`Utilitário: ${a.name}`);
  await a.run();
  return true;
}

async function powerPlans() {
  const r = await ps.json(`$o = Run powercfg /list
$items = @(); foreach ($m in [regex]::Matches($o, '([0-9a-fA-F-]{36})\\s+\\(([^)]*)\\)(\\s*\\*)?')) { $items += @{ guid = $m.Groups[1].Value; name = $m.Groups[2].Value; active = [bool]$m.Groups[3].Value.Trim() } }
Out-Json @{ items = $items }`);
  return r.items || [];
}
async function setPowerPlan(guid) {
  if (!/^[0-9a-fA-F-]{36}$/.test(guid)) throw new Error('GUID inválido');
  await ps.run(`Exec powercfg /setactive ${guid} | Out-Null`);
  return powerPlans();
}

module.exports = { list, run, powerPlans, setPowerPlan };
