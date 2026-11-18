# Kompri v1.2.2 — Plan (rename MediaForge → Kompri)

> Branch: `chore/rename-kompri` (from `main` @ `3c73c47`, v1.2.1)
> Scope: rename only, no new features.

## Steps

- [x] **1. Inventory** of every `mediaforge` occurrence (code, config, i18n, docs, workflows, scripts, tests, NSIS), classified as *rename* / *keep on purpose* (see DEVLOG, Step 18).
- [x] **2. Metadata**: `tauri.conf.json` (productName, mainBinaryName, window title, descriptions), `Cargo.toml` (`kompri` / `kompri_lib`, `main.rs`), `package.json` (`kompri`). Identifier `com.mediaforge.app` kept.
- [x] **3. UI & i18n**: title bar, sidebar, About (+ "Formerly MediaForge" line in 5 languages), CLI mini-window, context-menu hint, notices fallback, temp-dir names.
- [x] **4. Explorer context menu migration**: `shell\Kompri`, legacy `shell\MediaForge` removed on (re)register/unregister, startup migration also triggered by legacy keys; migration test.
- [x] **5. Windows installer**: verify how Tauri v2 identifies an install (productName-based) → NSIS pre-install hook silently uninstalls MediaForge ≤ 1.2.1; WiX `upgradeCode` pinned to MediaForge's.
- [x] **6. Updater**: not configured (no `tauri-plugin-updater`, no `plugins.updater`) → nothing to repoint; documented.
- [x] **7. macOS / Linux notes**: CHANGELOG + README *Upgrading from MediaForge*.
- [x] **8. Showcase**: README (Kompri, "formerly MediaForge", new repo links), `npm run record-demo`, social preview regenerated from the harness (`npm run social-preview`), CHANGELOG [1.2.2], version 1.2.2.
- [ ] **9. Repo**: GitHub repo rename + `git remote set-url` + description/topics via `gh api` — **blocked**: repo not renamed yet (`Hugodlg91/Kompri` → 404) and `gh` not installed. Description/topics contain no "MediaForge" anyway.
- [x] **10. Independent review** of the whole diff, fixes, full checks.
- [x] **11. Full Tauri build** → `Kompri_1.2.2_x64-setup.exe` + `Kompri_1.2.2_x64_en-US.msi`; real install test MediaForge → Kompri on Windows (see DEVLOG).
