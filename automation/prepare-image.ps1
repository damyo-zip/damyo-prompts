param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$sourcePath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $InputPath))
$destinationPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))

if (-not [System.IO.File]::Exists($sourcePath)) {
  throw "입력 이미지가 없습니다: $sourcePath"
}

if ([System.IO.File]::Exists($destinationPath)) {
  throw "출력 파일을 덮어쓸 수 없습니다: $destinationPath"
}

$destinationDirectory = [System.IO.Path]::GetDirectoryName($destinationPath)
[System.IO.Directory]::CreateDirectory($destinationDirectory) | Out-Null

$source = $null
$target = $null
$graphics = $null

try {
  $source = [System.Drawing.Image]::FromFile($sourcePath)
  $sourceRatio = $source.Width / $source.Height
  $targetRatio = 4.0 / 5.0

  if ([Math]::Abs($sourceRatio - $targetRatio) -gt 0.02) {
    throw "원본 이미지 비율이 4:5 허용 오차를 벗어났습니다: $($source.Width)x$($source.Height)"
  }

  $cropX = 0
  $cropY = 0
  $cropWidth = $source.Width
  $cropHeight = $source.Height

  if ($sourceRatio -gt $targetRatio) {
    $cropWidth = [int][Math]::Round($source.Height * $targetRatio)
    $cropX = [int][Math]::Floor(($source.Width - $cropWidth) / 2)
  } elseif ($sourceRatio -lt $targetRatio) {
    $cropHeight = [int][Math]::Round($source.Width / $targetRatio)
    $cropY = [int][Math]::Floor(($source.Height - $cropHeight) / 2)
  }

  $target = New-Object System.Drawing.Bitmap 1080, 1350, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($target)
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $destinationRect = New-Object System.Drawing.Rectangle 0, 0, 1080, 1350
  $sourceRect = New-Object System.Drawing.Rectangle $cropX, $cropY, $cropWidth, $cropHeight
  $graphics.DrawImage($source, $destinationRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)

  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq "image/jpeg" } |
    Select-Object -First 1
  $qualityEncoder = [System.Drawing.Imaging.Encoder]::Quality
  $encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters 1
  $encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter $qualityEncoder, ([long]95)
  $target.Save($destinationPath, $jpegCodec, $encoderParameters)
  $encoderParameters.Dispose()

  [PSCustomObject]@{
    input = $sourcePath
    output = $destinationPath
    width = 1080
    height = 1350
    format = "jpeg"
  } | ConvertTo-Json
} finally {
  if ($graphics) { $graphics.Dispose() }
  if ($target) { $target.Dispose() }
  if ($source) { $source.Dispose() }
}

