[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$LogDirectory = Join-Path $ProjectRoot "automation\logs"
$LogPath = Join-Path $LogDirectory "trend-scheduler.log"
$StateDirectory = Join-Path $ProjectRoot "automation\state"
$LockPath = Join-Path $StateDirectory "trend-scheduler.lock"
$MaxLogBytes = 5MB
$LogBackupCount = 3
$LockStream = $null
$OverallExitCode = 1
$RunStartedAt = Get-Date

function Rotate-Log {
  if (-not (Test-Path -LiteralPath $LogPath)) { return }
  if ((Get-Item -LiteralPath $LogPath).Length -lt $MaxLogBytes) { return }

  for ($index = $LogBackupCount - 1; $index -ge 1; $index--) {
    $source = "$LogPath.$index"
    $destination = "$LogPath.$($index + 1)"
    if (Test-Path -LiteralPath $source) {
      Move-Item -LiteralPath $source -Destination $destination -Force
    }
  }
  Move-Item -LiteralPath $LogPath -Destination "$LogPath.1" -Force
}

function Write-Log {
  param([Parameter(Mandatory = $true)][string]$Message)

  $timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
  Add-Content -LiteralPath $LogPath -Value "[$timestamp] $Message" -Encoding UTF8
}

function Invoke-TrendCommand {
  param(
    [Parameter(Mandatory = $true)][string]$ScriptName,
    [Parameter(Mandatory = $true)][string]$Label
  )

  Write-Log "$Label started | npm run $ScriptName"
  $commandOutput = @(& $script:NpmCommand run $ScriptName 2>&1 | ForEach-Object { [string]$_ })
  $commandExitCode = $LASTEXITCODE
  if ($null -eq $commandExitCode) { $commandExitCode = 1 }

  $cacheMode = if ($commandOutput -match "\(CACHE\)") {
    if ($Label -eq "Refresh") { "stale_cache_fallback" } else { "cache" }
  } else {
    "fresh"
  }
  Write-Log "$Label finished | exit_code=$commandExitCode | data_mode=$cacheMode"
  if ($commandExitCode -ne 0) {
    $commandOutput | Select-Object -Last 12 | ForEach-Object { Write-Log "$Label error | $_" }
  }

  return [pscustomobject]@{
    ExitCode = [int]$commandExitCode
    Output = $commandOutput
    CacheMode = $cacheMode
  }
}

function Write-RadarSummary {
  try {
    $summaryScriptPath = Join-Path $ProjectRoot "automation\scheduler\summarize-trend-radar.mjs"
    $summaryJson = & $script:NodeCommand $summaryScriptPath
    if ($LASTEXITCODE -ne 0) { throw "Node summary command failed with exit code $LASTEXITCODE" }
    $summary = $summaryJson | ConvertFrom-Json

    $radar = $summary.radar
    Write-Log "Radar summary | Candidates=$($radar.candidates) | Concepts=$($radar.concepts) | Publishable=$($radar.publishable) | Watchlist=$($radar.watchlist)"
    $collectorErrors = @($radar.errors)
    if ($collectorErrors.Count -eq 0) {
      Write-Log "Collector failures | none"
    } else {
      Write-Log "Collector failures | count=$($collectorErrors.Count) | $($collectorErrors -join ' ; ')"
    }

    if ($null -ne $summary.shadow) {
      $shadow = $summary.shadow
      Write-Log "Kongi shadow | Concept=$($shadow.selected_concept) | Total=$($shadow.total_score) | Evidence=$($shadow.evidence_strength) | Momentum=$($shadow.trend_momentum) | Publishable=$($shadow.publishable_count) | run_at=$($shadow.run_at)"
    } else {
      Write-Log "Kongi shadow unavailable | no Kongi shadow record"
    }
  } catch {
    Write-Log "Radar summary unavailable | $($_.Exception.Message)"
  }
}

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
Rotate-Log

try {
  $LockStream = [System.IO.File]::Open($LockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
} catch [System.IO.IOException] {
  Write-Log "Run skipped | another Trend Radar scheduler instance is already running"
  exit 0
}

try {
  Write-Log "Run started | project=$ProjectRoot | account=kongi"
  Set-Location -LiteralPath $ProjectRoot

  $npm = Get-Command npm.cmd -ErrorAction Stop
  $script:NpmCommand = $npm.Source
  $node = Get-Command node.exe -ErrorAction Stop
  $script:NodeCommand = $node.Source

  $refreshResult = Invoke-TrendCommand -ScriptName "trend:refresh" -Label "Refresh"
  if ($refreshResult.ExitCode -ne 0) {
    Write-Log "Refresh failed; continuing to shadow so a valid cache can be used"
  }

  $shadowResult = Invoke-TrendCommand -ScriptName "trend:shadow" -Label "Shadow"
  Write-RadarSummary
  Write-Log "Safety | Instagram posting attempted=NO | image_generation=NO | caption_generation=NO | github_asset_push=NO | meta_publish=NO"

  if ($shadowResult.ExitCode -eq 0) {
    $OverallExitCode = 0
    $overallStatus = if ($refreshResult.ExitCode -eq 0) { "SUCCESS" } else { "PARTIAL_SUCCESS_CACHE_SHADOW" }
  } else {
    $OverallExitCode = 1
    $overallStatus = "FAILED_SHADOW_UNAVAILABLE"
  }

  $elapsedSeconds = [math]::Round(((Get-Date) - $RunStartedAt).TotalSeconds, 1)
  Write-Log "Run finished | status=$overallStatus | refresh_exit=$($refreshResult.ExitCode) | shadow_exit=$($shadowResult.ExitCode) | overall_exit=$OverallExitCode | elapsed_seconds=$elapsedSeconds"
} catch {
  $OverallExitCode = 1
  $elapsedSeconds = [math]::Round(((Get-Date) - $RunStartedAt).TotalSeconds, 1)
  Write-Log "Run failed | error=$($_.Exception.Message) | overall_exit=$OverallExitCode | elapsed_seconds=$elapsedSeconds"
} finally {
  if ($null -ne $LockStream) {
    $LockStream.Dispose()
  }
}

exit $OverallExitCode
