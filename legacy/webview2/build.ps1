# Compila o TSF Browser em dist\TSFBrowser (usa o csc do .NET Framework 4, sem dependências extras).
#   powershell -ExecutionPolicy Bypass -File .\build.ps1
#   .\dist\TSFBrowser\TSFBrowser.exe
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$out = Join-Path $root 'dist\TSFBrowser'
$wv2 = Join-Path $root 'pkg\wv2'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

New-Item -ItemType Directory -Force $out | Out-Null
New-Item -ItemType Directory -Force (Join-Path $root 'assets') | Out-Null

# ---------- ícone (.ico com PNGs 16..256 gerados a partir do logotipo) ----------
Add-Type -AssemblyName System.Drawing
function New-LogoBitmap([int]$s) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.ScaleTransform($s / 256.0, $s / 256.0)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r = 60; $d = $r * 2
    $path.AddArc(8, 8, $d, $d, 180, 90); $path.AddArc(248 - $d, 8, $d, $d, 270, 90)
    $path.AddArc(248 - $d, 248 - $d, $d, $d, 0, 90); $path.AddArc(8, 248 - $d, $d, $d, 90, 90); $path.CloseFigure()
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(0, 0)), ([System.Drawing.Point]::new(256, 256)), ([System.Drawing.Color]::FromArgb(255, 30, 28, 62)), ([System.Drawing.Color]::FromArgb(255, 9, 11, 18))
    $g.FillPath($bg, $path)
    $g.DrawPath((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70, 160, 150, 255)), 4), $path)
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(50, 50)), ([System.Drawing.Point]::new(206, 206)), ([System.Drawing.Color]::FromArgb(255, 154, 140, 255)), ([System.Drawing.Color]::FromArgb(255, 37, 217, 242))
    $pen = New-Object System.Drawing.Pen $grad, 26
    $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
    $g.DrawLine($pen, 66, 76, 190, 76)
    $g.DrawLine($pen, 128, 76, 128, 196)
    $state = $g.Save()
    $g.TranslateTransform(128, 140); $g.RotateTransform(-24)
    $orbit = New-Object System.Drawing.Pen $grad, ([Math]::Max(9, 304 / $s))
    $g.DrawEllipse($orbit, -100, -36, 200, 72)
    $g.Restore($state)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 37, 217, 242))), 208, 92, 18, 18)
    $g.Dispose()
    return $bmp
}
$sizes = 16, 24, 32, 48, 64, 128, 256
$pngs = New-Object 'System.Collections.Generic.List[byte[]]'
foreach ($s in $sizes) {
    $b = New-LogoBitmap $s
    $ms = New-Object System.IO.MemoryStream
    $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs.Add($ms.ToArray()); $b.Dispose()
}
$icoPath = Join-Path $root 'assets\tsf.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $dim = [byte]($sizes[$i] % 256)
    $bw.Write($dim); $bw.Write($dim); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32)
    $bw.Write([UInt32]$pngs[$i].Length); $bw.Write([UInt32]$offset)
    $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $bw.Write($p) }
$bw.Close()
(New-LogoBitmap 256).Save((Join-Path $root 'assets\tsf-256.png'), [System.Drawing.Imaging.ImageFormat]::Png)

# ---------- compilação ----------
$lib = Join-Path $wv2 'lib\net462'
& $csc /nologo /target:winexe /optimize+ /platform:x64 /codepage:65001 `
    "/out:$out\TSFBrowser.exe" "/win32icon:$icoPath" `
    "/r:$lib\Microsoft.Web.WebView2.Core.dll" "/r:$lib\Microsoft.Web.WebView2.WinForms.dll" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll `
    (Join-Path $root 'TSFBrowser.cs')
if ($LASTEXITCODE -ne 0) { throw "Falha na compilação (csc saiu com $LASTEXITCODE)." }

Copy-Item "$lib\Microsoft.Web.WebView2.Core.dll", "$lib\Microsoft.Web.WebView2.WinForms.dll" $out -Force
Copy-Item (Join-Path $wv2 'runtimes\win-x64\native\WebView2Loader.dll') $out -Force
if (Test-Path "$out\shell") { Remove-Item "$out\shell" -Recurse -Force }
Copy-Item (Join-Path $root 'shell') "$out\shell" -Recurse
Write-Host "OK -> $out\TSFBrowser.exe"

# ---------- instalador (payload zip embutido) ----------
Add-Type -AssemblyName System.IO.Compression.FileSystem
$version = '0.2.0'
$payload = Join-Path $root 'dist\payload.zip'
if (Test-Path $payload) { Remove-Item $payload -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($out, $payload, [System.IO.Compression.CompressionLevel]::Optimal, $false)
$setup = Join-Path $root "dist\TSFBrowser-Setup-$version.exe"
& $csc /nologo /target:winexe /optimize+ /platform:anycpu /codepage:65001 `
    "/out:$setup" "/win32icon:$icoPath" `
    "/resource:$payload,payload.zip" "/resource:$(Join-Path $root 'assets\tsf-256.png'),logo.png" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll `
    (Join-Path $root 'Setup.cs')
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o instalador." }
Remove-Item $payload -Force
Write-Host "OK -> $setup"
