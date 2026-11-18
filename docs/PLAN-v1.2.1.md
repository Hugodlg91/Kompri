# MediaForge v1.2.1 — Plan de Correctifs & Finition (`fix/v1.2.1-polish`)

> Branche : `fix/v1.2.1-polish` (créée depuis le tag `v1.2.0`)  
> Cible : **v1.2.1** (Correctifs, sécurité, licences tierces, CI/CD, métadonnées & documentation — aucune nouvelle fonctionnalité)  
> Mode : Autonome & Multi-Agents avec boucle de vérification (`tsc`, `vitest`, `cargo test`, `cargo clippy -- -D warnings`) et commits atomiques à chaque étape.

---

## Étapes du Plan (`v1.2.1`)

- [x] **Étape 1 (Correctif 5) — Normalisation des fins de ligne (`.gitattributes` + `git add --renormalize .`)**
  - Création de `.gitattributes` à la racine (`* text=auto eol=lf` + exceptions binaires : `.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`, `.tiff`, `.tif`, `.ico`, `.icns`, `.exe`, `.dll`, `.woff`, `.woff2`).
  - Exécution de `git add --renormalize .` dans un **commit dédié isolé**, sans aucun autre changement, pour éliminer définitivement les problèmes CRLF.
  - **Critère de fini** : commit atomique `chore(git): add .gitattributes and normalize line endings to LF` créé, `git status` propre.

- [x] **Étape 2 (Correctif 1 & 6) — FFmpeg statique sur macOS (`release.yml`), Smoke Tests multi-OS & Workflow `ci.yml`**
  - **macOS (`aarch64-apple-darwin`)** : remplacement de `brew install ffmpeg` (lié dynamiquement à `/opt/homebrew`) par le téléchargement figé par version (`b6.1.1`) et vérifié par **checksum SHA-256** des binaires statiques `ffmpeg-darwin-arm64.gz` et `ffprobe-darwin-arm64.gz` (`eugeneware/ffmpeg-static` / `osxexperts`), extraction vers `src-tauri/binaries/ffmpeg-aarch64-apple-darwin` et `ffprobe-aarch64-apple-darwin`, et suppression de quarantaine.
  - **Vérification `otool -L` sur macOS** : étape CI dédiée vérifiant que `otool -L` sur les deux binaires ne contient aucune référence à `/opt/homebrew` ni `/usr/local` (échec immédiat du job sinon).
  - **Smoke test sur les 3 OS (Windows, macOS, Linux)** dans `release.yml` :
    1. Exécution de `ffmpeg -version` et `ffprobe -version` sur les binaires embarqués.
    2. Test de conversion réelle : génération d'une vidéo test de 1 s avec `-f lavfi -i testsrc2=size=320x240:rate=30 -f lavfi -i sine=frequency=440 -t 1` via le binaire `ffmpeg` embarqué et validation du fichier produit via le binaire `ffprobe` embarqué.
  - **Vérification cohérence tag/version** dans `release.yml` (évite le mélange d'assets observé sur la release `v1.1.0` lorsque le tag et `tauri.conf.json` différaient temporairement).
  - **Mise à jour de `src-tauri/binaries/README.md`** avec la nouvelle procédure statique macOS et la vérification `otool -L`.
  - **Nouveau workflow `.github/workflows/ci.yml`** déclenché sur `push` et `pull_request` (`windows-latest` et `ubuntu-22.04`) exécutant `npx tsc --noEmit`, `npx vitest run`, `cargo test` et `cargo clippy -- -D warnings` (avec création des placeholders binaires FFmpeg pour `cargo test`/`clippy`).
  - **Critère de fini** : `.github/workflows/release.yml`, `.github/workflows/ci.yml` et `src-tauri/binaries/README.md` validés.

- [x] **Étape 3 (Correctif 2) — Licences tierces de FFmpeg (`THIRD_PARTY_NOTICES.md` + `licenses/` + UI Settings/About)**
  - Création de `THIRD_PARTY_NOTICES.md` à la racine et de `licenses/FFmpeg-GPLv3.txt` (texte de la licence GPLv3 / LGPLv2.1 applicable aux builds FFmpeg embarqués avec `libx264`/`libx265`) détaillant pour chaque plateforme (Windows `gyan.dev`, macOS `eugeneware/ffmpeg-static` / `osxexperts`, Linux `johnvansickle`) la licence exacte (**GPL v3** en raison de `--enable-gpl --enable-libx264 --enable-libx265`), la version embarquée, la source officielle et le lien vers le code source correspondant.
  - Embarquement de `THIRD_PARTY_NOTICES.md` et `licenses/` dans les ressources du bundle Tauri (`bundle.resources` dans `src-tauri/tauri.conf.json`).
  - Ajout d'un bouton/modale ou vue « Licences tierces » (`settings.thirdPartyLicenses`) dans la section **À propos** de `SettingsPage.tsx`, traduit dans les 5 langues (`fr`, `en`, `es`, `de`, `pt`), permettant de consulter les notices FFmpeg directement dans l'application (ou d'ouvrir le fichier/lien).
  - Conservation intacte du fichier `LICENSE` du projet (MIT + Commons Clause).
  - **Critère de fini** : `THIRD_PARTY_NOTICES.md` et `licenses/` créés, embarqués dans `tauri.conf.json`, affichés dans `SettingsPage.tsx` en 5 langues, tests unitaires passants.

- [x] **Étape 4 (Correctif 3) — Renommage des métadonnées (`mediaforge` / `mediaforge_lib`), `mainBinaryName` & migration automatique du menu clic droit**
  - `package.json` : `"name": "mediaforge"`.
  - `src-tauri/Cargo.toml` : `name = "mediaforge"`, `[lib] name = "mediaforge_lib"`, `authors = ["VladimirWRLD"]`, `description = "MediaForge — Local, fast, and private media converter"`.
  - `src-tauri/src/main.rs` : `mediaforge_lib::run()`.
  - `src-tauri/tauri.conf.json` :
    - Ajout de `"mainBinaryName": "MediaForge"` à la racine pour garantir le nom de l'exécutable.
    - `"identifier": "com.mediaforge.app"` conservé **strictement intact**.
    - `"copyright": "Copyright © 2026 VladimirWRLD"`, `"shortDescription": "Local, fast, and private media converter."`, `"longDescription": "MediaForge is a desktop utility to convert and compress images, videos, and audio files 100% offline."`.
  - **Migration automatique au démarrage (`src-tauri/src/lib.rs` + `src-tauri/src/context_menu.rs`)** :
    - Au lancement de l'application (dans `.setup(...)`), si l'intégration au menu clic droit est activée dans `settings.json` (`context_menu_enabled == true`) OU si les clés `HKCU\Software\Classes\SystemFileAssociations\...\shell\MediaForge` existent déjà (ex: ancien chemin `tauri-app.exe` d'une installation `v1.2.0`), réécrire automatiquement les clés HKCU avec le chemin actuel de `std::env::current_exe()` et la langue active !
    - Ajout d'un test unitaire dans `context_menu.rs` simulant le scénario « installé en `1.2.0` avec `C:\OldPath\tauri-app.exe` → migration en `1.2.1` vers `C:\NewPath\MediaForge.exe` » et vérifiant que toutes les commandes du registre pointent vers le nouvel exécutable.
  - **Critère de fini** : `cargo test`, `cargo clippy -- -D warnings`, `tsc --noEmit` et `vitest run` passent à 100 % avec le nouveau crate `mediaforge_lib` et le test de migration `1.2.0 -> 1.2.1`.

- [x] **Étape 5 (Correctif 4) — Durcissement Sécurité (Suppression permissions `shell` front, CSP stricte, protection `--` CLI/FFmpeg)**
  - **Retrait des permissions `shell` côté frontend** :
    - Vérification qu'aucun fichier dans `src/` n'importe `@tauri-apps/plugin-shell`.
    - Suppression de `"shell:allow-execute"`, `"shell:allow-kill"`, `"shell:allow-stdin-write"` dans `src-tauri/capabilities/default.json`.
    - Suppression de `"@tauri-apps/plugin-shell"` dans `package.json` (tout en conservant `tauri-plugin-shell` côté Rust dans `Cargo.toml` pour le sidecar FFmpeg).
  - **CSP stricte dans `src-tauri/tauri.conf.json`** :
    - Remplacement de `"csp": null` par :
      `"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost https://asset.localhost blob: data:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost https://ipc.localhost; media-src 'self' asset: http://asset.localhost https://asset.localhost blob: data:; object-src 'none'; base-uri 'self'"`
      (Note : `'unsafe-inline'` sur `script-src` autorise le script anti-flash de `index.html`, `'unsafe-inline'` sur `style-src` autorise les styles inline React/Tailwind, et `asset: http://asset.localhost` autorise `convertFileSrc` pour l'aperçu d'images dans Tauri v2).
  - **Protection contre l'injection d'options FFmpeg (`-y.mp4`)** :
    - Vérification que `context_menu.rs` passe toujours `-- "%1"` et que `safe_media_path` préfixe tout chemin relatif commençant par `-` par `.\` (Windows) ou `./` (Unix).
    - Ajout d'un test unitaire explicite avec un fichier nommé `"-y.mp4"` (tant dans `cli.rs`, `context_menu.rs` que `target_size.rs`) prouvant qu'il n'est jamais interprété comme l'option `-y` par le parseur CLI ni par FFmpeg/FFprobe.
  - **Critère de fini** : `capabilities/default.json` et `tauri.conf.json` durcis, test `"-y.mp4"` passant dans `cargo test`.

- [x] **Étape 6 (Correctif 7 & Finale) — Rangemement `docs/`, mise à jour `README.md`, `CHANGELOG.md`, `DEVLOG.md`, bump `1.2.1`**
  - Déplacement de `PLAN-v1.2.md` vers `docs/PLAN-v1.2.md` (`git mv PLAN-v1.2.md docs/PLAN-v1.2.md`).
  - Création de `docs/SCREENSHOTS_CHECKLIST.md` listant précisément les captures et le GIF de démo (`docs/assets/demo.gif`) à réaliser.
  - Mise à jour de `README.md` :
    - Ajout du badge CI (`ci.yml`), de l'emplacement `docs/assets/demo.gif` et de la section `Screenshots`.
    - Mise à jour du tableau « Production Build » avec les noms de fichiers `1.2.1` (`MediaForge_1.2.1_x64-setup.exe`, etc.).
    - Ajout de la section « Third-Party Licenses » pointant vers `THIRD_PARTY_NOTICES.md`.
  - Mise à jour de `CHANGELOG.md` (section `## [1.2.1]`), `DEVLOG.md` et `arbo.md`.
  - Passage de la version à **`1.2.1`** dans `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json`.
  - **Critère de fini** : tous les fichiers de doc et de version sont en `1.2.1`.

- [ ] **Étape 7 — Revue indépendante (`independent-code-reviewer`) & Build Tauri Release final**
  - Audit complet du `git diff v1.2.0..HEAD` par un sous-agent relecteur indépendant n'ayant pas écrit le code.
  - Correction de toute anomalie détectée et validation finale : `npx tsc --noEmit`, `npx vitest run`, `cargo test`, `cargo clippy -- -D warnings`, et `tauri build`.
  - **Critère de fini** : 0 erreur, 0 warning, build Release `1.2.1` généré, branche non mergée et sans tag poussé.
