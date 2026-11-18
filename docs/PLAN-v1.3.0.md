# Kompri v1.3.0 — Plan d'implémentation (`feat/v1.3.0-quality`)

> Branche : `feat/v1.3.0-quality` créée depuis `main` après le lot 1 (renommage Kompri, v1.2.2)
> Cible : **v1.3.0**

---

## Étapes & Critères de validation

- [x] **Étape 1 — Planification & Architecture (`docs/PLAN-v1.3.0.md`)**
  - *Critère de fini* : Branche `feat/v1.3.0-quality` créée, interfaces partagées figées et plan documenté dans `docs/PLAN-v1.3.0.md`.

- [x] **Étape 2 — Chantier 1 : Preset Discord à 20 Mo & Migration des réglages (`10 → 20`)**
  - Valeur par défaut de `preset_discord_mb` passée de `10.0` à `20.0` (Rust `lib.rs`, frontend `useSettings.ts`, `VideoConverter.tsx`, `SettingsPage.tsx`).
  - Migration faite **côté Rust, au démarrage**, avec un marqueur persisté `discord_20mb_migrated` (et non dans le frontend) : si `preset_discord_mb == 10` (ancienne valeur par défaut), elle devient `20` une seule fois ; une valeur personnalisée (ex. `8`, `12`, `15`) est conservée intacte.
  - Libellés du menu contextuel Windows Explorer (`context_menu.rs`) mis à jour dans les 5 langues (`20 Mo` / `20 MB`) ; `sync_context_menu_on_startup` réécrit les clés `HKCU` existantes avec le nouveau libellé.
  - WhatsApp (`16 Mo`) et Gmail (`25 Mo`) inchangés.
  - *Critère de fini* : tests Rust `test_discord_migration_*` (migration `10 → 20`, préservation d'une valeur personnalisée) et `test_startup_sync_rewrites_old_discord_10mb_label` (réécriture `HKCU` `10 Mo → 20 Mo`) dans `lib.rs` (migration) et `context_menu.rs` (réécriture du libellé), tous verts.

- [x] **Étape 3 — Chantier 2 & 3 (Backend Rust & CI) : Mode « Qualité max (plus lent) » dans `target_size.rs`, `cli.rs`, `lib.rs` et `release.yml`**
  - Argument `max_quality` dans la construction des arguments FFmpeg 2 passes (`target_size.rs`) :
    - `-preset slow` (au lieu de `medium`) pour `libx264` et `libx265`.
    - Débruitage `hqdn3d=0.6:0.4:0.9:0.6` **avant** la mise à l'échelle.
    - Netteté `unsharp` **évaluée puis retirée** après mesure : toute valeur positive baissait le SSIM sur les clips réduits. Rien n'est livré après la mise à l'échelle.
  - `target_size_max_quality: bool` (défaut `false`) dans `Settings` (`lib.rs`), `max_quality: Option<bool>` dans `compress_video_to_size` et `compress_video_batch_to_size`, et flag `--max-quality[=bool]` dans `cli.rs` (sans valeur = activé ; absent = réglage des Settings).
  - Smoke test multi-OS de `.github/workflows/release.yml` enrichi : vérifie les filtres `hqdn3d`, `scale`, `fps` et un encodage `slow` sur Windows, macOS et Linux.
  - *Critère de fini* : `cargo test` et `cargo clippy --all-targets -- -D warnings` passent avec des tests unitaires sur les arguments FFmpeg (avec/sans `max_quality`, avec/sans `downscaled`, H.264/H.265) et le flag CLI `--max-quality`.

- [x] **Étape 4 — Chantier 2 & 3 (Frontend React & i18n 5 langues) : Avertissement H.265 & Interrupteur « Qualité max »**
  - Avertissement non bloquant dans `VideoConverter.tsx` lorsque H.265 est sélectionné en mode taille cible (traduit en `fr`, `en`, `es`, `de`, `pt`).
  - Interrupteur « Qualité max (plus lent) » dans `VideoConverter.tsx` (mode taille cible), réglage par défaut dans `SettingsPage.tsx` + `useSettings.ts` + `useConversion.ts`.
  - *Critère de fini* : `npx tsc --noEmit` et `npx vitest run` passent avec des tests couvrant l'avertissement H.265, l'interrupteur « Qualité max », la persistance des Settings et les clés i18n dans les 5 langues.

- [x] **Étape 5 — Validation vidéo réelle & Mesures de qualité (VMAF / SSIM / PSNR)**
  - Mesures faites avec VMAF (libvmaf disponible) + SSIM + PSNR-Y sur des clips 10 s, 60 s et 180 s en `1080p60` (le clip de 180 s déclenche le downscaling en 720p30), encodés en **Discord 20 Mo** avec et sans « Qualité max ».
  - Méthode : code 2 passes réel de l'application (`src-tauri/examples/target_size_bench.rs`), clips générés par `scripts/quality-bench/make-clips.ps1`, référence convertie aux fps/résolution de sortie pour un VMAF aligné image par image.
  - Banc reproductible dans `scripts/quality-bench`.
  - Tous les fichiers de sortie sont strictement sous la cible (`< 20 000 000` octets).
  - *Critère de fini* : tableau complet des mesures (clip, codec, mode, taille, VMAF, SSIM, PSNR-Y, temps d'encodage) consigné dans `DEVLOG.md`.

- [x] **Étape 6 — Chantier 4 : Démo réelle (`record-demo`), Documentation & Bump `v1.3.0`**
  - Démo ré-enregistrée sur le clip 60 s du banc `1080p60` (160 997 966 octets, reproductible). Le clip maître original de `122 773 228` octets n'est plus disponible. Encodage 2 passes Discord 20 Mo réel : 20 Mo → 19 202 630 octets.
  - `scripts/record-demo/demo-main.ts`, `scripts/record-demo/record.mjs`, `scripts/record-demo/README.md` mis à jour ; `docs/assets/kompri-demo.gif` et `.mp4` régénérés via `npm run record-demo`.
  - `README.md`, `CHANGELOG.md`, `DEVLOG.md` mis à jour ; version passée à `1.3.0` dans `package.json`, `package-lock.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json`.
  - *Critère de fini* : démo régénérée sans erreur, docs et versions alignées sur `1.3.0`.

- [x] **Étape 7 — Revue de code indépendante & Build Tauri final**
  - Audit complet du diff par un sous-agent relecteur indépendant (`research`), application des éventuels correctifs, passage complet de la boucle de vérification (`tsc`, `vitest`, `cargo test`, `cargo clippy --all-targets -- -D warnings`) et `npm run tauri build`.
  - *Critère de fini* : 0 problème bloquant en revue et build Tauri release `1.3.0` réussi.
