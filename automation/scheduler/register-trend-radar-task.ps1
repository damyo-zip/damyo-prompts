[CmdletBinding()]
param(
  [string]$TaskName = "Damyo Trend Radar"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$WrapperPath = Join-Path $PSScriptRoot "run-trend-radar.ps1"

if (-not (Test-Path -LiteralPath $WrapperPath)) {
  throw "Trend Radar scheduler wrapper is missing: $WrapperPath"
}

$PowerShellPath = Join-Path $PSHOME "powershell.exe"
$ActionArguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$WrapperPath`""
$Action = New-ScheduledTaskAction -Execute $PowerShellPath -Argument $ActionArguments -WorkingDirectory $ProjectRoot
$Triggers = @(
  New-ScheduledTaskTrigger -Daily -At "08:30"
  New-ScheduledTaskTrigger -Daily -At "20:30"
)
$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -WakeToRun:$false `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$Principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited
$Task = New-ScheduledTask -Action $Action -Trigger $Triggers -Settings $Settings -Principal $Principal -Description "Refresh Trend Radar and record Kongi shadow selection twice daily. Never publishes to Instagram."

Register-ScheduledTask -TaskName $TaskName -InputObject $Task -Force | Out-Null

$Registered = Get-ScheduledTask -TaskName $TaskName
$TaskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
[pscustomobject]@{
  task_name = $Registered.TaskName
  task_path = $Registered.TaskPath
  user_id = $Registered.Principal.UserId
  run_level = [string]$Registered.Principal.RunLevel
  logon_type = [string]$Registered.Principal.LogonType
  trigger_times = @($Registered.Triggers | ForEach-Object { ([datetime]$_.StartBoundary).ToString("HH:mm") })
  start_when_available = $Registered.Settings.StartWhenAvailable
  multiple_instances = [string]$Registered.Settings.MultipleInstances
  wake_to_run = $Registered.Settings.WakeToRun
  next_run_time = $TaskInfo.NextRunTime
  action = $Registered.Actions.Execute
  arguments = $Registered.Actions.Arguments
} | ConvertTo-Json -Depth 4
