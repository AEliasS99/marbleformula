#!/usr/bin/env zsh
set -euo pipefail

echo "=========================================================="
echo "🚀 Configurando Marble Formula Render Node en este Mac..."
echo "=========================================================="

# 1. Verificar Homebrew, Node.js y FFmpeg
if ! command -v brew >/dev/null 2>&1; then
  echo "📦 Instalando Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "📦 Instalando Node.js..."
  brew install node
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "📦 Instalando FFmpeg..."
  brew install ffmpeg
fi

echo "✅ Node: $(node -v) | NPM: $(npm -v) | FFmpeg: $(ffmpeg -version | head -n 1)"

# 2. Instalar dependencias NPM del proyecto
echo "📦 Instalando dependencias del motor 3D (Rapier + Three.js + Remotion)..."
npm install

# 3. Crear carpeta de salida de vídeos (/Users/$USER/GoogleCloud por defecto)
DEFAULT_OUT="$HOME/GoogleCloud"
mkdir -p "$DEFAULT_OUT" out out/gp

# 3b. Restaurar credenciales de YouTube (@MarbleFormula) desde GoogleCloud si existen
if [[ -f "$DEFAULT_OUT/youtube-auth/youtube-client.json" && ! -f ".youtube-client.json" ]]; then
  cp "$DEFAULT_OUT/youtube-auth/youtube-client.json" .youtube-client.json
  echo "🔑 Restaurado .youtube-client.json desde $DEFAULT_OUT/youtube-auth/"
fi
if [[ -f "$DEFAULT_OUT/youtube-auth/youtube-token.json" && ! -f ".youtube-token.json" ]]; then
  cp "$DEFAULT_OUT/youtube-auth/youtube-token.json" .youtube-token.json
  echo "🔑 Restaurado .youtube-token.json desde $DEFAULT_OUT/youtube-auth/"
fi

# 4. Generar datos iniciales de los 5 circuitos (src/gp/races/*.json + index.ts)
echo "🏎️ Generando telemetría inicial de los 5 circuitos (src/gp/races/)..."
GP_CARS=1 GP_LAPS=1 GP_HEAT=1 node scripts/season.mjs

echo ""
echo "=========================================================="
echo "✅ ¡LISTO! El nodo de renderizado está 100% configurado."
echo "=========================================================="
echo "Comandos principales en este Mac:"
echo "  1) Renderizar Torneos 4K60 UHD 'Don't Be Last!' completos:"
echo "     zsh scripts/render-tcr-overnight.sh"
echo ""
echo "  2) Abrir la interfaz de Remotion Studio en el navegador:"
echo "     npm run studio"
echo "=========================================================="
