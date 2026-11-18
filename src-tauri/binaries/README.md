# Binaires FFmpeg requis

Tauri emballe ces binaires avec l'application via `externalBin` dans `tauri.conf.json`.

## Convention de nommage Tauri

Le binaire doit être nommé avec le **triple de la cible** :

| Plateforme | Fichier ffmpeg | Fichier ffprobe |
|---|---|---|
| Windows x64 | `ffmpeg-x86_64-pc-windows-msvc.exe` | `ffprobe-x86_64-pc-windows-msvc.exe` |
| macOS Intel | `ffmpeg-x86_64-apple-darwin` | `ffprobe-x86_64-apple-darwin` |
| macOS Apple Silicon | `ffmpeg-aarch64-apple-darwin` | `ffprobe-aarch64-apple-darwin` |
| Linux x64 | `ffmpeg-x86_64-unknown-linux-gnu` | `ffprobe-x86_64-unknown-linux-gnu` |

## Téléchargement des binaires statiques

### Windows
Télécharger depuis **https://www.gyan.dev/ffmpeg/builds/** (ffmpeg-release-essentials.zip)
ou **BtbN builds** : https://github.com/BtbN/FFmpeg-Builds/releases
- Choisir `ffmpeg-n7.x-latest-win64-lgpl-shared.zip` (ou essentials)
- Extraire `ffmpeg.exe` et `ffprobe.exe` depuis le dossier `bin/`
- Renommer selon la convention ci-dessus

### macOS

> **Pourquoi ne pas utiliser `brew install ffmpeg` ?**
> Les binaires installés via Homebrew sont liés **dynamiquement** à des bibliothèques partagées sous `/opt/homebrew` (Apple Silicon) ou `/usr/local` (Intel). Ils ne peuvent pas être redistribués dans un bundle `.app` / `.dmg`, car l'application planterait au lancement chez tout utilisateur ne possédant pas ces bibliothèques Homebrew installées exactement au même emplacement.

Utiliser les builds **statiques** figés de [`eugeneware/ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1) (`b6.1.1`) avec vérification SHA-256 et contrôle `otool -L` :

```bash
# Téléchargement des binaires statiques macOS Apple Silicon (aarch64-apple-darwin)
FFMPEG_URL="https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-arm64.gz"
FFPROBE_URL="https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffprobe-darwin-arm64.gz"

curl -fSL "$FFMPEG_URL" -o /tmp/ffmpeg-darwin-arm64.gz
curl -fSL "$FFPROBE_URL" -o /tmp/ffprobe-darwin-arm64.gz

# Vérification de l'intégrité (SHA-256)
echo "8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa  /tmp/ffmpeg-darwin-arm64.gz" | shasum -a 256 -c -
echo "d986a8ec7b030899fe66a8a288ed809a3543338705a3ce178cfb85869c5d80be  /tmp/ffprobe-darwin-arm64.gz" | shasum -a 256 -c -

# Extraction et permissions d'exécution
gunzip -c /tmp/ffmpeg-darwin-arm64.gz > src-tauri/binaries/ffmpeg-aarch64-apple-darwin
gunzip -c /tmp/ffprobe-darwin-arm64.gz > src-tauri/binaries/ffprobe-aarch64-apple-darwin
chmod +x src-tauri/binaries/ffmpeg-aarch64-apple-darwin src-tauri/binaries/ffprobe-aarch64-apple-darwin

# Vérification de liaison statique : aucune dépendance vers /opt/homebrew ou /usr/local
otool -L src-tauri/binaries/ffmpeg-aarch64-apple-darwin
otool -L src-tauri/binaries/ffprobe-aarch64-apple-darwin
```

### Linux
```bash
# Depuis les builds statiques de John Van Sickle :
# https://johnvansickle.com/ffmpeg/
# Télécharger ffmpeg-release-amd64-static.tar.xz
# Extraire ffmpeg et ffprobe, renommer selon la convention
chmod +x src-tauri/binaries/ffmpeg-* src-tauri/binaries/ffprobe-*
```

## Vérification

```bash
# Le triple actuel de la machine :
rustc -vV | grep host
```

> **Important** : Les binaires ne sont **pas** commités dans git (ajoutés au .gitignore).
> Chaque développeur/CI doit les placer manuellement avant de builder.
