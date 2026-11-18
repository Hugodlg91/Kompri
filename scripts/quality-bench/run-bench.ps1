<#
.SYNOPSIS
  Kompri target-size quality bench: standard vs Max quality, measured with VMAF/SSIM/PSNR.

.DESCRIPTION
  For every clip x codec x mode it runs src-tauri/examples/target_size_bench.rs (the app's
  real plan + 2-pass arguments + size check + single -10% retry), validates the output
  with ffprobe, then scores it against the source with libvmaf (VMAF v0.6.1 + psnr_y +
  float_ssim, luma) in a single frame-aligned pass:
    - distorted: setpts=PTS-STARTPTS, scaled back to the source resolution (bicubic) when
      the plan downscaled;
    - reference: the source; when the plan reduced the framerate, the REFERENCE goes through
      the same `fps=<target_fps>` filter the encoder used (same frame selection), never the
      distorted being upsampled.
  One JSON object per run is appended to <BenchDir>\results\results.jsonl and a Markdown
  table is printed at the end.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\quality-bench\run-bench.ps1 -BenchDir C:\tmp\bench `
      -Clips C:\tmp\bench\synth-60s-1080p60.mp4 -Codecs h264,h265
#>
param(
    [Parameter(Mandatory = $true)][string]$BenchDir,
    [Parameter(Mandatory = $true)][string[]]$Clips,
    [string[]]$Codecs = @("h264"),
    [string[]]$Modes = @("standard", "max"),
    [double]$TargetMb = 20.0,
    [string]$Tag = "current",
    [int]$VmafThreads = 16,
    [int]$VmafSubsample = 1,
    [string]$PlanOnlyTargets = "",
    [string]$RepoRoot = ""
)
$ErrorActionPreference = "Stop"
if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..\..")).Path
}
$ffmpeg = Join-Path $RepoRoot "src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe"
$ffprobe = Join-Path $RepoRoot "src-tauri\binaries\ffprobe-x86_64-pc-windows-msvc.exe"
$bench = Join-Path $RepoRoot "src-tauri\target\release\examples\target_size_bench.exe"
if (-not (Test-Path $bench)) {
    throw "Build the bench first: cd src-tauri; cargo build --release --example target_size_bench"
}
$resDir = Join-Path $BenchDir "results"
$outDir = Join-Path $BenchDir "out"
New-Item -ItemType Directory -Force $resDir, $outDir | Out-Null
$jsonl = Join-Path $resDir "results.jsonl"
$inv = [Globalization.CultureInfo]::InvariantCulture
# `powershell -File` passes "a,b" as ONE string: split list parameters ourselves.
$Clips = @($Clips | ForEach-Object { $_ -split "," } | Where-Object { $_ })
$Codecs = @($Codecs | ForEach-Object { $_ -split "," } | Where-Object { $_ })
$Modes = @($Modes | ForEach-Object { $_ -split "," } | Where-Object { $_ })
$planTargets = @($PlanOnlyTargets -split "," | Where-Object { $_ } | ForEach-Object { [double]::Parse($_.Trim(), $inv) })

# â”€â”€ Plan-only mode (no encode) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if ($planTargets.Count -gt 0) {
    foreach ($clip in $Clips) {
        foreach ($mb in $planTargets) {
            & $bench --input $clip --target-mb ($mb.ToString($inv)) --ffmpeg $ffmpeg --ffprobe $ffprobe --plan-only
        }
    }
    return
}

function Get-VideoProbe([string]$Path) {
    $j = & $ffprobe -v error -print_format json -show_format -show_streams $Path | Out-String | ConvertFrom-Json
    $v = $j.streams | Where-Object { $_.codec_type -eq "video" } | Select-Object -First 1
    $a = $j.streams | Where-Object { $_.codec_type -eq "audio" } | Select-Object -First 1
    [pscustomobject]@{
        vcodec = $v.codec_name; width = [int]$v.width; height = [int]$v.height
        fps = $v.avg_frame_rate; nb_frames = $v.nb_frames
        acodec = $(if ($a) { $a.codec_name } else { $null })
        duration = [double]$j.format.duration
    }
}

function Measure-Quality([string]$Dist, [string]$Ref, $Plan, $SrcProbe) {
    $logName = [IO.Path]::GetFileNameWithoutExtension($Dist) + ".vmaf.json"
    $d = "[0:v]setpts=PTS-STARTPTS"
    if ($Plan.downscaled) { $d += ",scale=$($SrcProbe.width):$($SrcProbe.height):flags=bicubic" }
    $d += ",format=yuv420p[d]"
    $r = "[1:v]"
    if ($Plan.fps_reduced) { $r += "fps=$($Plan.target_fps)," }
    $r += "setpts=PTS-STARTPTS,format=yuv420p[r]"
    $graph = "$d;$r;[d][r]libvmaf=log_fmt=json:log_path=${logName}:n_threads=${VmafThreads}:n_subsample=${VmafSubsample}:feature=name=psnr|name=float_ssim"
    Push-Location $resDir
    [IO.Directory]::SetCurrentDirectory($resDir)
    try {
        $err = & $ffmpeg -hide_banner -nostdin -v error -i $Dist -i $Ref -lavfi $graph -f null NUL 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) { throw "libvmaf failed: $err" }
    } finally { Pop-Location }
    $log = Get-Content (Join-Path $resDir $logName) -Raw | ConvertFrom-Json
    $frames = @($log.frames | ForEach-Object { [double]$_.metrics.vmaf } | Sort-Object)
    $p1 = $frames[[math]::Floor(($frames.Count - 1) * 0.01)]
    [pscustomobject]@{
        vmaf = [math]::Round([double]$log.pooled_metrics.vmaf.mean, 3)
        vmaf_hmean = [math]::Round([double]$log.pooled_metrics.vmaf.harmonic_mean, 3)
        vmaf_p1 = [math]::Round($p1, 3)
        ssim = [math]::Round([double]$log.pooled_metrics.float_ssim.mean, 5)
        psnr_y = [math]::Round([double]$log.pooled_metrics.psnr_y.mean, 3)
        frames_scored = $frames.Count
        decode_errors = $err.Trim()
    }
}

$rows = @()
foreach ($clip in $Clips) {
    $clipName = [IO.Path]::GetFileNameWithoutExtension($clip)
    $srcProbe = Get-VideoProbe $clip
    foreach ($codec in $Codecs) {
        foreach ($mode in $Modes) {
            $out = Join-Path $outDir ([string]::Format($inv, "{0}__{1}__{2}__{3}mb__{4}.mp4", $clipName, $codec, $mode, $TargetMb, $Tag))
            $benchArgs = @("--input", $clip, "--output", $out, "--target-mb", $TargetMb.ToString($inv), "--codec", $codec,
                           "--ffmpeg", $ffmpeg, "--ffprobe", $ffprobe)
            if ($mode -eq "max") { $benchArgs += "--max-quality" }
            Write-Host ">> $clipName / $codec / $mode / $TargetMb MB / $Tag"
            $raw = & $bench @benchArgs | Out-String
            $res = $raw | ConvertFrom-Json
            if (-not $res.ok) { Write-Warning "bench failed: $raw"; continue }
            $p = Get-VideoProbe $out
            $q = Measure-Quality -Dist $out -Ref $clip -Plan $res.plan -SrcProbe $srcProbe
            $vfIdx = [array]::IndexOf(@($res.pass2_args), "-vf")
            $row = [pscustomobject]@{
                tag = $Tag; clip = $clipName; codec = $codec; mode = $mode; target_mb = $TargetMb
                bytes = [int64]$res.final_bytes; under_target = ([int64]$res.final_bytes -lt [int64]($TargetMb * 1e6))
                retried = $res.retried; encode_s = $res.seconds
                vmaf = $q.vmaf; vmaf_hmean = $q.vmaf_hmean; vmaf_p1 = $q.vmaf_p1; ssim = $q.ssim; psnr_y = $q.psnr_y
                frames_scored = $q.frames_scored
                out_probe = $p; plan = $res.plan; attempts = $res.attempts
                vf = $(if ($vfIdx -ge 0) { $res.pass2_args[$vfIdx + 1] } else { "" })
                preset = $res.pass2_args[[array]::IndexOf($res.pass2_args, "-preset") + 1]
            }
            ($row | ConvertTo-Json -Compress -Depth 6) | Add-Content -Encoding utf8 $jsonl
            $rows += $row
            Write-Host ("   {0:N0} B  VMAF {1}  SSIM {2}  PSNR {3}  {4}s  {5}x{6}@{7} {8}/{9}" -f $row.bytes, $row.vmaf, $row.ssim, $row.psnr_y,
                $row.encode_s, $p.width, $p.height, $p.fps, $p.vcodec, $p.acodec)
        }
    }
}

"`n| clip | codec | mode | bytes | VMAF | VMAF 1% low | SSIM | PSNR-Y | encode s | -vf |"
"|---|---|---|---:|---:|---:|---:|---:|---:|---|"
foreach ($r in $rows) {
    [string]::Format($inv, "| {0} | {1} | {2} | {3:N0} | {4:N2} | {5:N2} | {6:N4} | {7:N2} | {8:N1} | ``{9}`` |", $r.clip, $r.codec, $r.mode, $r.bytes, $r.vmaf, $r.vmaf_p1, $r.ssim, $r.psnr_y, $r.encode_s, $r.vf)
}
