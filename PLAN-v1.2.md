# MediaForge v1.2.0 — Plan d'implémentation & Handoff (`feat/target-size-context-menu`)

> Branche : `feat/target-size-context-menu` (créée depuis le tag `v1.1.0`)  
> Cible : **v1.2.0**  
> Statut : **Pause propre — Étapes 1 à 6 TERMINÉES (57 tests Rust + 51 tests Vitest + 15/15 vidéos E2E FFmpeg OK). Prêt pour les correctifs finaux de l'Étape 7 et le packaging v1.2.0 (Étape 8).**

---

## Architecture & Interfaces Partagées (Implémentées)

### 1. Paramètres globaux (`Settings` dans `lib.rs` et `AppSettings` dans `useSettings.ts`)
- `preset_discord_mb: f64` (défaut : `10.0`)
- `preset_whatsapp_mb: f64` (défaut : `16.0`)
- `preset_gmail_mb: f64` (défaut : `25.0`)
- `context_menu_enabled: bool` (défaut : `false`)

### 2. Commandes Tauri — Fonctionnalité 1 (« Taille cible »)
- `get_media_info(input_path)` enrichi avec `fps`, `audio_bitrate_kbps`, `has_audio`.
- `estimate_target_size(input_path, target_mb, codec) -> Result<TargetSizeEstimate, String>`
- `compress_video_to_size(input_path, output_path, target_mb, codec, copy_if_under) -> Result<String, String>`
- `compress_video_batch_to_size(files, target_mb, codec, copy_if_under) -> Result<Vec<BatchResult>, String>`
- Événement `"conversion_progress"` enrichi avec `pass: Option<u8>` et `total_passes: Option<u8>` (`1/2` puis `2/2`).

### 3. Commandes Tauri & CLI — Fonctionnalité 2 (Menu contextuel Windows Explorer)
- Arguments CLI supportés :
  - `MediaForge.exe --action compress --preset <discord|whatsapp|gmail> "<fichier1>" ...`
  - `MediaForge.exe --action convert --to <mp4|mp3|jpg|png|webp> "<fichier1>" ...`
  - `MediaForge.exe --action open "<fichier1>" ...`
  - Option `--wait` / `--headless` pour exécution directe et tests automatisés.
- Single-instance (`tauri-plugin-single-instance`) intégré.
- Commandes Tauri : `get_platform`, `get_context_menu_status`, `set_context_menu_enabled`, `get_cli_state`.
- Hook NSIS de désinstallation dans `src-tauri/nsis/hooks.nsh`.

---

## État d'avancement des Étapes

- [x] **Étape 1 — Exploration & création de la branche `feat/target-size-context-menu`**
- [x] **Étape 2 — Rédaction du plan `PLAN-v1.2.md`**
- [x] **Étape 3 — Agent A (Rust Backend : Logique « Taille cible », encodage 2 passes, retry -10%, Settings & 12 tests unitaires dans `src-tauri/src/target_size.rs`)**
- [x] **Étape 4 — Agent B (Rust Backend : Menu contextuel Windows HKCU `src-tauri/src/context_menu.rs`, CLI `src-tauri/src/cli.rs`, Single-Instance & NSIS hook `src-tauri/nsis/hooks.nsh` + 14 tests unitaires)**
- [x] **Étape 5 — Agent C (Frontend React : UI Taille cible, progression Passe 1/2 & 2/2, mini-vue CLI, Settings, i18n 5 langues & 8 nouveaux tests Vitest dans `src/__tests__/targetSize.test.tsx`)**
- [x] **Étape 6 — Tests réels d'intégration FFmpeg (`scripts/test-target-size.ps1`) & Registre/CLI Windows**
  - **15/15 vidéos E2E validées** (10 s, 60 s et 5 min en 1080p60 et 4K sur Discord 10 Mo, WhatsApp 16 Mo et Gmail 25 Mo) :

| Source | Taille source | Preset | Débit vidéo | Résolution sortie | Taille finale | Statut |
|---|---|---|---|---|---|---|
| `1080p60_10s.mp4` | 55,06 Mo | Discord (10 Mo) | 7 504 kbps | `1920x1080` | **9,50 Mo** | PASS |
| `1080p60_10s.mp4` | 55,06 Mo | WhatsApp (16 Mo) | 12 064 kbps | `1920x1080` | **15,04 Mo** | PASS |
| `1080p60_10s.mp4` | 55,06 Mo | Gmail (25 Mo) | 18 904 kbps | `1920x1080` | **23,51 Mo** | PASS |
| `1080p60_60s.mp4` | 298,79 Mo | Discord (10 Mo) | 1 170 kbps | `1920x1080` | **9,54 Mo** | PASS |
| `1080p60_60s.mp4` | 298,79 Mo | WhatsApp (16 Mo) | 1 930 kbps | `1920x1080` | **14,79 Mo** | PASS |
| `1080p60_60s.mp4` | 298,79 Mo | Gmail (25 Mo) | 3 070 kbps | `1920x1080` | **23,85 Mo** | PASS |
| `1080p60_300s.mp4` | 1 106,96 Mo | Discord (10 Mo) | 189 kbps | `852x480` | **9,78 Mo** | PASS |
| `1080p60_300s.mp4` | 1 106,96 Mo | WhatsApp (16 Mo) | 309 kbps | `852x480` | **15,51 Mo** | PASS |
| `1080p60_300s.mp4` | 1 106,96 Mo | Gmail (25 Mo) | 537 kbps | `1280x720` | **24,06 Mo** | PASS |
| `4k60_10s.mp4` | 202,84 Mo | Discord (10 Mo) | 7 504 kbps | `3840x2160` | **9,52 Mo** | PASS |
| `4k60_10s.mp4` | 202,84 Mo | WhatsApp (16 Mo) | 12 064 kbps | `3840x2160` | **15,24 Mo** | PASS |
| `4k60_10s.mp4` | 202,84 Mo | Gmail (25 Mo) | 18 904 kbps | `3840x2160` | **23,80 Mo** | PASS |
| `4k30_60s.mp4` | 606,83 Mo | Discord (10 Mo) | 1 170 kbps | `1920x1080` | **9,54 Mo** | PASS |
| `4k30_60s.mp4` | 606,83 Mo | WhatsApp (16 Mo) | 1 930 kbps | `1920x1080` | **15,22 Mo** | PASS |
| `4k30_60s.mp4` | 606,83 Mo | Gmail (25 Mo) | 3 070 kbps | `1920x1080` | **23,79 Mo** | PASS |

---

## À terminer à la reprise (Étapes 7 & 8)

- [ ] **Étape 7 — Application des correctifs issus de la revue indépendante (`independent-code-reviewer`)** :
  *(Note : `src-tauri/src/target_size.rs` a déjà reçu les correctifs de la revue : `safe_media_path`, vidéos verticales via `short_side`, dimensions impaires, `-nostdin`, `-map 0:v:0 -sn -pix_fmt yuv420p` et `-n` en Passe 2).*
  Il reste à appliquer :
  1. **`src-tauri/src/context_menu.rs` & `src-tauri/src/cli.rs`** :
     - Ajouter `--` avant `"%1"` dans les commandes registre (`context_menu.rs`) et rejeter `%`, `\r`, `\n` dans `validate_exe_path`.
     - Ajouter `latest_job_status: Option<serde_json::Value>` dans `CliStartupState` (`cli.rs`) et restreindre `detect_media_section` aux formats supportés par la crate `image`.
  2. **`src-tauri/src/lib.rs`** :
     - Utiliser `target_size::safe_media_path` sur les chemins d'entrée/sortie FFmpeg et passer `"-i"` à `ffprobe` dans `get_media_info`.
     - Ignorer les flux `disposition.attached_pic == 1` dans `get_media_info` et retomber sur la durée du flux si `format["duration"]` vaut `0`.
     - Sécuriser `already_under_target && copy_if_under` : copie atomique (`create_new(true)`) si la source est déjà `.mp4`, sinon remux FFmpeg (`-c copy -sn -movflags +faststart -n`) avec repli sur l'encodage 2 passes.
     - Sérialiser les requêtes CLI multi-instances (`tauri_plugin_single_instance`) via un `tokio::sync::Mutex<()>` dans `CliRuntimeState` pour que la sélection multiple dans l'Explorateur Windows traite les N fichiers à la suite sans erreur `"busy"`, et stocker `latest_job_status` dans `CliRuntimeState`.
  3. **Frontend (`src/App.tsx`, `ConverterPage.tsx`, `VideoConverter.tsx`, `AudioConverter.tsx`, `ImageConverter.tsx`, `SettingsPage.tsx`, `useSettings.ts`, `ProgressBar.tsx`)** :
     - Propager `open_files` / `"cli-open-files"` depuis `App.tsx` → `ConverterPage.tsx` → `ImageConverter` / `VideoConverter` / `AudioConverter` pour que « Ouvrir dans MediaForge… » charge immédiatement le(s) fichier(s) dans le convertisseur.
     - Retirer le double `onClick` sur `<label htmlFor="context-menu-toggle">` dans `SettingsPage.tsx` et synchroniser la langue du menu contextuel dans `useSettings.ts`.
     - Désactiver le bouton Convertir dans `VideoConverter.tsx` si `estimateError` est présent.

- [ ] **Étape 8 — Documentation, bump `v1.2.0` & Build Tauri final** :
  - Mettre à jour `DEVLOG.md`, `README.md`, `CHANGELOG.md`, `arbo.md`.
  - Passer la version à `1.2.0` dans `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
  - Lancer `npx tsc --noEmit`, `npx vitest run`, `cargo test`, `cargo clippy -- -D warnings`, et `npm run tauri build`.
