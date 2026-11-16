# Teste visual automatizado: abre uma instância isolada (dados em .test\data), roda um roteiro
# (--run) e captura a janela com PrintWindow — sem usar mouse/teclado de quem está no computador.
#   .\scripts\visual-test.ps1 -Name split -Run "url:example.com;wait:3000;cmd:splitView;type:wikipedia.org;enter" -At 6,12
#   -Packaged usa release\win-unpacked em vez do Electron de desenvolvimento.
param([string]$Run, [string]$Name = 'shot', [int[]]$At = @(8), [switch]$Fresh, [switch]$Packaged)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public class PW { [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Ri, B; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint f);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
'@
[PW]::SetProcessDPIAware() | Out-Null
$proj = Split-Path $PSScriptRoot
$out = Join-Path $proj '.test'
$data = Join-Path $out 'data'
New-Item -ItemType Directory -Force $out | Out-Null
if ($Fresh -and (Test-Path $data)) { Remove-Item $data -Recurse -Force }
$env:TSF_DEBUG = '1'; $env:TSF_DATA = $data
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
if ($Packaged) { $p = Start-Process "$proj\release\win-unpacked\TSF Browser.exe" -ArgumentList "`"--run=$Run`"" -PassThru }
else { $p = Start-Process "$proj\node_modules\electron\dist\electron.exe" -ArgumentList ".", "`"--run=$Run`"" -WorkingDirectory $proj -PassThru }
$t0 = Get-Date; $i = 0
foreach ($sec in $At) {
  while (((Get-Date) - $t0).TotalSeconds -lt $sec) { Start-Sleep -Milliseconds 200 }
  $p.Refresh(); $h = $p.MainWindowHandle
  if ($h -eq [IntPtr]::Zero) { Write-Warning "janela não encontrada aos ${sec}s"; continue }
  $r = New-Object PW+R; [PW]::GetWindowRect($h, [ref]$r) | Out-Null
  $bmp = New-Object System.Drawing.Bitmap ($r.Ri - $r.L), ($r.B - $r.T)
  $g = [System.Drawing.Graphics]::FromImage($bmp); $dc = $g.GetHdc()
  [PW]::PrintWindow($h, $dc, 2) | Out-Null
  $g.ReleaseHdc($dc); $g.Dispose()
  $file = Join-Path $out "$Name-$i.png"; $bmp.Save($file); $bmp.Dispose(); $i++
  $file
}
if (-not $p.HasExited) { $p.CloseMainWindow() | Out-Null; Start-Sleep 2; if (-not $p.HasExited) { $p.Kill() } }
