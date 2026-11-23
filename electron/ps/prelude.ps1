# ===== Windows Boost - funcoes auxiliares carregadas antes de cada script =====
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
trap { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }

function Out-Json($Obj) { $Obj | ConvertTo-Json -Compress -Depth 10 }

# ---------- Registro (.NET, suporta valor padrao '' e DWORD sem sinal) ----------
function Open-RegKey([string]$Path, [bool]$Create, [bool]$Write = $true) {
  $parts = $Path -split '\\', 2
  $hive = $parts[0].ToUpper(); $sub = if ($parts.Count -gt 1) { $parts[1] } else { '' }
  $base = switch ($hive) {
    'HKLM' { [Microsoft.Win32.Registry]::LocalMachine }
    'HKCU' { [Microsoft.Win32.Registry]::CurrentUser }
    'HKCR' { [Microsoft.Win32.Registry]::ClassesRoot }
    'HKU'  { [Microsoft.Win32.Registry]::Users }
    default { throw "Hive de registro invalida: $hive" }
  }
  if ($Create) { return $base.CreateSubKey($sub, $true) }
  return $base.OpenSubKey($sub, $Write)
}
function ConvertTo-RegData($Value, [string]$Kind) {
  switch ($Kind) {
    'DWord' { $v = [int64]$Value; if ($v -gt [int32]::MaxValue) { $v = $v - 4294967296 }; return [int32]$v }
    'QWord' { return [int64]$Value }
    'Binary' { return [byte[]]@($Value | ForEach-Object { [byte]$_ }) }
    'MultiString' { return [string[]]@($Value) }
    default { if ($null -eq $Value) { return '' }; return [string]$Value }
  }
}
function Set-RegValue([string]$Path, [string]$Name, $Value, [string]$Kind = 'DWord') {
  $k = Open-RegKey $Path $true
  try { $k.SetValue($Name, (ConvertTo-RegData $Value $Kind), [Microsoft.Win32.RegistryValueKind]$Kind) } finally { $k.Close() }
}
function Remove-RegValue([string]$Path, [string]$Name) {
  $k = Open-RegKey $Path $false
  if ($null -ne $k) { try { $k.DeleteValue($Name, $false) } finally { $k.Close() } }
}
function Get-RegValue([string]$Path, [string]$Name, $Default = $null) {
  $k = Open-RegKey $Path $false $false
  if ($null -eq $k) { return $Default }
  try { return $k.GetValue($Name, $Default, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } finally { $k.Close() }
}
function Remove-RegKey([string]$Path) {
  $parts = $Path -split '\\', 2
  $k = Open-RegKey $Path $false $false
  if ($null -ne $k) { $k.Close(); Remove-Item -LiteralPath ("Registry::" + (Expand-Hive $parts[0]) + '\' + $parts[1]) -Recurse -Force }
}
function Expand-Hive([string]$h) {
  switch ($h.ToUpper()) { 'HKLM' {'HKEY_LOCAL_MACHINE'} 'HKCU' {'HKEY_CURRENT_USER'} 'HKCR' {'HKEY_CLASSES_ROOT'} 'HKU' {'HKEY_USERS'} default {$h} }
}
function Get-RegSnapshot([string]$Path, [string]$Name) {
  $snap = [ordered]@{ path = $Path; name = $Name; existed = $false; type = $null; value = $null }
  $k = Open-RegKey $Path $false $false
  if ($null -eq $k) { return $snap }
  try {
    if ($k.GetValueNames() -contains $Name) {
      $snap.existed = $true
      $snap.type = $k.GetValueKind($Name).ToString()
      $v = $k.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      if ($v -is [byte[]]) { $v = @($v | ForEach-Object { [int]$_ }) }
      $snap.value = $v
    }
  } finally { $k.Close() }
  return $snap
}
function Invoke-RegOps($Ops) {
  $snaps = New-Object System.Collections.ArrayList
  foreach ($op in @($Ops)) {
    if ($null -eq $op) { continue }
    try {
      $s = Get-RegSnapshot $op.path $op.name
      if ($op.delete) { Remove-RegValue $op.path $op.name } else { Set-RegValue $op.path $op.name $op.value $op.type }
      [void]$snaps.Add($s)
    } catch { if (-not $op.optional) { Restore-RegSnapshots $snaps.ToArray(); throw "Registro $($op.path)\$($op.name): $($_.Exception.Message)" } }
  }
  return ,$snaps.ToArray()
}
function Restore-RegSnapshots($Snaps) {
  foreach ($s in @($Snaps)) {
    if ($null -eq $s) { continue }
    try {
      if ($s.existed -and $s.type -and $s.type -ne 'Unknown' -and $s.type -ne 'None') { Set-RegValue $s.path $s.name $s.value $s.type }
      else { Remove-RegValue $s.path $s.name }
    } catch { [Console]::Error.WriteLine("Aviso ao restaurar $($s.path)\$($s.name): $($_.Exception.Message)") }
  }
}
function ConvertTo-U32($v) { $n = [int64]$v; if ($n -lt 0) { $n += 4294967296 }; return $n }
function Test-RegOps($Ops) {
  foreach ($op in @($Ops)) {
    if ($null -eq $op -or $op.optional) { continue }
    $s = Get-RegSnapshot $op.path $op.name
    if ($op.delete) { if ($s.existed) { return $false }; continue }
    if (-not $s.existed) { return $false }
    switch ($op.type) {
      'DWord' { if ((ConvertTo-U32 $s.value) -ne (ConvertTo-U32 $op.value)) { return $false } }
      'QWord' { if ([int64]$s.value -ne [int64]$op.value) { return $false } }
      'Binary' { if ((@($s.value) -join ',') -ne (@($op.value) -join ',')) { return $false } }
      'MultiString' { if ((@($s.value) -join '|') -ne (@($op.value) -join '|')) { return $false } }
      default { if ([string]$s.value -ne [string]$op.value) { return $false } }
    }
  }
  return $true
}

# ---------- Programas nativos ----------
function Exec([string]$File) {
  $ErrorActionPreference = 'Continue'
  $rest = @($args)
  $out = & $File @rest 2>&1
  if ($LASTEXITCODE -ne 0) { throw "$File $($rest -join ' ') falhou (codigo $LASTEXITCODE): $(($out | Out-String).Trim())" }
  return $out
}

# ---------- Plano de energia ----------
function Get-PowerIndex([string]$Sub, [string]$Setting) {
  $ErrorActionPreference = 'Continue'
  $o = (& powercfg /qh SCHEME_CURRENT $Sub $Setting 2>$null) -join "`n"
  $m = [regex]::Matches($o, '0x([0-9a-fA-F]{8})')
  if ($m.Count -lt 2) { return $null }
  return @{ ac = [Convert]::ToInt64($m[$m.Count - 2].Groups[1].Value, 16); dc = [Convert]::ToInt64($m[$m.Count - 1].Groups[1].Value, 16) }
}
function Set-PowerIndex([string]$Sub, [string]$Setting, $Ac, $Dc) {
  $ErrorActionPreference = 'Continue'
  & powercfg /attributes $Sub $Setting -ATTRIB_HIDE 2>$null | Out-Null
  if ($null -ne $Ac) { Exec powercfg /setacvalueindex SCHEME_CURRENT $Sub $Setting $Ac | Out-Null }
  if ($null -ne $Dc) { Exec powercfg /setdcvalueindex SCHEME_CURRENT $Sub $Setting $Dc | Out-Null }
  Exec powercfg /setactive SCHEME_CURRENT | Out-Null
}
$PWR = @{
  SUB_PROCESSOR = '54533251-82be-4824-96c1-47b60b740d00'; CPMINCORES = '0cc5b647-c1df-4637-891a-dec35c318583'
  IDLEDISABLE = '5d76a2ca-e8c0-402f-a133-2158492d58ad'
  SUB_PCIE = '501a4d13-42af-4429-9fd1-a8218c268e20'; ASPM = 'ee12f906-d277-404b-b6da-e5fa1a576df5'
  SUB_USB = '2a737441-1930-4402-8d77-b2bebba308a3'; USBSUSPEND = '48e6b7a6-50f5-4782-a5d4-53bb8f07e226'
  SUB_NONE = 'fea3413e-7e05-4911-9a71-700331f1c294'; STANDBYNET = 'f15576e8-98b7-4186-b944-eafa664402d9'
}

# ---------- Servicos ----------
function Get-ServiceStartSnapshot([string]$Name) {
  $p = "HKLM\SYSTEM\CurrentControlSet\Services\$Name"
  $k = Open-RegKey $p $false $false
  if ($null -eq $k) { return $null }
  $k.Close()
  return @{ name = $Name; start = (Get-RegValue $p 'Start'); delayed = (Get-RegValue $p 'DelayedAutostart') }
}
function Set-ServiceStart([string]$Name, [string]$Mode) {
  # Mode: Automatic | AutomaticDelayed | Manual | Disabled
  $p = "HKLM\SYSTEM\CurrentControlSet\Services\$Name"
  switch ($Mode) {
    'Automatic' { Set-RegValue $p 'Start' 2; Set-RegValue $p 'DelayedAutostart' 0 }
    'AutomaticDelayed' { Set-RegValue $p 'Start' 2; Set-RegValue $p 'DelayedAutostart' 1 }
    'Manual' { Set-RegValue $p 'Start' 3 }
    'Disabled' { Set-RegValue $p 'Start' 4 }
  }
}
function Restore-ServiceStart($Snap) {
  if ($null -eq $Snap) { return }
  $p = "HKLM\SYSTEM\CurrentControlSet\Services\$($Snap.name)"
  try {
    if ($null -ne $Snap.start) { Set-RegValue $p 'Start' $Snap.start }
    if ($null -ne $Snap.delayed) { Set-RegValue $p 'DelayedAutostart' $Snap.delayed } else { Remove-RegValue $p 'DelayedAutostart' }
  } catch { [Console]::Error.WriteLine("Servico $($Snap.name): $($_.Exception.Message)") }
}

# ---------- Pacotes Appx ----------
function Remove-AppxEverywhere([string]$Pattern) {
  $removed = @()
  Get-AppxPackage -AllUsers -Name $Pattern -ErrorAction SilentlyContinue | ForEach-Object {
    try { Remove-AppxPackage -Package $_.PackageFullName -AllUsers -ErrorAction Stop; $removed += $_.Name } catch {
      try { Remove-AppxPackage -Package $_.PackageFullName -ErrorAction Stop; $removed += $_.Name } catch {}
    }
  }
  Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like $Pattern } | ForEach-Object {
    try { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -AllUsers -ErrorAction Stop | Out-Null } catch {
      try { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction Stop | Out-Null } catch {}
    }
  }
  return $removed
}

function Run([string]$File) {
  # Executa programa nativo sem lancar erro; devolve a saida como texto
  $ErrorActionPreference = 'Continue'
  $rest = @($args)
  return ((& $File @rest 2>&1) | Out-String)
}
function Test-IsWin11 { return ([Environment]::OSVersion.Version.Build -ge 22000) }
