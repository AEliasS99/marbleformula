# Jaipur 70 · Camera C

Esta entrega contiene la carrera ya simulada, con sus poses, cámaras, resultados, escena congelada y las dos pistas WAV originales. El manifiesto identifica cada archivo con SHA-256. El montaje dura 16 238 fotogramas a 60 fps, unos 4:31, a 3840 × 2160.

## Probar en otro PC

Ejecuta estos pasos en Linux o en una terminal Linux de WSL 2. Usa Node.js 22, Python 3 con NumPy, FFmpeg (incluido ffprobe) y Chrome o Chromium con WebGL. En Ubuntu, puedes instalar FFmpeg y NumPy con `sudo apt install ffmpeg python3-numpy`. Mantén espacio para los segmentos temporales y la salida. El renderer exige 48 GiB libres para admitir un segmento y el Mac usaba un margen de trabajo superior.

Desde la raíz del checkout de la rama `jaipur-render-handoff`:

```bash
npm ci
export VIDEO_OUT="$HOME/MarbleFormulaVideos"
export MARBLE_CHROME="$(command -v google-chrome || command -v chromium)"
test -x "$MARBLE_CHROME"
python3 scripts/prepare-jaipur-handoff.py

# Verifica primero el WebGL y el encuadre en un fotograma UHD de la meta.
node scripts/factory.mjs --shared-lock -- node scripts/render-alps-review.mjs 70 --stills finish --location=india --directory=out/tcr/portable-jaipur-70-camera-c
```

Abre `out/tcr/portable-jaipur-70-camera-c/finish.png` y comprueba que se ve la pista y las canicas. Con el mismo entorno, inicia el render completo:

```bash
node scripts/factory.mjs --shared-lock -- node scripts/render-alps-review.mjs 70 --render --location=india --directory=out/tcr/portable-jaipur-70-camera-c
```

La salida se guarda en `$VIDEO_OUT/jaipur-70-camera-c-4k.mp4`. El renderer verifica el vídeo completo y guarda los segmentos validados para reanudar en ese mismo PC. Los segmentos del Mac permanecen en el Mac porque la caché depende del navegador y de la plataforma. El PC genera sus propios fotogramas a partir de la simulación guardada. La revisión visual y la escucha del vídeo final siguen pendientes. La rama no publica ni sube el vídeo.
