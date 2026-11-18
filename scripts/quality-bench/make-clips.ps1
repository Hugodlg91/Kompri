<#
.SYNOPSIS
  Generates the reproducible synthetic 1080p60 bench clips with FFmpeg lavfi.

.DESCRIPTION
  Every source is seeded (gradients, perlin, life, sierpinski, noise), so the
  same FFmpeg build regenerates the same frames. The clip mixes:
    - gradients + animated Perlin texture (large-scale "terrain"/sky detail),
    - a moving testsrc2 card (sharp edges, text, fine motion),
    - a Game-of-Life strip scrolling at 300 px/s (high-contrast, fast motion),
    - a bouncing Sierpinski carpet (fine repetitive detail),
    - a slow global scroll (camera pan) and temporal film grain (noise allf=t+u),
  then encodes H.264 High CRF 17 + AAC stereo 192k (~20 Mbps video).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\quality-bench\make-clips.ps1 -BenchDir C:\tmp\bench
#>
param(
    [Parameter(Mandatory = $true)][string]$BenchDir,
    [string]$Ffmpeg = "",
    [int[]]$Durations = @(60, 10, 180),
    [switch]$Force
)
$ErrorActionPreference = "Stop"
if (-not $Ffmpeg) {
    $Ffmpeg = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..\..\src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe"
}
New-Item -ItemType Directory -Force $BenchDir | Out-Null

function New-SynthClip([int]$Seconds, [string]$OutPath) {
    $fc = "[0:v]format=yuv420p[g];" +
          "[1:v]scale=1920:1080:flags=bicubic,format=yuv420p[p];" +
          "[g][p]blend=c0_expr='clip(A+(B-128)*2,16,235)':c1_expr='A':c2_expr='A'[bg];" +
          "[2:v]format=yuv420p[ts];" +
          "[3:v]scale=960:540:flags=neighbor,format=yuv420p[l];" +
          "[4:v]format=yuv420p[s];" +
          "[bg][ts]overlay=x='(W-w)/2+(W-w)/2*sin(t*0.7)':y='(H-h)/2+(H-h)/2*cos(t*0.45)'[a];" +
          "[a][l]overlay=x='mod(t*300,W+w)-w':y='H-h-30'[b];" +
          "[b][s]overlay=x='W-w-40-200*sin(t*1.3)':y='40+120*abs(sin(t*0.9))'," +
          "scroll=h=0.0015:v=0.0007,noise=alls=6:allf=t+u:all_seed=42,format=yuv420p[v]"
    $audio = "aevalsrc='0.25*sin(2*PI*330*t)+0.04*(random(0)-0.5)|0.25*sin(2*PI*440*t+3*sin(2*PI*0.5*t))+0.04*(random(1)-0.5)':s=48000"
    & $Ffmpeg -hide_banner -loglevel error -y `
        -f lavfi -i "gradients=s=1920x1080:r=60:n=5:speed=0.015:seed=11" `
        -f lavfi -i "perlin=s=640x360:r=60:octaves=3:persistence=0.6:xscale=3:yscale=3:tscale=0.5:random_mode=seed:seed=5" `
        -f lavfi -i "testsrc2=s=640x360:r=60" `
        -f lavfi -i "life=s=480x270:r=60:mold=10:ratio=0.08:life_color=#ffcc33:death_color=#102040:seed=7" `
        -f lavfi -i "sierpinski=s=640x360:r=60:type=carpet:seed=9" `
        -f lavfi -i $audio `
        -filter_complex $fc -map "[v]" -map 5:a -t $Seconds `
        -c:v libx264 -preset medium -crf 17 -g 120 -pix_fmt yuv420p `
        -c:a aac -b:a 192k -ac 2 -movflags +faststart $OutPath
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for $OutPath" }
}

foreach ($d in $Durations) {
    $out = Join-Path $BenchDir ("synth-{0}s-1080p60.mp4" -f $d)
    if ((Test-Path $out) -and -not $Force) { Write-Host "exists: $out"; continue }
    $t = Measure-Command { New-SynthClip -Seconds $d -OutPath $out }
    Write-Host ("{0}  {1:N0} bytes  ({2:N1} s)" -f $out, (Get-Item $out).Length, $t.TotalSeconds)
}
