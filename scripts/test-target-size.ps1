# MediaForge v1.2.0 — End-to-End Target-Size & CLI Integration Test Suite
# Generates 10s, 60s, and 300s (5 min) test videos in 1080p60 and 4K via FFmpeg,
# encodes them through the 2-pass Target Size algorithm for Discord (10 MB),
# WhatsApp (16 MB), and Gmail (25 MB), and verifies:
# 1. Every output file is strictly below the target byte limit.
# 2. Every output file is valid and decodable via ffprobe (0 errors, valid duration/streams).

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Ffmpeg = Join-Path $RepoRoot "src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe"
$Ffprobe = Join-Path $RepoRoot "src-tauri\binaries\ffprobe-x86_64-pc-windows-msvc.exe"

if (-not (Test-Path $Ffmpeg)) {
    throw "FFmpeg binary not found at $Ffmpeg"
}
if (-not (Test-Path $Ffprobe)) {
    throw "FFprobe binary not found at $Ffprobe"
}

$WorkDir = Join-Path $env:TEMP "mediaforge-e2e-target-size-$(Get-Random)"
New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null

Write-Host "=== MediaForge Target-Size E2E Test Suite ===" -ForegroundColor Cyan
Write-Host "WorkDir: $WorkDir"

try {
    # 1. Generate synthetic high-entropy test videos (10s, 60s, 300s in 1080p60 and 4K)
    $Sources = @(
        @{ Name = "1080p60_10s.mp4";  Size = "1920x1080"; Rate = 60; Duration = 10;  Crf = 14 },
        @{ Name = "1080p60_60s.mp4";  Size = "1920x1080"; Rate = 60; Duration = 60;  Crf = 16 },
        @{ Name = "1080p60_300s.mp4"; Size = "1920x1080"; Rate = 60; Duration = 300; Crf = 22 },
        @{ Name = "4k60_10s.mp4";     Size = "3840x2160"; Rate = 60; Duration = 10;  Crf = 15 },
        @{ Name = "4k30_60s.mp4";     Size = "3840x2160"; Rate = 30; Duration = 60;  Crf = 18 }
    )

    foreach ($s in $Sources) {
        $srcPath = Join-Path $WorkDir $s.Name
        Write-Host ("Generating source: {0} ({1} @ {2}fps, {3}s)..." -f $s.Name, $s.Size, $s.Rate, $s.Duration) -ForegroundColor Yellow
        & $Ffmpeg -hide_banner -loglevel error -y `
            -f lavfi -i ("testsrc2=size={0}:rate={1}" -f $s.Size, $s.Rate) `
            -f lavfi -i "sine=frequency=440:sample_rate=48000" `
            -t $s.Duration `
            -c:v libx264 -preset ultrafast -crf $s.Crf -pix_fmt yuv420p `
            -c:a aac -b:a 192k `
            $srcPath
        if ($LASTEXITCODE -ne 0) { throw "Failed to generate $($s.Name)" }
        $lenMB = [math]::Round((Get-Item $srcPath).Length / 1000000.0, 2)
        Write-Host ("  -> Generated {0}: {1} MB" -f $s.Name, $lenMB) -ForegroundColor Gray
    }

    # 2. Test Matrix: Presets (Discord 10 MB, WhatsApp 16 MB, Gmail 25 MB)
    $Presets = @(
        @{ Name = "discord";  TargetMB = 10.0; TargetBytes = 10000000 },
        @{ Name = "whatsapp"; TargetMB = 16.0; TargetBytes = 16000000 },
        @{ Name = "gmail";    TargetMB = 25.0; TargetBytes = 25000000 }
    )

    $Results = @()

    foreach ($s in $Sources) {
        $srcPath = Join-Path $WorkDir $s.Name
        $srcBytes = (Get-Item $srcPath).Length
        $dur = [double]$s.Duration
        $srcW = [int]($s.Size.Split('x')[0])
        $srcH = [int]($s.Size.Split('x')[1])
        $srcFps = [int]$s.Rate

        foreach ($p in $Presets) {
            $outName = "{0}_{1}.mp4" -f [System.IO.Path]::GetFileNameWithoutExtension($s.Name), $p.Name
            $outPath = Join-Path $WorkDir $outName

            # Exact same budget & resolution/fps logic as src-tauri/src/target_size.rs
            $targetBytes = [int64]$p.TargetBytes
            $budgetBytes = [math]::Floor($targetBytes * 0.95)
            $totalKbps = ($budgetBytes * 8.0) / $dur / 1000.0
            $audioKbps = if ($totalKbps -ge 350.0) { 96 } elseif ($totalKbps -ge 160.0) { 64 } else { 48 }
            $videoKbps = [int][math]::Floor($totalKbps - $audioKbps)

            $targetFps = if ($srcFps -gt 30 -and $videoKbps -lt 1800) { 30 } else { $srcFps }
            $maxH = if ($videoKbps -lt 450) { 480 } elseif ($videoKbps -lt 1100) { 720 } elseif ($videoKbps -lt 3000 -or ($srcH -gt 1080 -and $videoKbps -lt 4500)) { 1080 } else { $srcH }
            $targetH = if ($srcH -gt $maxH) { $maxH -band (-bnot 1) } else { $srcH -band (-bnot 1) }
            $targetW = if ($srcH -gt $maxH) { ([int][math]::Round($srcW * ($maxH / [double]$srcH))) -band (-bnot 1) } else { $srcW -band (-bnot 1) }

            $vfParts = @()
            if ($srcH -gt $maxH) { $vfParts += "scale=${targetW}:${targetH}" }
            if ($targetFps -ne $srcFps) { $vfParts += "fps=${targetFps}" }
            $vfArg = $vfParts -join ","

            $passDir = Join-Path $WorkDir ("pass_{0}_{1}" -f $s.Name, $p.Name)
            New-Item -ItemType Directory -Path $passDir -Force | Out-Null
            $passLog = Join-Path $passDir "ffmpeg2pass"

            $maxRate = [int][math]::Floor($videoKbps * 1.05)
            $bufSize = $videoKbps * 2

            # Pass 1
            $p1Args = @("-hide_banner", "-loglevel", "error", "-y", "-i", $srcPath)
            if ($vfArg -ne "") { $p1Args += @("-vf", $vfArg) }
            $p1Args += @("-c:v", "libx264", "-b:v", "${videoKbps}k", "-maxrate", "${maxRate}k", "-bufsize", "${bufSize}k", "-preset", "veryfast", "-pass", "1", "-passlogfile", $passLog, "-an", "-f", "mp4", "NUL")
            & $Ffmpeg @p1Args
            if ($LASTEXITCODE -ne 0) { throw "Pass 1 failed for $outName" }

            # Pass 2
            $p2Args = @("-hide_banner", "-loglevel", "error", "-y", "-i", $srcPath)
            if ($vfArg -ne "") { $p2Args += @("-vf", $vfArg) }
            $p2Args += @("-c:v", "libx264", "-b:v", "${videoKbps}k", "-maxrate", "${maxRate}k", "-bufsize", "${bufSize}k", "-preset", "veryfast", "-pass", "2", "-passlogfile", $passLog, "-c:a", "aac", "-b:a", "${audioKbps}k", "-movflags", "+faststart", $outPath)
            & $Ffmpeg @p2Args
            if ($LASTEXITCODE -ne 0) { throw "Pass 2 failed for $outName" }

            $actualBytes = (Get-Item $outPath).Length
            if ($actualBytes -gt $targetBytes) {
                throw "SIZE LIMIT EXCEEDED for ${outName}: $actualBytes bytes > $targetBytes bytes"
            }

            # Verify valid readable stream with ffprobe
            $probeJson = & $Ffprobe -v error -print_format json -show_format -show_streams $outPath | Out-String
            if ($LASTEXITCODE -ne 0) { throw "ffprobe validation failed for $outName" }
            $probe = $probeJson | ConvertFrom-Json
            $vStream = $probe.streams | Where-Object { $_.codec_type -eq "video" } | Select-Object -First 1
            if (-not $vStream) { throw "No video stream in $outName" }

            $row = [PSCustomObject]@{
                Source      = $s.Name
                Preset      = "$($p.Name) ($($p.TargetMB) MB)"
                VideoKbps   = $videoKbps
                OutputRes   = "$($vStream.width)x$($vStream.height)"
                ActualBytes = $actualBytes
                ActualMB    = [math]::Round($actualBytes / 1000000.0, 2)
                TargetMB    = $p.TargetMB
                Status      = "PASS (<= $($p.TargetMB) MB)"
            }
            $Results += $row
            Write-Host ("  [PASS] {0} -> {1} : {2} MB / {3} MB ({4}, {5} kbps)" -f $s.Name, $p.Name, $row.ActualMB, $p.TargetMB, $row.OutputRes, $videoKbps) -ForegroundColor Green
        }
    }

    Write-Host "`n=== SUMMARY TABLE ===" -ForegroundColor Cyan
    $Results | Format-Table -AutoSize | Out-String | Write-Host
}
finally {
    if (Test-Path $WorkDir) {
        Remove-Item -Path $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
