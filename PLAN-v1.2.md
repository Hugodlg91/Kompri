# MediaForge v1.2.0 — Plan d'implémentation (`feat/target-size-context-menu`)

> Branche : `feat/target-size-context-menu` (créée depuis le tag `v1.1.0`)  
> Cible : **v1.2.0**  
> Mode : Autonome & Multi-Agents avec vérifications systématiques après chaque étape.

---

## Architecture & Interfaces Partagées (Contrat inter-agents)

### 1. Paramètres globaux (`Settings` dans `lib.rs` et `AppSettings` dans `useSettings.ts`)
Ajout des tailles par défaut des presets « Taille cible » (modifiables dans Settings) et de l'état du menu contextuel :
- `preset_discord_mb: f64` (défaut : `10.0`)
- `preset_whatsapp_mb: f64` (défaut : `16.0`)
- `preset_gmail_mb: f64` (défaut : `25.0`)
- `context_menu_enabled: bool` (défaut : `false`)

### 2. Commandes Tauri — Fonctionnalité 1 (« Taille cible »)
- `get_media_info(input_path)` enrichi avec :
  - `fps: Option<f64>`
  - `audio_bitrate_kbps: Option<u32>`
  - `has_audio: bool`
- `estimate_target_size(input_path: String, target_mb: f64, codec: Option<String>) -> Result<TargetSizeEstimate, String>` :
  - Structure `TargetSizeEstimate` :
    - `already_under_target: bool`
    - `source_size_bytes: u64`
    - `target_bytes: u64`
    - `budget_bytes: u64`
    - `video_kbps: u32`
    - `audio_kbps: u32`
    - `target_width: u32`
    - `target_height: u32`
    - `target_fps: u32`
    - `downscaled: bool`
    - `fps_reduced: bool`
- `compress_video_to_size(input_path: String, output_path: String, target_mb: f64, codec: Option<String>, copy_if_under: bool) -> Result<String, String>` :
  - Si `already_under_target && copy_if_under`, copie directe sans réencodage.
  - Sinon encodage 2 passes (`-pass 1` puis `-pass 2`) avec journal de passe isolé dans un dossier temporaire nettoyé automatiquement.
  - Événement `"conversion_progress"` enrichi avec `pass: Option<u8>` et `total_passes: Option<u8>` (`1/2` puis `2/2`).
  - Vérification de la taille finale : si `taille > target_bytes`, 1 retry automatique avec `video_kbps` réduit de 10 % (`× 0.90`). Si toujours au-dessus, suppression du fichier et erreur explicite.
- `compress_video_batch_to_size(files: Vec<BatchMediaItem>, target_mb: f64, codec: Option<String>, copy_if_under: bool) -> Result<Vec<BatchResult>, String>` :
  - Support complet du mode lot (batch) avec événements `"batch_progress"` et `"conversion_progress"`.

### 3. Commandes Tauri & CLI — Fonctionnalité 2 (Menu contextuel Windows Explorer)
- Arguments CLI supportés :
  - `MediaForge.exe --action compress --preset <discord|whatsapp|gmail> "<fichier1>" ...`
  - `MediaForge.exe --action convert --to <mp4|mp3|jpg|png|webp> "<fichier1>" ...`
  - `MediaForge.exe --action open "<fichier1>" ...`
  - Option `--headless` / `--wait` pour exécution directe et tests automatisés.
- Single-instance (`tauri-plugin-single-instance`) : regroupe les sélections multiples envoyées par Windows Explorer dans une file d'attente unique.
- Commandes Tauri exposées au frontend :
  - `get_platform() -> String` (`"windows"`, `"macos"`, `"linux"`)
  - `get_context_menu_status() -> Result<bool, String>`
  - `set_context_menu_enabled(enabled: bool, language: String) -> Result<bool, String>`
  - `get_cli_state() -> Result<CliStartupState, String>` (indique si l'app est en mode mini-fenêtre de progression CLI ou si des fichiers ont été ouverts via « Ouvrir dans MediaForge… »)

---

## Découpage en Étapes Vérifiables

- [x] **Étape 1 — Exploration & création de la branche `feat/target-size-context-menu`**
  - Critère de fini : branche créée depuis `v1.1.0`, lecture complète de `DEVLOG.md` et du code existant.

- [x] **Étape 2 — Rédaction du plan `PLAN-v1.2.md`**
  - Critère de fini : `PLAN-v1.2.md` créé à la racine avec contrat d'interfaces et critères de validation.

- [x] **Étape 3 — Agent A (Rust Backend : Logique « Taille cible », encodage 2 passes, retry -10%, Settings & tests unitaires)**
  - Périmètre : `src-tauri/src/target_size.rs`, `src-tauri/src/lib.rs` (intégration commandes target_size + champs Settings).
  - Critère de fini : `cargo test` passe avec tests unitaires sur le calcul du budget (×0.95), débit audio/vidéo, réduction automatique de résolution (1080p → 720p → 480p) et de framerate (60 → 30 i/s).

- [x] **Étape 4 — Agent B (Rust Backend : Menu contextuel Windows HKCU, CLI, Single-Instance & NSIS hook)**
  - Périmètre : `src-tauri/Cargo.toml`, `src-tauri/src/context_menu.rs`, `src-tauri/src/cli.rs`, `src-tauri/nsis/hooks.nsh`, `src-tauri/tauri.conf.json`.
  - Critère de fini : installation/désinstallation propre dans `HKCU\Software\Classes\SystemFileAssociations`, support multi-fichiers via `tauri-plugin-single-instance`, suffixes sans écrasement (`_discord.mp4`, `_whatsapp.mp4`, `_converted.ext`), tests unitaires registre HKCU + CLI.

- [x] **Étape 5 — Agent C (Frontend React : UI Taille cible, progression Passe 1/2 & 2/2, mini-vue CLI, Settings & i18n 5 langues)**
  - Périmètre : `src/hooks/useConversion.ts`, `src/hooks/useSettings.ts`, `src/components/Converter/VideoConverter.tsx`, `src/components/Converter/ProgressBar.tsx`, `src/components/Settings/SettingsPage.tsx`, `src/App.tsx`, `src/locales/{fr,en,es,de,pt}.json`.
  - Critère de fini : `npx tsc --noEmit` et `npx vitest run` passent à 100 %.

- [ ] **Étape 6 — Tests réels d'intégration FFmpeg (Taille cible) & Registre/CLI Windows**
  - Création et exécution du script réutilisable `scripts/test-target-size.ps1` :
    - Génération de vidéos de test via FFmpeg (`testsrc2` + `sine`) : 10 s, 60 s et 5 min en 1080p60 et 4K.
    - Passage dans les presets (Discord 10 Mo, WhatsApp 16 Mo, Gmail 25 Mo) et vérification automatique que chaque fichier de sortie est **strictement sous la cible** et valide via `ffprobe`.
  - Test automatisé du registre HKCU (installation → vérification clés → désinstallation → vérification propreté HKCU) et de la CLI (`--action compress` / `--action convert` sur 1 et N fichiers).
  - Critère de fini : 100 % des vidéos générées sous la taille cible et lisibles, HKCU propre après désinstallation.

- [ ] **Étape 7 — Revue indépendante par un sous-agent relecteur (`code-reviewer`)**
  - Relecture complète du `git diff v1.1.0..HEAD` par un sous-agent indépendant n'ayant pas écrit le code (cas limites : vidéo très courte/longue, sans audio, déjà sous la cible, espaces/accents dans les chemins, chemin UNC/réseau, sécurité des arguments FFmpeg et registre).
  - Correction de tous les points soulevés et relance de la boucle de vérification (`tsc`, `vitest`, `cargo test`, `cargo clippy -- -D warnings`).
  - Critère de fini : 0 problème bloquant ou warning Clippy/TS.

- [ ] **Étape 8 — Documentation, bump `v1.2.0` & Build Tauri final**
  - Mise à jour de `DEVLOG.md`, `README.md`, `CHANGELOG.md`, `arbo.md`.
  - Passage de la version à `1.2.0` dans `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
  - Exécution d'un build Tauri Release complet (`tauri build`).
  - Critère de fini : tous les commits atomiques sont propres sur `feat/target-size-context-menu`, build Release réussi.
