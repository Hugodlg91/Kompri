# MediaForge — Journal de développement

## Règle absolue
Avant de commencer TOUTE tâche, lire ce fichier en entier.
Après TOUTE tâche, mettre ce fichier à jour immédiatement.

---

## Stack technique
- Framework : Tauri v2
- Frontend : React + TypeScript + Vite
- Styles : Tailwind CSS v4 (plugin @tailwindcss/vite, sans config externe)
- i18n : i18next + react-i18next (5 langues : fr, en, es, de, pt)
- Conversion vidéo/audio : FFmpeg (sidecar Tauri)
- Conversion images : crate Rust `image` 0.25 (PNG, JPG, WEBP, BMP, TIFF)
- Packaging : Tauri bundler (.msi, .dmg, .AppImage)

---

## Étapes de développement

### ✅ Étape 1 — Setup (TERMINÉE)
- Tauri v2 + React + TypeScript scaffoldé via create-tauri-app
- Tailwind CSS v4 configuré (plugin @tailwindcss/vite, pas de tailwind.config.js)
- i18next configuré avec auto-détection langue système (localStorage + navigator)
- 5 fichiers de traduction : fr.json, en.json, es.json, de.json, pt.json
- Structure : components/, locales/, hooks/, utils/
- Layout : Sidebar.tsx + routing Image/Vidéo/Audio/Historique/Paramètres
- Build propre, 0 erreur

### ✅ Étape 2 — Intégration FFmpeg sidecar (TERMINÉE)
- [x] Dépendances Rust : tauri-plugin-shell, tauri-plugin-dialog
- [x] Packages npm : @tauri-apps/plugin-shell, @tauri-apps/plugin-dialog
- [x] tauri.conf.json : externalBin (ffmpeg + ffprobe), productName "MediaForge", taille fenêtre 1000×680
- [x] capabilities/default.json : permissions shell + dialog ajoutées
- [x] Commandes Rust : convert_video, convert_audio, get_media_info, cancel_conversion
- [x] Événement Tauri : "conversion_progress" { percentage, current_time, speed }
- [x] Hook React : useConversion.ts (convertVideo, convertAudio, getMediaInfo, cancel, reset)
- [x] Utilitaires : utils/path.ts (buildOutputPath, formatFileSize, formatDuration)
- [x] Composants : VideoConverter.tsx, AudioConverter.tsx, ProgressBar.tsx
- [x] Clés i18n ajoutées dans les 5 fichiers locales (selectFile, advancedOptions, cancel, done, error, convert_another, sampleRate)
- [x] src-tauri/binaries/ créé avec README.md d'instructions
- [x] Placeholders ffmpeg/ffprobe pour cargo check
- [x] cargo check : 0 erreur — npm run build : 0 erreur

### ✅ Étape 3 — Conversion images (TERMINÉE)
- [x] Crate Rust `image` 0.25 (default-features=false, features=[png,jpeg,webp,bmp,tiff])
- [x] Formats supportés : PNG, JPG, WEBP, BMP, TIFF (AVIF écarté — dépendances système)
- [x] Commandes Rust : convert_image, convert_images_batch, get_image_info
- [x] Progression : événement Tauri "image_progress" { percentage, current_file }
- [x] Resize : Lanczos3, ratio conservable, préréglages (50%, 25%, 720p, 1080p)
- [x] Qualité : slider 0-100 (appliqué uniquement pour JPG et WEBP)
- [x] Hook React : useImageConversion.ts
- [x] Composant : ImageConverter.tsx (mode single + batch, aperçu convertFileSrc)
- [x] Section "image" ajoutée dans les 5 fichiers locales
- [x] cargo check : 0 erreur — npm run build : 0 erreur

### ✅ Étape 4 — Drag & drop natif + UX (TERMINÉE)
- [x] Commande Rust `open_folder` : ouvre le dossier parent via `tauri_plugin_opener::OpenerExt::open_path`
- [x] Hook `useDragDrop.ts` : `onDragDropEvent` de `@tauri-apps/api/window`, filtre extensions via ref mutable, expose `isDragging`, `droppedFiles`, `bind`, `reset`
- [x] Composant `src/components/ui/DropZone.tsx` : drag & drop + clic-pour-parcourir, prop `className` pour layout personnalisé, feedback visuel en survol
- [x] Composant `src/components/ui/ConversionResult.tsx` : bouton "Ouvrir dossier" (invoke open_folder) + bouton "Nouvelle conversion", animation fade-in
- [x] `ProgressBar.tsx` : prop `onCancel?` (bouton annuler intégré), prop `currentFile?` (affichage batch)
- [x] VideoConverter, AudioConverter, ImageConverter refactorisés : DropZone remplace les zones inline, ConversionResult remplace la section done
- [x] ImageConverter batch : DropZone avec `multiple=true`, bouton "Ouvrir dossier" sur le premier fichier converti
- [x] Clés i18n : `dropzone.*` (label, or, browse, fileLoaded) + `result.*` (success, openFolder, newConversion) dans les 5 locales
- [x] Animation CSS `@keyframes fade-in` + `.animate-fade-in` dans `index.css`
- [x] cargo check : 0 erreur — npm run build : 0 erreur (88 modules, 306 kB JS)

### ✅ Étape 5 — Mode batch vidéo & audio (TERMINÉE)
- [x] Commandes Rust : `convert_video_batch` + `convert_audio_batch` (traitement séquentiel)
- [x] Type Rust `BatchMediaItem` (input_path + output_path) distinct de `BatchImageItem`
- [x] Événement Tauri `"batch_progress"` : `{ index, total, current_file, percentage }`
- [x] Hook `useConversion.ts` : `convertVideoBatch`, `convertAudioBatch`, état batch (`results`, `batchIndex`, `batchTotal`, `currentFile`), `isBatchRef` pour isoler les events `conversion_progress` pendant un batch
- [x] `VideoConverter.tsx` : toggle Single / Batch, `MediaBatchFileList`, panneau options partagé, label progression `"Fichier X/Y — nom"`, vue done batch
- [x] `AudioConverter.tsx` : même pattern adapté pour audio
- [x] Clés i18n `batch.*` ajoutées dans les 5 locales (toggle, single, fileCount, progress, removeFile, results, successCount, errorCount)
- [x] Fix Rust : `result.as_deref() == Err("cancelled")` → `matches!(result, Err(ref e) if e == "cancelled")` (types incompatibles sinon)
- [x] cargo check : 0 erreur (1 warning dépréciation image::io::Reader, non bloquant) — npm run build : 0 erreur (88 modules, 315 kB JS)

### ✅ Étape 6 — Paramètres complets (TERMINÉE)
- [x] Dépendance Rust : `tauri-plugin-store = "2"` (v2.4.2)
- [x] Struct Rust `Settings` (language, theme, output_dir, default_video/audio/image_format) avec `Default` impl
- [x] Commandes Rust : `get_settings` (lit le store), `save_settings` (écrit + sauvegarde)
- [x] Plugin enregistré : `.plugin(tauri_plugin_store::Builder::default().build())`
- [x] Flash-prevention : script inline dans `index.html` lit `localStorage["mf-theme"]` et applique `.dark` avant le premier render React
- [x] Thème CSS : `html.dark { color-scheme: dark }` + `html:not(.dark) { override gray palette + color-scheme: light }` — tous les composants s'adaptent via les CSS variables Tailwind v4
- [x] Hook `useSettings.ts` : charge les settings au montage, expose `updateSettings` (merge + invoke + localStorage mirror), applique thème et langue immédiatement
- [x] Context `SettingsContext.tsx` + `useSettingsContext()` hook
- [x] `App.tsx` : `<SettingsProvider>` autour du layout + spinner de chargement pendant le chargement initial
- [x] `SettingsPage.tsx` : sections Apparence (thème + langue), Conversion (output_dir + formats par défaut), À propos (version via `getVersion()`)
- [x] Dossier de sortie : `open({ directory: true })` depuis `@tauri-apps/plugin-dialog` (JS-side), bouton Réinitialiser
- [x] `VideoConverter`, `AudioConverter`, `ImageConverter` : lisent `settings.default_*_format` comme état initial + passent `settings.output_dir` à `buildOutputPath`
- [x] Clés i18n `settings.*` remplacées dans les 5 locales (themeDark, themeLight, outputDir, outputDirDefault, chooseFolder, reset, defaultFormats, defaultVideo/Audio/Image, about, version, localOnly)
- [x] cargo check : 0 erreur — npm run build : 0 erreur (91 modules, 322 kB JS)

### ✅ Étape 7 — Historique des conversions (TERMINÉE)
- [x] Struct Rust `HistoryItem` (id, file_name, media_type, source_format, target_format, output_path, timestamp, status, file_size)
- [x] Commandes Rust : `get_history` (tri décroissant timestamp), `add_history_item` (max 50 items, nouveaux en tête), `clear_history` (reset store), `open_file` (ouvre fichier avec app OS via `opener`)
- [x] Store Rust : `history.json` (distinct de `settings.json`) — même plugin `tauri-plugin-store`
- [x] Hook `useHistory.ts` : charge, vide, et rafraîchit l'historique via `invoke`
- [x] `useConversion.ts` : enregistre un item après succès de `convertVideo`, `convertAudio`, `convertVideoBatch`, `convertAudioBatch` (fire-and-forget via `recordHistory`)
- [x] `useImageConversion.ts` : enregistre un item après succès de `convertImage` et `convertImagesBatch`
- [x] Composant `History.tsx` : liste avec icône média (🎬/🎵/🖼️), nom tronqué, format source→cible, date relative (Aujourd'hui/Hier/date), boutons hover (↗ ouvrir fichier + 📂 ouvrir dossier)
- [x] Bouton "Vider" : double-tap de confirmation (tourne rouge 3s avant de vider)
- [x] `HistoryPage.tsx` : wrap minimal de `<History />`
- [x] Clés i18n `history.*` mises à jour dans les 5 locales (title, empty, clear, clearConfirm, openFile, openFolder, mediaType.*, dateFormat.*)
- [x] cargo check : 0 erreur — npm run build : 0 erreur TypeScript (93 modules, 96 kB JS)

### ✅ Étape 8 — Tests automatisés, Hardening & QA (TERMINÉE)
- [x] **Rust — Tests unitaires** : module `#[cfg(test)]` dans `lib.rs`, 11 tests couvrant :
  - `time_str_to_secs` : formats valides, mixtes, et invalides
  - `parse_duration_line` : ligne FFmpeg trouvée / absente
  - `format_secs` : 0s, minutes, heures
  - `HistoryItem` serde round-trip + champ `file_size` null
  - `Settings::default()` : valeurs par défaut correctes
- [x] **Rust — Anti-zombie** : `impl Drop for AppState` — tue automatiquement le processus FFmpeg enfant lorsque Tauri libère l'état managé à la fermeture de l'application
- [x] **Vitest** : ajout devDependencies (`vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`)
- [x] Script `"test": "vitest run"` dans `package.json`
- [x] Configuration Vitest dans `vite.config.ts` : `environment: "jsdom"`, `globals: true`, `setupFiles: ["./src/setupTests.ts"]`
- [x] `src/setupTests.ts` : import `@testing-library/jest-dom`
- [x] **Tests frontend** `src/__tests__/path.test.ts` : 16 tests couvrant `buildOutputPath` (slash/backslash, destFolder, multi-dots), `formatFileSize` (B/KB/MB/GB), `formatDuration` (0s/minutes/heures)
- [x] **Tests frontend** `src/__tests__/useDragDrop.test.ts` : 7 tests sur le prédicat de filtrage par extension (liste vide, insensible à la casse, extensions multiples, fichiers sans extension, chemins Windows)
- [x] **GlobalErrorBoundary** : `src/components/GlobalErrorBoundary.tsx` — classe React qui intercepte les erreurs de rendu et affiche une UI propre avec bouton "Relancer l'application"
- [x] `src/main.tsx` : `<GlobalErrorBoundary>` encapsule `<App />`
- [x] Clés i18n `errorBoundary.*` (title, description, reload, report) dans les 5 locales
- [x] `cargo test` : **11/11 tests Rust passent** — `npm test` : **23/23 tests TypeScript passent** — `npm run build` : **0 erreur** (94 modules, 330 kB JS)

### ✅ Étape 9 — Packaging final (TERMINÉE)
- [x] Configuration `tauri.conf.json` : `version: "1.0.0"`, `copyright`, `category`, `description`
- [x] Configuration des bundles cibles : `windows: { nsis: { installMode: "currentUser" } }`, `macOS` (dmg), `linux` (appimage, deb)
- [x] Icônes de l'application générées : `npm run tauri icon resource/app-icon.png` (a remplacé les placeholders par les vrais formats `.ico`, `.icns`, `.png`)
- [x] Vérification de la configuration : `cargo check` (0 erreur), `npm run build` (0 erreur)
- [x] **Installeurs générés avec succès** :
  - **NSIS (Recommandé)** : `src-tauri/target/release/bundle/nsis/MediaForge_1.0.0_x64-setup.exe`
  - **MSI** : `src-tauri/target/release/bundle/msi/MediaForge_1.0.0_x64_en-US.msi`

> **Instructions pour l'utilisateur concernant FFmpeg** : 
> L'installeur actuel contient les *stubs vides* pour FFmpeg (car ce sont les fichiers présents dans `src-tauri/binaries/`). Pour avoir un installeur 100% fonctionnel, veuillez remplacer ces stubs par les vrais exécutables `ffmpeg-x86_64-pc-windows-msvc.exe` et relancer la commande de build.

### ✅ Étape 10 — Audit & nettoyage du repo git (TERMINÉE)
- [x] **Audit `git ls-files`** : liste complète des fichiers trackés examinée
- [x] **Fichier supprimé du tracking** : `rustup-init.exe` (binaire setup ~30 Mo, n'a jamais sa place dans l'historique git)
- [x] **Fichiers correctement exclus** (déjà absents du tracking) :
  - `src-tauri/target/` — Rust build artifacts
  - `node_modules/` — dépendances npm
  - `src-tauri/binaries/ffmpeg-*.exe` — sidecar FFmpeg (seul `README.md` conservé ✅)
  - `dist/` — build frontend Vite
- [x] **`.gitignore` complété** avec les catégories manquantes :
  - `src-tauri/target/` et `src-tauri/WixTools/`
  - `dist/`, `build/`, `out/`
  - `.env`, `.env.local`, `.env.*.local`
  - `Thumbs.db`, `desktop.ini` (Windows)
  - `*.key`, `*.pem` (ne jamais commiter les clés de signature)
  - `build.log`, `final-build.log`
  - `*.swp`, `*.swo`, `*.user` (IDE supplémentaires)
- [x] **Commit de nettoyage** : `bf764a7` — "chore: cleanup gitignore and remove unnecessary tracked files"
- [x] **Push sur `origin/main`** : `7846c2b..bf764a7`
- [x] **Vérification finale** :
  - `git status` → `nothing to commit, working tree clean` ✅
  - `git ls-files *.exe` → vide ✅
  - `git ls-files *.log` → vide ✅
  - `src-tauri/binaries/README.md` toujours présent ✅


### ✅ Étape 10b — Suppression des fichiers scaffold inutiles (TERMINÉE)
- [x] **Vérification des références** : `tauri.svg` et `react.svg` non référencés dans le code ; `vite.svg` uniquement utilisé comme favicon dans `index.html` → favicon remplacé par `src-tauri/icons/icon.png`
- [x] **Fichiers désindexés** (`git rm --cached`) :
  - `scripts/ui-refactor.mjs` + `ui-refactor2.mjs` + `ui-refactor3.mjs` + `ui-refactor4.mjs` (scripts ponctuels déjà appliqués)
  - `public/tauri.svg`, `public/vite.svg` (assets scaffold Tauri/Vite)
  - `src/assets/react.svg` (asset scaffold React)
- [x] **`.gitignore` mis à jour** : entrées ajoutées pour `scripts/`, `public/tauri.svg`, `public/vite.svg`, `src/assets/react.svg`
- [x] **`index.html`** : favicon mis à jour de `vite.svg` → `src-tauri/icons/icon.png`
- [x] **Commit `9af2e4d`** poussé sur `origin/main` : `abb8f35..9af2e4d`
- [x] **Vérification** : fichiers toujours présents en local ✅ — absents du tracking git ✅ — `git status` propre ✅
- [x] `arbo.md` créé à la racine — arborescence complète du projet versionnée

### ✅ README.md — Documentation professionnelle (TERMINÉE)
- [x] Remplacement du template scaffold `create-tauri-app` par une documentation complète en anglais
- [x] En-tête avec badges (version, plateforme, Tauri)
- [x] Description : ce que fait l'app + argument privacy (100% local, no upload, no account)
- [x] Fonctionnalités détaillées : Image / Vidéo / Audio / Général
- [x] Tableau stack technique (Tauri v2, React, TypeScript, Vite, Tailwind, FFmpeg, image crate, plugin-store, Vitest)
- [x] Section développeur : prérequis, `npm install`, `npm run tauri dev`, `npm test`, `npm run tauri build`
- [x] Tableau installeurs par plateforme (Windows NSIS + MSI, macOS dmg, Linux AppImage + deb)
- [x] Lien vers `arbo.md` pour la structure du projet
- [x] Licence propriétaire (© 2026 MediaForge)
- [x] Commit `27998ae` poussé sur `origin/main`

### ✅ LICENSE — Licence MIT (TERMINÉE)
- [x] Fichier `LICENSE` créé à la racine du projet
- [x] Licence : **MIT License** (Copyright 2026 MediaForge)
- [x] Remplacement de la licence propriétaire initiale par la licence MIT standard
- [x] Commit poussé sur `origin/main`

### ✅ Mise à jour licence → MIT + Commons Clause (TERMINÉE)
- [x] `LICENSE` : ajout de la clause Commons Clause — interdit la revente commerciale par des tiers tout en conservant la liberté d'usage personnel et de contribution
- [x] `README.md` : section licence mise à jour → "MIT + Commons Clause — © 2026 VladimirWRLD / Free to use and contribute — commercial resale prohibited."

### ✅ Étape 11 — Migration data-theme & refonte UI complète (TERMINÉE)
- [x] **Migration thème** : `applyTheme()` dans `useSettings.ts` → `setAttribute("data-theme", theme)` (replaces `classList.add("dark")`)
- [x] **Script anti-flash** : `index.html` set `data-theme` sur `<html>` avant le premier render React
- [x] **Tokens CSS sémantiques** : `index.css` ajoute `[data-theme="dark/light"]` avec `--bg`, `--surface`, `--surface2`, `--border`, `--text`, `--muted`, `--accent`, `--accent-dim`. Tailwind v4 tokens maintenus en synchronisation.
- [x] **TitleBar** : nouveau composant — 38px, 3 cercles macOS, "MEDIAFORGE" centré (Syne 700), pill thème (LIGHT/DARK), pill langue (dropdown inline FR/EN/ES/DE/PT)
- [x] **App.tsx** : `<TitleBar>` ajouté au-dessus du layout sidebar+main
- [x] **Sidebar** : 64px, "M" Syne 800 `--accent`, 5 nav items 44×44px, barre verticale active 3×20px
- [x] **DropZone** : icône "+" 48×48px, texte + "parcourir" souligné `--accent`, prop `formats` ajoutée
- [x] **History** : cards individuelles — point statut, badge type, nom, formats, date relative, actions
- [x] **SettingsPage** : 3 section cards, composant `PillSelect` pour tous les selects, max-width 520px
- [x] **Converters (Image/Vidéo/Audio)** : headers Syne 22px + sous-titre muted, 0 emoji, icônes IMG/VID/AUD
- [x] `npx tsc --noEmit` : **0 erreur TypeScript** — `npm run build` : **0 erreur** (95 modules, 339 kB JS)

### ✅ Étape 12 — Refonte visuelle complète (UI Refactor) (TERMINÉE)
- [x] **Système de design** : tokens CSS sémantiques enrichis — `--surface3`, `--border2`, `--text-sub`, `--shadow-sm` ajoutés ; vert succès `#10B981` (`--success`) ; hiérarchie typographique 9/10/11/12/13/14/24px
- [x] **SVG Icons** : nouveau composant `src/components/ui/Icons.tsx` — IcnImage, IcnVideo, IcnAudio, IcnHistory, IcnSettings, IcnUpload, IcnCheck, IcnX, IcnChevronDown, IcnChevronRight, IcnFolder, IcnRefresh (stroke-based, 24×24 viewBox, props size/color/strokeWidth)
- [x] **Sidebar** : icônes SVG au-dessus du label abrégé (3 lettres) ; boutons 52px full-width ; état actif = `--accent-dim` bg + barre verticale 3×24px à gauche ; hover identique sans la barre
- [x] **DropZone** : `IcnUpload` dans une boîte 56×56px `--accent-dim` ; bordure 2px dashed `--border2` → `--accent` au hover/drag ; bg `--surface2` → `--accent-dim`
- [x] **ConversionResult** : card success avec `rgba(16,185,129,0.06)` bg + `IcnCheck` vert dans cercle ; `.btn-ghost` ouvrir dossier + `.btn-primary` nouvelle conversion
- [x] **ProgressBar** : wrapper `.card` ; barre dégradée `--accent → --accent-hover` ; `.btn-ghost` annuler
- [x] **VideoConverter / AudioConverter** : `.seg-ctrl` mode toggle ; batch list avec `IcnCheck`/`IcnX`/`IcnFolder` ; `.btn-primary`/`.btn-ghost` ; `.card`/`.fmt-pill` options ; `IcnChevronRight` animé pour advanced toggle
- [x] **History** : grid `auto 1fr auto auto` ; badge type 32×32px avec IcnImage/Video/Audio coloré ; `IcnCheck` vert inline ; `.btn-ghost` actions ; `box-shadow: var(--shadow-sm)`
- [x] **SettingsPage** : `PillSelect` avec `IcnChevronDown` SVG (rotation 180° à l'ouverture) ; `ThemeToggle` via `.seg-ctrl` ; `SectionCard` avec `--shadow-sm` ; `IcnFolder` + `IcnX` dans output dir ; `IcnCheck` dans badge "100% local"
- [x] **Classes utilitaires** : `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.seg-ctrl`, `.card`, `.fmt-pill`, `.section-label` définies dans `index.css`, utilisées partout
- [x] **Police offline** : stack système `ui-sans-serif, system-ui, -apple-system, sans-serif` (suppression Google Fonts CDN, respect contrainte 100% offline)
- [x] `npm run build` : **0 erreur TypeScript** (96 modules, 343 kB JS)

### ✅ Étape 13 — CI/CD GitHub Actions (Release multi-plateforme) (TERMINÉE)
- [x] `.github/workflows/release.yml` créé — déclenché sur push de tag `v*`
- [x] **Matrix strategy** : 3 runners en parallèle — `windows-latest`, `macos-latest`, `ubuntu-22.04`
- [x] **Setup** : Node.js 20, Rust stable, Swatinem/rust-cache (cache Cargo par plateforme)
- [x] **FFmpeg Windows** : téléchargement depuis gyan.dev (ffmpeg-release-essentials.zip), extraction PowerShell, renommage au format Tauri (`ffmpeg-x86_64-pc-windows-msvc.exe`)
- [x] **FFmpeg macOS** : `brew install ffmpeg`, copie + chmod vers `ffmpeg-aarch64-apple-darwin` (compatible ARM et Intel via `which ffmpeg`)
- [x] **FFmpeg Linux** : build statique John Van Sickle (ffmpeg-release-amd64-static.tar.xz), renommage vers `ffmpeg-x86_64-unknown-linux-gnu`, chmod +x
- [x] **Dépendances Linux** : libgtk-3-dev, libwebkit2gtk-4.1-dev, libappindicator3-dev, librsvg2-dev, patchelf, libxdo-dev, libssl-dev
- [x] **tauri-apps/tauri-action@v0** : build + création release draft automatique, `args: --target aarch64-apple-darwin` pour macOS
- [x] **Release** : draft (relecture avant publication), corps incluant tableau téléchargements + lien CHANGELOG
- [x] **Permissions** : `contents: write` au niveau workflow (requis pour créer la release GitHub)
- [x] **CHANGELOG.md** créé à la racine avec le contenu v1.0.0
- [x] **FUNDING.yml** : `.github/FUNDING.yml` créé — bouton "Sponsor" Ko-fi (`VladimirWRLD`) affiché sur le repo GitHub

### ✅ Étape 14 — Refonte UI Liquid Glass & Améliorations fonctionnelles (TERMINÉE)
- [x] **Architecture Multi-Agents** : orchestration de 3 sous-agents spécialisés en parallèle (`liquid-glass-shell`, `backend-history-settings`, `converters-ux`) sur des périmètres de fichiers isolés
- [x] **Design System Liquid Glass (`src/index.css`)** :
  - Surfaces translucides réfractives (`--surface`, `--surface2`, `--surface3`, `--popover-bg`, `--glass-blur: blur(24px) saturate(180%)`) et bordures spéculaires (`--glass-highlight`, `--glass-edge`) en mode sombre (*Liquid Obsidian*) et clair (*Iridescent Pearl*)
  - Arrière-plan ambiant animé (`.ambient-canvas`, `.ambient-orb-1..3` avec `@keyframes float-orb`)
  - Refonte des classes `.card`, `.glass-card`, `.glass-panel`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.seg-ctrl`, `.fmt-pill` et ajout de `.glass-input`, `.glass-select`, `.glass-badge`
  - **Fix stacking context des menus déroulants (`SettingsPage.tsx`, `TitleBar.tsx`, `index.css`)** : rendu des menus `PillSelect` via `createPortal(..., document.body)` en `position: fixed; z-index: 9999` avec calcul dynamique `getBoundingClientRect()` et fond `--popover-bg` haute lisibilité pour éviter le masquage par les cartes `backdrop-filter` suivantes
- [x] **Shell & Iconographie (`App.tsx`, `TitleBar.tsx`, `Sidebar.tsx`, `Icons.tsx`, `tauri.conf.json`, `capabilities/default.json`)** :
  - Ajout de 8 icônes SVG (`IcnSun`, `IcnMoon`, `IcnSearch`, `IcnTrash`, `IcnExternalLink`, `IcnSparkles`, `IcnSliders`, `IcnFile`)
  - Raccourcis clavier globaux `Ctrl+1..5` / `Cmd+1..5` pour naviguer instantanément entre Image, Vidéo, Audio, Historique et Paramètres
  - **Fenêtre sans bordure OS native (`decorations: false`)** dans `tauri.conf.json` + permissions Tauri v2 (`core:window:allow-close`, `allow-minimize`, `allow-toggle-maximize`, `allow-maximize`, `allow-unmaximize`, `allow-is-maximized`, `allow-start-dragging`) dans `capabilities/default.json`
  - **Contrôles de fenêtre interactifs dans `TitleBar.tsx`** : 3 boutons fonctionnels (Fermer `#ff5f57`, Réduire `#febc2e`, Agrandir `#28c840`) via `getCurrentWindow()` avec micro-glyphes SVG (`×`, `−`, `+`) au survol, double-clic sur la barre pour agrandir/restaurer, et sélecteur de thème SVG (`IcnSun` / `IcnMoon`)
- [x] **Backend Rust & Historique enrichi (`lib.rs`, `useHistory.ts`, `History.tsx`)** :
  - Nouvelle commande Tauri `remove_history_item` pour supprimer une entrée individuelle de `history.json`
  - Calcul automatique de `file_size` via `std::fs::metadata` + `format_byte_size` lors de l'enregistrement dans `add_history_item`
  - Barre de recherche instantanée (nom de fichier / format) et filtres par type de média (*Tous / Image / Vidéo / Audio*) avec compteurs dans `History.tsx`
  - Suppression du warning de dépréciation Rust (`image::io::Reader` → `image::ImageReader`)
- [x] **Convertisseurs & UX (`ImageConverter.tsx`, `VideoConverter.tsx`, `AudioConverter.tsx`, `DropZone.tsx`, `ConversionResult.tsx`, `ProgressBar.tsx`)** :
  - **Fix bug `open_folder`** : correction du paramètre `{ file_path: ... }` (snake_case requis par `#[tauri::command(rename_all = "snake_case")]`) dans `ConversionResult.tsx`, `ImageConverter.tsx`, `VideoConverter.tsx` et `AudioConverter.tsx`
  - Bouton **"Ouvrir le fichier"** (`open_file`) ajouté directement dans `ConversionResult.tsx` et sur les lignes de résultats Batch
  - Aperçu du nom de fichier de sortie (`→ fichier_converted.ext`) avant conversion et métadonnées en capsules `.glass-badge`
  - Barre d'outils Batch avec compteur de fichiers et bouton **"Vider"** pour réinitialiser la file en un clic
- [x] **Traductions i18n (5 langues)** : ajout des clés `converter.localOnly`, `converter.outputPreview`, `history.searchPlaceholder`, `history.filterAll`, `history.deleteItem`, `history.noResults`, `result.openFile`, `window.close/minimize/maximize/restore` dans `fr.json`, `en.json`, `es.json`, `de.json`, `pt.json`
- [x] **Architecture Responsive complète (`index.css`, `App.tsx`, `Sidebar.tsx`, `TitleBar.tsx`, `tauri.conf.json`, Convertisseurs, `History.tsx`, `SettingsPage.tsx`)** :
  - Abaissement des dimensions minimales de fenêtre dans `tauri.conf.json` (`minWidth: 400`, `minHeight: 480`) pour autoriser le split-screen et les formats compacts
  - Transformation automatique de la `Sidebar` en **Bottom Navigation Dock Liquid Glass** sous `640px` (`@media (max-width: 640px)` avec `.app-body { flex-direction: column-reverse }`)
  - Conteneur centré fluide `.page-container` (`max-width: 920px`, `padding: clamp(14px, 2.8vw, 28px)`) et grilles auto-adaptatives `.responsive-grid-3` / `.responsive-grid-2` / `.history-row-grid`
  - Ajout de la suite de tests automatisés `src/__tests__/responsive.test.tsx`
- [x] **Tests & Build** : `cargo test` **32/32 tests passent (0 warning)** — `vitest` **43/43 tests passent** (6 fichiers de tests incluant `titlebar.test.tsx` et `responsive.test.tsx`) — `tsc --noEmit` & `tauri build` **0 erreur**
- [x] **Release `v1.1.0`** : bump de version vers `1.1.0` (`tauri.conf.json`, `Cargo.toml`, `package.json`, `README.md`, `CHANGELOG.md`) et push du tag `v1.1.0` pour déclencher la publication GitHub Actions multi-plateforme (Windows / macOS / Linux)

### ✅ Étape 16 — v1.2.0 : Compression vidéo « Taille cible » (2 passes) & Menu contextuel Windows Explorer (TERMINÉE)
- [x] **Branche & Planification** : branche `feat/target-size-context-menu` créée depuis `v1.1.0`, spécification complète et contrat d'interfaces dans `PLAN-v1.2.md`.
- [x] **Fonctionnalité 1 — Compression vidéo « Taille cible » (`src-tauri/src/target_size.rs`, `src-tauri/src/lib.rs`, `VideoConverter.tsx`)** :
  - Mode dédié **Taille cible** dans le convertisseur vidéo (Single & Batch) avec 4 préréglages en 1 clic : **Discord (10 Mo)**, **WhatsApp (16 Mo)**, **Gmail (25 Mo)** et **Personnalisé (Mo)** (valeurs par défaut configurables dans `SettingsPage.tsx`).
  - **Formule exacte avec budget de sécurité conteneur (95 %)** : $\text{target\_bytes} = \text{target\_mb} \times 1\,000\,000 \times 0.95$, $\text{total\_kbps} = (\text{target\_bytes} \times 8) / (\text{duration} \times 1000)$, $\text{video\_kbps} = \text{total\_kbps} - \text{audio\_kbps}$ (avec audio adaptatif AAC `128k` / `96k` / `64k`, ou `0k` si la source n'a pas de piste audio).
  - **Encodage FFmpeg en 2 passes réelles (`libx264` H.264 / `libx265` H.265)** :
    - Passe 1 (analyse) vers `NUL` (Windows) / `/dev/null` (Unix) avec `-passlogfile` isolé dans un dossier temporaire unique par job (`std::env::temp_dir().join("mediaforge_pass_<id>")`) nettoyé automatiquement via `PassLogGuard` (`Drop`).
    - Passe 2 (encodage final) avec `-movflags +faststart`, `-map 0:v:0 -sn -pix_fmt yuv420p` et progression temps réel enrichie (`pass: 1/2` puis `pass: 2/2`).
  - **Downscaling automatique intelligent (résolution + FPS)** selon le débit vidéo disponible (`< 1500 kbps` → max 1080p30, `< 800 kbps` → max 720p30, `< 400 kbps` → max 480p30, `< 200 kbps` → max 360p24, `< 100 kbps` → refus explicite avec message d'erreur clair) et badge d'aperçu temps réel avant conversion (`estimate_target_size`).
  - **Filet de sécurité -10 % & Copie directe** : si le fichier généré dépasse malgré tout `target_mb * 1_000_000` octets, relance automatique d'une Passe 2 avec `video_kbps * 0.90` ; si le fichier source est déjà sous la cible (`copy_if_under`), copie atomique (si `.mp4`) ou remux sans perte (`-c copy -sn -movflags +faststart`).
- [x] **Fonctionnalité 2 — Menu contextuel Windows Explorer & Mode CLI (`src-tauri/src/context_menu.rs`, `src-tauri/src/cli.rs`, `src-tauri/nsis/hooks.nsh`)** :
  - Menu en cascade **« MediaForge »** inscrit dans `HKCU\Software\Classes\SystemFileAssociations\<ext>\shell\MediaForge` (**aucun droit Administrateur / UAC requis**) pour les extensions vidéo (`.mp4`, `.mov`, `.mkv`, `.avi`, `.webm`), image (`.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`, `.tiff`) et audio (`.mp3`, `.wav`, `.flac`, `.ogg`, `.aac`, `.m4a`).
  - Sous-commandes contextuelles traduites selon la langue active : *Compresser pour Discord (10 Mo)*, *WhatsApp (16 Mo)*, *Gmail (25 Mo)*, *Convertir en MP4 / MP3 / JPG / PNG / WEBP*, et *Ouvrir dans MediaForge…*.
  - **Mode CLI & Mini-fenêtre (`420×220`)** : support de `--action compress|convert|open`, `--preset`, `--to`, `--wait`/`--headless` ; redimensionnement et centrage automatiques en mini-fenêtre Liquid Glass avec fermeture automatique après succès.
  - **Single-Instance & Multi-sélection Windows Explorer** : intégration de `tauri-plugin-single-instance` avec file d'attente sérialisée (`tokio::sync::Mutex<()>`) permettant de traiter séquentiellement $N$ fichiers sélectionnés simultanément dans l'Explorateur Windows.
  - **Désinstallation propre NSIS** : hook `NSIS_HOOK_POSTUNINSTALL` dans `src-tauri/nsis/hooks.nsh` supprimant toutes les clés `HKCU\Software\Classes\SystemFileAssociations\...\shell\MediaForge`.
- [x] **Décisions techniques autonomes prises durant l'Étape 16** :
  1. **1 Mo décimal (`1 000 000` octets) + marge de sécurité `0.95`** : garantit qu'un preset de `10 Mo` vise `9,50 Mo` utiles et ne dépasse jamais la limite stricte des serveurs Discord/WhatsApp/Gmail après encapsulation MP4/moov.
  2. **Downscaling basé sur le côté court (`short_side = width.min(height)`)** : préserve les vidéos verticales (`9:16`, ex. `1080×1920`) sans les écraser à tort comme des vidéos 4K paysage, et arrondit systématiquement les dimensions à l'entier pair inférieur requis par `libx264`/`libx265`.
  3. **Registre `HKCU\Software\Classes\SystemFileAssociations`** : fonctionne immédiatement sans élévation UAC quelle que soit l'application par défaut associée à l'extension sur Windows.
  4. **Séparateur `--` avant `"%1"` dans les commandes registre & `safe_media_path`** : protège le parseur CLI et FFmpeg/FFprobe contre les noms de fichiers commençant par un tiret (`-video.mp4` → `./-video.mp4`).
  5. **File d'attente `tokio::sync::Mutex<()>` sur `single-instance`** : lorsque Windows Explorer lance une instance par fichier sélectionné, les instances secondaires transfèrent leurs arguments à l'instance principale qui les exécute l'une après l'autre sans erreur `"Another conversion is already in progress"`.
- [x] **Campagne de tests E2E FFmpeg réels (`scripts/test-target-size.ps1` — 15/15 PASS)** :
  - 5 vidéos maîtresses générées et compressées sur les 3 presets (**Discord 10 Mo**, **WhatsApp 16 Mo**, **Gmail 25 Mo**) :
    - `1080p60_10s.mp4` (55,06 Mo) → **9,50 Mo** / **15,04 Mo** / **23,51 Mo** (`1920x1080`) ✅
    - `1080p60_60s.mp4` (298,79 Mo) → **9,54 Mo** / **14,79 Mo** / **23,85 Mo** (`1920x1080`) ✅
    - `1080p60_300s.mp4` (1 106,96 Mo) → **9,78 Mo** (`852x480`) / **15,51 Mo** (`852x480`) / **24,06 Mo** (`1280x720`) ✅
    - `4k60_10s.mp4` (202,84 Mo) → **9,52 Mo** / **15,24 Mo** / **23,80 Mo** (`3840x2160`) ✅
    - `4k30_60s.mp4` (606,83 Mo) → **9,54 Mo** / **15,22 Mo** / **23,79 Mo** (`1920x1080`) ✅
- [x] **Revue de code indépendante (`independent-code-reviewer`) & Correctifs appliqués** :
  - Durcissement de `validate_exe_path` (rejet de `%`, `\r`, `\n`), ajout de `--` dans les commandes registre, filtrage de `disposition.attached_pic == 1` dans `get_media_info`, copie atomique `create_new(true)` ou remux `-c copy` si déjà sous la taille cible, propagation complète de `open_files` / `"cli-open-files"` vers les 3 convertisseurs, et synchronisation de la langue du menu contextuel dans `useSettings.ts`.
- [x] **Limitation connue Windows 11 documentée** : le menu contextuel moderne de premier niveau de Windows 11 exigeant une identité de package MSIX signée par un certificat EV payant (`IExplorerCommand`), le menu en cascade **MediaForge** apparaît dans le menu classique (**`Shift + F10`** ou **« Afficher plus d'options »**) sur Windows 11, et directement au premier niveau sur Windows 10.
- [x] **Validation finale v1.2.0** : **57 tests unitaires Rust** + **51 tests Vitest** + **15/15 tests E2E FFmpeg** passent avec 0 warning Clippy et 0 erreur TypeScript.

### ✅ Étape 17 — v1.2.1 : Correctifs, FFmpeg statique macOS, Licences tierces, Sécurité & Finition (TERMINÉE)
- [x] **Branche & Planification** : branche `fix/v1.2.1-polish` créée depuis `v1.2.0`, plan détaillé dans `docs/PLAN-v1.2.1.md` et déplacement de `PLAN-v1.2.md` vers `docs/PLAN-v1.2.md`.
- [x] **Correctif 1 — FFmpeg statique sur macOS (`release.yml` & `src-tauri/binaries/README.md`)** :
  - Remplacement de `brew install ffmpeg` (qui liait dynamiquement à `/opt/homebrew`) par le téléchargement figé par version (`b6.1.1` depuis `eugeneware/ffmpeg-static` / `osxexperts`) des binaires statiques `ffmpeg-darwin-arm64.gz` et `ffprobe-darwin-arm64.gz` avec vérification d'intégrité **SHA-256** (`shasum -a 256 -c`).
  - Ajout d'une étape CI `otool -L` sur macOS qui échoue immédiatement si `/opt/homebrew` ou `/usr/local` est référencé.
  - Ajout d'un **smoke test multi-OS** (Windows, macOS, Linux) exécutant `ffmpeg -version`, `ffprobe -version`, puis générant et validant une vidéo `testsrc2` + `sine` de 1 s avec les binaires embarqués.
- [x] **Correctif 2 — Licences tierces de FFmpeg (`THIRD_PARTY_NOTICES.md`, `licenses/FFmpeg-GPLv3.txt`, `SettingsPage.tsx`)** :
  - Documentation complète des licences FFmpeg/FFprobe (**GPL v3.0** du fait de `--enable-gpl --enable-version3 --enable-libx264 --enable-libx265`) avec versions, sources des builds binaires et liens vers le code source amont pour Windows (`gyan.dev`), macOS (`eugeneware/ffmpeg-static` / `osxexperts`) et Linux (`johnvansickle.com`).
  - Embarquement de `THIRD_PARTY_NOTICES.md` et `licenses/*` dans `bundle.resources` (`tauri.conf.json`).
  - Ajout du panneau « Licences tierces » dans la section **À propos** de `SettingsPage.tsx` (commande Tauri `get_third_party_notices` + fallback embarqué), traduit dans les 5 langues (`fr`, `en`, `es`, `de`, `pt`).
  - Conservation intacte du fichier `LICENSE` (MIT + Commons Clause).
- [x] **Correctif 3 — Renommage des métadonnées (`mediaforge` / `mediaforge_lib`), `mainBinaryName` & Migration du menu clic droit** :
  - `package.json` → `"name": "mediaforge"` ; `Cargo.toml` → `name = "mediaforge"`, `lib.name = "mediaforge_lib"`, `authors = ["VladimirWRLD"]`, description en anglais ; `main.rs` → `mediaforge_lib::run()`.
  - `tauri.conf.json` → ajout de `"mainBinaryName": "MediaForge"` (conserve le nom de l'exécutable `MediaForge.exe`), `"identifier": "com.mediaforge.app"` inchangé, copyright `VladimirWRLD` et descriptions en anglais.
  - **Migration automatique au démarrage (`sync_context_menu_on_startup`)** : si le menu contextuel est activé dans `settings.json` ou déjà présent dans `HKCU`, réécrit automatiquement les clés `HKCU\Software\Classes\SystemFileAssociations\...\shell\MediaForge` avec le chemin de l'exécutable courant (`std::env::current_exe()`), garantissant une mise à jour transparente depuis la `1.2.0` (`tauri-app.exe` → `MediaForge.exe`). Couvert par le test unitaire `test_upgrade_migration_from_v120_to_v121_updates_exe_path`.
- [x] **Correctif 4 — Durcissement Sécurité (`capabilities/default.json`, CSP `tauri.conf.json`, test `-y.mp4`)** :
  - Retrait de `shell:allow-execute`, `shell:allow-kill` et `shell:allow-stdin-write` de `capabilities/default.json` et suppression de `@tauri-apps/plugin-shell` de `package.json` (le sidecar FFmpeg étant invoqué exclusivement côté Rust).
  - Remplacement de `"csp": null` par une politique CSP Tauri v2 stricte (`default-src 'self'`, `asset:`/`ipc:` localhost, `object-src 'none'`, `base-uri 'self'`).
  - Ajout des tests unitaires `test_dash_y_filename_after_double_dash_is_not_parsed_as_flag` (`cli.rs`) et `test_dash_y_filename_cannot_inject_ffmpeg_option` (`target_size.rs`) prouvant qu'un fichier nommé `"-y.mp4"` ne peut jamais être interprété comme une option CLI ou FFmpeg.
- [x] **Correctif 5 — Fins de ligne (`.gitattributes`)** :
  - Création de `.gitattributes` (`* text=auto eol=lf` + exceptions binaires) et renormalisation complète du dépôt dans un commit atomique dédié (`4f5b933`).
- [x] **Correctif 6 — CI & Releases (`.github/workflows/ci.yml` & `release.yml`)** :
  - Diagnostic de la release `v1.1.0` : lors du re-taggage initial, le tag `v1.1.0` avait brièvement pointé sur un commit où `tauri.conf.json` était en `1.2.0`, provoquant l'ajout d'assets `1.2.0` avant que le run suivant n'ajoute les assets `1.1.0`. Ajout d'une étape de vérification stricte `v$(tauri.conf.json.version) == GITHUB_REF_NAME` en tête de `release.yml`.
  - Création de `.github/workflows/ci.yml` (push & PR sur Windows et Ubuntu : `tsc --noEmit`, `vitest run`, `cargo test`, `cargo clippy -- -D warnings`).
- [x] **Correctif 7 — Documentation & Rangement (`README.md`, `CHANGELOG.md`, `docs/`)** :
  - Création de `docs/SCREENSHOTS_CHECKLIST.md`, ajout du badge CI, de la section `Third-Party Licenses` et mise à jour du tableau `Production Build` en `1.2.1` dans `README.md` et `CHANGELOG.md`.
- [x] **Correctif 8 — Nouvelle icône MediaForge, Démo animée du README (`scripts/record-demo/`, `docs/assets/mediaforge-demo.gif` & `.mp4`) & Smoke test des encodeurs FFmpeg** :
  - Mise à jour de l'icône de l'application (`resource/app-icon.svg`, `resource/app-icon.png`, `src-tauri/icons/*`) et du logo SVG dans `Sidebar.tsx`.
  - Intégration du harness Playwright + Vite (`scripts/record-demo/`) avec le script `"record-demo": "node scripts/record-demo/record.mjs"` et `playwright` (`^1.63.0`) en `devDependencies`, exclusion de `scripts/` dans `tsconfig.json` et `vite.config.ts` (`test.exclude`), exécution de `npm run record-demo` et intégration de `docs/assets/mediaforge-demo.gif` sous le titre de `README.md`.
  - Enrichissement du smoke test CI multi-OS dans `.github/workflows/release.yml` pour vérifier la présence effective dans `ffmpeg -encoders` des 10 encodeurs vidéo et audio utilisés par MediaForge (`libx264`, `libx265`, `libvpx-vp9`, `mpeg4`, `aac`, `libmp3lame`, `flac`, `libvorbis`, `libopus`, `pcm_s16le`).
- [x] **Validation finale v1.2.1** : **63/63 tests unitaires Rust** + **55/55 tests Vitest** passent avec **0 warning Clippy** et **0 erreur TypeScript**.

---

## Décisions techniques prises
- Tailwind v4 : pas de fichier tailwind.config.js, tout passe par le plugin Vite
- FFmpeg : sidecar Tauri, binaires nommés avec le triple Rust (ex: ffmpeg-x86_64-pc-windows-msvc.exe)
- Progression FFmpeg : `-progress pipe:1 -nostats` → parsing stdout key=value → événement Tauri
- Annulation : `Arc<Mutex<Option<CommandChild>>>` dans AppState, kill() propre
- Output path : fichier source + suffixe `_converted` + nouvelle extension (utils/path.ts)
- Police : Inter via stack système (offline, pas de Google Fonts CDN)
- Couleur principale : indigo (#6366f1), dark mode par défaut
- Tout fonctionne 100% hors ligne, aucune télémétrie
- Images : crate `image` 0.25 sans AVIF (évite dépendances système dav1d/NASM). AVIF à ajouter si nécessaire via `avif-encoder` feature (encoding only, pure Rust ravif)
- `img.dimensions()` nécessite `use image::GenericImageView` — utiliser `img.width()` / `img.height()` à la place
- `tauri::async_runtime::spawn_blocking` pour les opérations image (CPU-bound)
- Drag & drop : `onDragDropEvent` de `@tauri-apps/api/window` (Tauri v2). Un seul listener global par fenêtre, filtre par extension via `useRef` (évite les stale closures sans recréer le listener)
- `DropZone` : prop `className` pour surcharger le layout interne (ImageConverter utilise `flex gap-5 p-5` au lieu du centrage par défaut)
- `open_folder` : commande Rust côté backend → pas de permission frontend requise au-delà de `core:default`
- Batch vidéo/audio : `isBatchRef` dans `useConversion` filtre les events `conversion_progress` émis par `run_ffmpeg` pendant un batch (évite d'écraser la progression globale)
- Annulation batch : `run_ffmpeg` retourne `Err("cancelled")`, détecté via `matches!(result, Err(ref e) if e == "cancelled")`, propagé avec `return Err("cancelled")` pour stopper la boucle proprement
- Output paths batch : calculés côté client avec `buildOutputPath(p, outputFormat)` avant d'envoyer la commande Rust
- Historique : stocké dans `history.json` (séparé de `settings.json`) via le même plugin `tauri-plugin-store`. Clé unique `"items"` → tableau JSON de `HistoryItem`.
- Historique : insertion en tête + troncature à 50 côté Rust (atomic read-modify-write via `store.get` / `store.set` / `store.save`)
- `open_file` vs `open_folder` : même plugin opener, chemin direct vs `path.parent()` — deux commandes distinctes pour éviter la confusion côté UI
- `TFunction` de `i18next` utilisé comme type du prop `t` dans `HistoryRow` pour éviter l'incompatibilité avec `$Dictionary` de i18next
- Anti-zombie : `impl Drop for AppState` plutôt qu'un handler `on_window_event` — les handlers Tauri v2 ne permettent pas d'accéder à `AppState` sans erreurs de durée de vie (E0597), alors que `Drop` est appelé automatiquement au teardown et a accès direct aux champs
- `GlobalErrorBoundary` : composant classe React (seul moyen d'implémenter `getDerivedStateFromError` + `componentDidCatch`), avec styles inline pour résister à un échec de chargement du bundle CSS
- Tests `useDragDrop` : la logique de filtrage par extension est une fonction pure extraite du hook — testable sans simuler l'API Tauri

---

## Problèmes rencontrés et solutions

### Étape 2
- **`tauri::Manager` vs `tauri::Emitter`** : En Tauri v2, `app.emit()` nécessite `use tauri::Emitter` (pas `Manager`). Utiliser `Manager` causait E0599 "method not found". **Fix** : remplacer l'import.
- **InvokeArgs TypeScript** : `invoke<T>(cmd, params)` attend `Record<string, unknown>` mais nos interfaces typées ne le satisfont pas. **Fix** : cast `params as unknown as Record<string, unknown>`.
- **Placeholders binaires** : `cargo check` échoue si les fichiers `externalBin` n'existent pas. **Fix** : créer des fichiers vides au bon nom dans `src-tauri/binaries/`. Les remplacer par les vrais binaires FFmpeg avant de builder l'app.
- **FFmpeg non installé sur la machine de dev (Windows)** : l'app ne peut pas être testée sans les vrais binaires. Source recommandée : https://www.gyan.dev/ffmpeg/builds/ (Windows).

### Étape 3
- **`img.dimensions()` introuvable** : méthode du trait `GenericImageView` non importé. **Fix** : utiliser `img.width()` et `img.height()` (méthodes directes de `DynamicImage`).
- **AVIF écarté** : la feature `avif` de la crate `image` tire `libdav1d` qui nécessite NASM sur Windows. Contournement : utiliser uniquement PNG/JPG/WEBP/BMP/TIFF. AVIF peut être ajouté plus tard via `avif-encoder` (pure Rust, encoding uniquement).

### Étape 10
- **`missing required key inputPath`** : Les commandes Tauri v2 attendent les arguments en `camelCase` par défaut (ex: `inputPath`), mais notre typage JS passait les objets en `snake_case` (`input_path`). **Fix** : Ajout de l'attribut `#[tauri::command(rename_all = "snake_case")]` sur l'ensemble des commandes Rust dans `lib.rs`.
- **Nouveau Build** : L'installeur a été régénéré avec succès pour inclure la refonte graphique (palette violette #7c6aff, typographies DM Mono / Syne, etc).
