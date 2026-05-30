# Generates PWA / home-screen icons from logo.png (square crop, optimized sizes).
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot

$logoPath = Join-Path $root "logo.png"
$publicDir = Join-Path $root "public"
$iconDir = Join-Path $publicDir "icons"

if (-not (Test-Path $logoPath)) {
  throw "logo.png not found at $logoPath"
}

New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

function Save-SquareIcon {
  param(
    [int]$Size,
    [string]$OutPath,
    [double]$ContentScale = 1.0
  )

  $src = [System.Drawing.Image]::FromFile($logoPath)
  try {
    $side = [Math]::Min($src.Width, $src.Height)
    $cropX = [int](($src.Width - $side) / 2)
    $cropY = [int](($src.Height - $side) / 2)

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.Clear([System.Drawing.Color]::FromArgb(255, 17, 17, 17))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $drawSize = [int]($Size * $ContentScale)
    $offset = [int](($Size - $drawSize) / 2)
    $graphics.DrawImage(
      $src,
      (New-Object System.Drawing.Rectangle $offset, $offset, $drawSize, $drawSize),
      (New-Object System.Drawing.Rectangle $cropX, $cropY, $side, $side),
      [System.Drawing.GraphicsUnit]::Pixel
    )

    $graphics.Dispose()
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  }
  finally {
    $src.Dispose()
  }
}

Save-SquareIcon -Size 192 -OutPath (Join-Path $iconDir "icon-192.png")
Save-SquareIcon -Size 512 -OutPath (Join-Path $iconDir "icon-512.png")
Save-SquareIcon -Size 512 -OutPath (Join-Path $iconDir "icon-maskable-512.png") -ContentScale 0.82
Save-SquareIcon -Size 180 -OutPath (Join-Path $publicDir "apple-touch-icon.png")
Save-SquareIcon -Size 48 -OutPath (Join-Path $publicDir "favicon.png")

Write-Host "PWA icons generated in public/ and public/icons/"
