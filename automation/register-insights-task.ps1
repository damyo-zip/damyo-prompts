[CmdletBinding()]
param(
  [string]$TaskName = "Damyo Instagram Insights Collector",
  [string]$ProjectRoot = "",
  [string]$NodePath = ""
)

$ErrorActionPreference = "Stop"
if (-not $ProjectRoot) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}
$resolvedProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not $NodePath) {
  $NodePath = (Get-Command node.exe -ErrorAction Stop).Source
}
$resolvedNodePath = (Resolve-Path -LiteralPath $NodePath).Path
$runScript = Join-Path $resolvedProjectRoot "automation\run.mjs"
if (-not (Test-Path -LiteralPath $runScript -PathType Leaf)) {
  throw "Insights collector entry point not found: $runScript"
}

$action = New-ScheduledTaskAction `
  -Execute $resolvedNodePath `
  -Argument '"automation/run.mjs" insights' `
  -WorkingDirectory $resolvedProjectRoot
$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal `
  -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType Interactive `
  -RunLevel Limited

$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "Collect due Instagram Insights snapshots for every configured Damyo account."
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

$registered = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName
[pscustomobject]@{
  TaskName = $registered.TaskName
  State = $registered.State
  Execute = $registered.Actions.Execute
  Arguments = $registered.Actions.Arguments
  WorkingDirectory = $registered.Actions.WorkingDirectory
  RepetitionInterval = $registered.Triggers.Repetition.Interval
  MultipleInstances = $registered.Settings.MultipleInstances
  StartWhenAvailable = $registered.Settings.StartWhenAvailable
  LastRunTime = $info.LastRunTime
  LastTaskResult = $info.LastTaskResult
  NextRunTime = $info.NextRunTime
}
