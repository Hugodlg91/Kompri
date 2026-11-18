# Kompri (ex-MediaForge) — Arborescence du projet

> Mise à jour le 26 mars 2026 — basée sur `git ls-files` (fichiers versionnés uniquement).  
> Les dossiers `node_modules/`, `src-tauri/target/`, `dist/` et les binaires FFmpeg sont exclus par `.gitignore`.

```
Kompri/
│
├── .gitattributes                      # Normalisation LF pour les textes, binaire pour les assets
├── .gitignore                          # Règles d'exclusion git (complètes)
├── .github/
│   ├── FUNDING.yml                     # Lien Sponsor Ko-fi
│   └── workflows/
│       ├── ci.yml                      # CI sur push/PR (tsc, vitest, cargo test, cargo clippy)
│       └── release.yml                 # Build & publication multi-OS sur tag v* (avec smoke tests FFmpeg)
├── .vscode/
│   └── extensions.json                 # Extensions VS Code recommandées
│
├── index.html                          # Point d'entrée HTML (Vite) — favicon → icon.png
├── vite.config.ts                      # Config Vite + Vitest (jsdom, globals)
├── tsconfig.json                       # Config TypeScript (app)
├── tsconfig.node.json                  # Config TypeScript (outils de build)
├── package.json                        # Dépendances npm (kompri v1.3.0) + scripts
├── package-lock.json                   # Lockfile npm
│
├── DEVLOG.md                           # Journal de développement (étapes 1-17)
├── CHANGELOG.md                        # Notes de version (v1.0.0 → v1.2.1)
├── THIRD_PARTY_NOTICES.md              # Notices et sources FFmpeg/FFprobe (GPLv3) par plateforme
├── LICENSE                             # Licence du projet (GNU GPLv3)
├── README.md                           # Documentation générale du projet
├── arbo.md                             # Ce fichier — arborescence du projet
│
├── docs/
│   ├── PLAN-v1.2.md                    # Plan d'architecture et résultats E2E de la v1.2.0
│   ├── PLAN-v1.2.1.md                  # Plan de correctifs et finition de la v1.2.1
│   ├── SCREENSHOTS_CHECKLIST.md        # Checklist des captures d'écran et GIF de démo
│   └── assets/
│       ├── kompri-demo.gif         # Démo animée du README (générée via npm run record-demo)
│       └── kompri-demo.mp4         # Version MP4 de la démo
│
├── licenses/
│   └── FFmpeg-GPLv3.txt                # Texte complet de la licence GNU GPLv3 (FFmpeg sidecar)
│
├── scripts/
│   ├── test-target-size.ps1            # Suite E2E FFmpeg (15 scénarios 1080p/4K Discord/WhatsApp/Gmail)
│   └── record-demo/                    # Harness Playwright + Vite pour régénérer la démo du README
│       ├── README.md
│       ├── index.html
│       ├── demo-main.ts
│       ├── cursor.js
│       └── record.mjs
│
├── resource/
│   ├── app-icon.png                    # Source 1024×1024 de l'icône de l'app
│   └── app-icon.svg                    # Source vectorielle SVG de l'icône de l'app
│
├── src/                                # Frontend React + TypeScript
│   ├── main.tsx                        # Point d'entrée React (GlobalErrorBoundary → App)
│   ├── App.tsx                         # Routage principal (TitleBar + Sidebar + pages + mini-vue CLI)
│   ├── i18n.ts                         # Configuration i18next (5 langues)
│   ├── index.css                       # Design system global Liquid Glass (tokens CSS, utilitaires)
│   ├── setupTests.ts                   # Setup Vitest (jest-dom matchers)
│   ├── vite-env.d.ts                   # Types d'environnement Vite
│   │
│   ├── __tests__/                      # Tests unitaires Vitest (51 tests)
│   │   ├── path.test.ts                # 16 tests : buildOutputPath / formatFileSize / formatDuration
│   │   ├── useDragDrop.test.ts         # 7 tests : filtrage extensions drag & drop
│   │   ├── useConversion.test.ts       # 6 tests : concurrence & annulation des conversions
│   │   ├── navigation.test.tsx         # 6 tests : persistance inter-onglets, raccourcis Ctrl+1..5
│   │   ├── titlebar.test.tsx           # 5 tests : contrôles de fenêtre Liquid Glass (close/min/max)
│   │   ├── responsive.test.tsx         # 3 tests : architecture responsive, grilles et portails
│   │   └── targetSize.test.tsx         # 8 tests : mode Taille cible, presets, estimation, Passe 1/2 & 2/2
│   │
│   ├── components/
│   │   ├── GlobalErrorBoundary.tsx     # Error boundary global (récupération crash React)
│   │   │
│   │   ├── Converter/
│   │   │   ├── ConverterPage.tsx       # Page wrapper des convertisseurs + routage fichiers CLI
│   │   │   ├── VideoConverter.tsx      # Convertisseur vidéo (Format classique + Taille cible 2 passes)
│   │   │   ├── AudioConverter.tsx      # Convertisseur audio (single + batch)
│   │   │   ├── ImageConverter.tsx      # Convertisseur image (single + batch + resize)
│   │   │   └── ProgressBar.tsx         # Barre de progression Liquid Glass (support Passe 1/2 & 2/2)
│   │   │
│   │   ├── History/
│   │   │   ├── HistoryPage.tsx         # Page Historique (wrapper)
│   │   │   └── History.tsx             # Liste des conversions (recherche, filtres, suppression)
│   │   │
│   │   ├── Layout/
│   │   │   ├── Sidebar.tsx             # Navigation latérale Liquid Glass
│   │   │   └── TitleBar.tsx            # Barre de titre Liquid Glass (contrôles fenêtre, thème, langue)
│   │   │
│   │   ├── Settings/
│   │   │   └── SettingsPage.tsx        # Page Paramètres (thème, langue, presets Mo, menu contextuel)
│   │   │
│   │   └── ui/                         # Composants réutilisables
│   │       ├── Icons.tsx               # Icônes SVG (20 icônes stroke-based)
│   │       ├── DropZone.tsx            # Zone drag & drop fichiers Liquid Glass
│   │       └── ConversionResult.tsx    # Affichage résultat post-conversion (ouvrir fichier/dossier)
│   │
│   ├── context/
│   │   ├── SettingsContext.tsx         # Context React pour les paramètres globaux
│   │   └── SectionActiveContext.ts     # Context d'isolation drag & drop de l'onglet actif
│   │
│   ├── hooks/
│   │   ├── useConversion.ts            # Conversion vidéo/audio + Taille cible 2 passes (single + batch)
│   │   ├── useImageConversion.ts       # Conversion images (single + batch + resize)
│   │   ├── useHistory.ts               # Chargement / suppression / vidage de l'historique
│   │   ├── useSettings.ts              # Chargement / sauvegarde des paramètres + sync menu contextuel
│   │   └── useDragDrop.ts              # Drag & drop natif Tauri (filtre extensions)
│   │
│   ├── locales/                        # Fichiers de traduction i18n
│   │   ├── fr.json                     # Français
│   │   ├── en.json                     # Anglais
│   │   ├── es.json                     # Espagnol
│   │   ├── de.json                     # Allemand
│   │   └── pt.json                     # Portugais
│   │
│   └── utils/
│       └── path.ts                     # buildOutputPath, formatFileSize, formatDuration
│
└── src-tauri/                          # Backend Rust (Tauri v2)
    ├── .gitignore                      # Exclut target/ localement
    ├── Cargo.toml                      # Dépendances Rust (tauri, single-instance, winreg, image...)
    ├── Cargo.lock                      # Lockfile Cargo
    ├── build.rs                        # Script de build Tauri
    ├── tauri.conf.json                 # Config Tauri (decorations: false, bundle v1.2.0, NSIS hooks...)
    │
    ├── nsis/
    │   └── hooks.nsh                   # Hook NSIS de nettoyage du registre Windows à la désinstallation
    │
    ├── src/
    │   ├── main.rs                     # Point d'entrée Rust
    │   ├── lib.rs                      # Commandes Tauri + orchestration 2 passes + single-instance
    │   ├── target_size.rs              # Calcul de débit, budget 95%, downscaling auto & args FFmpeg 2 passes
    │   ├── context_menu.rs             # Inscription/suppression registre HKCU du menu contextuel Windows
    │   ├── cli.rs                      # Parsing des arguments CLI (--action compress|convert|open)
    │   ├── job_tests.rs                # Tests unitaires d'isolation et d'annulation des jobs
    │   └── output_tests.rs             # Tests unitaires d'intégrité des fichiers de sortie
    │
    ├── capabilities/
    │   └── default.json                # Permissions Tauri (window, shell, dialog, opener, store)
    │
    ├── binaries/                       # Sidecars FFmpeg (non versionnés)
    │   └── README.md                   # Instructions de téléchargement FFmpeg (gyan.dev)
    │
    └── icons/                          # Icônes générées via `npm run tauri icon resource/app-icon.png`
        ├── icon.ico                    # Windows
        ├── icon.icns                   # macOS
        ├── icon.png                    # Linux / favicon HTML
        ├── 32x32.png
        ├── 64x64.png
        ├── 128x128.png
        ├── 128x128@2x.png
        ├── Square*Logo.png             # Windows Store / UWP (9 tailles)
        ├── StoreLogo.png
        ├── android/                    # Icônes Android (mipmap hdpi/mdpi/xhdpi/xxhdpi/xxxhdpi)
        │   └── values/
        │       └── ic_launcher_background.xml
        └── ios/                        # Icônes iOS (AppIcon multiples résolutions)
```

---

## Fichiers et dossiers exclus du repo (`.gitignore`)

| Chemin | Raison |
|---|---|
| `node_modules/` | Dépendances npm — `npm install` |
| `dist/` | Build frontend Vite — `npm run build` |
| `src-tauri/target/` | Compilation Rust — `cargo build` |
| `src-tauri/WixTools/` | Téléchargé automatiquement par `tauri build` |
| `src-tauri/binaries/ffmpeg-*.exe` | Binaire FFmpeg (>100 Mo — télécharger depuis gyan.dev) |
| `src-tauri/binaries/ffprobe-*.exe` | Idem |
| `scripts/` | Scripts de refactoring ponctuels déjà appliqués |
| `public/tauri.svg`, `public/vite.svg` | Assets scaffold Tauri/Vite non utilisés |
| `src/assets/react.svg` | Asset scaffold React non utilisé |
| `*.log` | Logs de build |
| `.env`, `.env.local` | Variables d'environnement sensibles |
| `*.key`, `*.pem` | Clés de signature (ne jamais commiter !) |
| `Thumbs.db`, `.DS_Store` | Fichiers système OS |
