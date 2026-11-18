# Third-Party Notices

Kompri (formerly MediaForge) itself is distributed under the terms of [`LICENSE`](LICENSE) (MIT License + Commons Clause).

Kompri also bundles standalone third-party executables (**FFmpeg** and **FFprobe**) executed as external sidecar child processes via Tauri's shell sidecar mechanism. Those bundled binaries are independent works governed by their respective open-source licenses described below.

---

## FFmpeg & FFprobe

- **Project**: [FFmpeg](https://ffmpeg.org) (`ffmpeg` & `ffprobe`)
- **License**: **GNU General Public License v3.0 (GPLv3)** (full text: [`licenses/FFmpeg-GPLv3.txt`](licenses/FFmpeg-GPLv3.txt))

### Why GPLv3 Applies to the Bundled FFmpeg/FFprobe Binaries

Although parts of upstream FFmpeg are available under LGPLv2.1+, the prebuilt standalone FFmpeg/FFprobe binaries bundled in Kompri releases are compiled with `--enable-gpl --enable-version3` and incorporate GPL-licensed components and encoders such as `libx264` and `libx265`. Under the terms of FFmpeg's build configuration, distributing binaries built with `--enable-gpl --enable-version3` places those FFmpeg/FFprobe binaries under the **GNU General Public License v3.0 (GPLv3)**.

### Bundled Builds by Platform

| Platform (`Target Triple`) | FFmpeg Version | Build Provider | Build / Download URL | Corresponding Source Code URL | Applicable License |
|---|---|---|---|---|---|
| **Windows** (`x86_64-pc-windows-msvc`) | `8.0.1-essentials_build-www.gyan.dev` | gyan.dev | https://www.gyan.dev/ffmpeg/builds/ | https://github.com/FFmpeg/FFmpeg & https://www.gyan.dev/ffmpeg/builds/#source | GPLv3 |
| **macOS** (`aarch64-apple-darwin`) | `6.1.1` (release `b6.1.1`) | `eugeneware/ffmpeg-static` / `osxexperts.net` | https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1 | https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz | GPLv3 / LGPLv2.1+ |
| **Linux** (`x86_64-unknown-linux-gnu`) | Release amd64 static | John Van Sickle | https://johnvansickle.com/ffmpeg/ | https://johnvansickle.com/ffmpeg/source/ & https://github.com/FFmpeg/FFmpeg | GPLv3 |

### License Text & Corresponding Source

- The complete license text governing the bundled FFmpeg and FFprobe binaries is included in this repository and packaged alongside the application at [`licenses/FFmpeg-GPLv3.txt`](licenses/FFmpeg-GPLv3.txt).
- Corresponding source code archives and build scripts for each platform binary are hosted at the upstream source URLs listed in the table above.
- Because Kompri invokes `ffmpeg` and `ffprobe` strictly as separate standalone sidecar binaries via CLI arguments, users may also replace those binaries in accordance with [`src-tauri/binaries/README.md`](src-tauri/binaries/README.md).
