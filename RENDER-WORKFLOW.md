# Producción local y publicación separada

## Control de entrega obligatorio (1 noviembre 2026)

**Revisión remota autorizada, 2 de noviembre:** la orden explícita del usuario de subir el máster completo de Francia autoriza No listado con valoración editorial pendiente. Para este alcance, el recibo usa `purpose:'user-requested-unlisted-review'`, `result:'technical-passed-editorial-pending'` y `authorization` con identificador, petición/fecha, privacidad No listado y SHA exacto. Los bloqueos vivos de ese máster deben registrar la misma `unlistedReviewAuthorization`. Física/cámaras/decodificación/escena/minimapa/señal de audio/CTA siguen siendo obligatorios; ninguna excepción permite teletransportes o fallos técnicos. Audio y visual pueden conservar `result:'pending-editorial'` con evidencias `signal-checks` y `sampled-export-inspection`, resultado `technical-passed-editorial-pending` y `pendingEditorialReview:true`. No afirmar escucha o reproducción continua no realizadas. Este permiso no sirve para Público ni programación, no elimina el bloqueo editorial/archivo y no permite otro máster. El modo estricto descrito a continuación permanece para entregas con aprobación editorial completa.

`npm run quality:check` ejecuta las regresiones portables de física grabada, audio y entrega, además de TypeScript. El fixture real `scripts/fixtures/italy67-recorded-teleport.json` conserva el defecto de Italia aunque se limpien los archivos ignorados de `out`. Ejecutar además las pruebas específicas de los cambios y los controles completos del vídeo: esta orden no aprueba un máster.

El uploader actual comprueba `video-delivery-gate.mjs` antes de OAuth, crear/reanudar sesiones o transferir bytes. También se aplica a `--dry-run` y `--force`. Los bloqueos vivos, cambios solicitados o física fallida prevalecen sobre cualquier aprobación antigua. No usar un uploader congelado ni llamadas directas a YouTube para eludir el control. El valor por defecto ahora es **Unlisted**.

Después de revisar el export real, guardar `<master>.quality.json` (o indicar un único `--file ... --quality-review /ruta/review.json`). El recibo contiene `schema:1`, `result:'passed'`, `productionKey`, `artifact:{path,bytes,sha256}`, `race:{path,sha256}` —o `races:[...]` para compilaciones— y `checks`. Las claves obligatorias son `physics`, `camera`, `decode`, `scene`, `minimap`, `audio`, `visual`, `cta`; cada una incluye `result:'passed'` y `evidence:{path,sha256}`. Cada evidencia JSON contiene su resultado real y `videoSHA256` del máster exacto. Conservar los informes y muestras concretas que sustentan ese resultado. Si hay retrasos físicos, documentar su revisión y `checks.physics.obstacleDelaysReviewed:true`.

Audio exige `method:'listened'`: ausencia de silencios o picos no sustituye escuchar ASMR/contactos. Visual exige `method:'watched-export'`: las imágenes estáticas no sustituyen revisar movimiento, contactos, cámaras o parpadeos. CTA exige `method:'inspected-export'` y `visibleText:['LIKE','SUBSCRIBE','marbleformula.com']`, con momentos/fotogramas comprobados. No rellenar aprobaciones pendientes: el trabajo de revisión forma parte de la entrega del agente. `publicRelease.approved:true` solo se registra tras autorización explícita de publicación pública del usuario; Unlisted permite su revisión editorial remota sin esa aprobación.

El uploader calcula de nuevo los hashes y audita los datos físicos de todas las carreras incluidas. Una modificación de audio, imágenes, datos o evidencia invalida el recibo anterior. No vuelve a renderizar ni modifica/sube archivos al realizar estas comprobaciones. Esta medida evita omisiones y regresiones conocidas; no demuestra por sí sola calidad artística ni una carrera completa corregida.

## Reutilizar antes de renderizar (30 octubre 2026)

Las correcciones visuales usan la carrera guardada, sus resultados, cámaras y audio: no vuelven a simularla. Primero revisar fotogramas UHD y clips breves del circuito real. El renderer segmentado conserva cada tramo verificado y su SHA en `$VIDEO_OUT/.render-cache/`; si se interrumpe, puede recuperar los tramos cuyos datos, fuentes, cámara de replay, ajustes, dependencias y navegador siguen coincidiendo. No se sobrescriben los intentos anteriores.

Entre versiones distintas solo se reutilizan tramos explícitamente demostrados como iguales. En la reparación de Egipto61, cuatro comparaciones UHD idénticas (una por clase de coche) permiten conservar cinco tramos completos del showroom: 180–1079, 900 fotogramas/15 segundos. Los planos de pista afectados por asfalto/contacto sí se renderizan de nuevo. La concatenación copia el vídeo codificado y mezcla una sola pista continua del audio original; nunca recodifica los tramos retenidos. `ready.segmentReuse` registra la prueba y los archivos originales con sus hashes. Reutilizar no aprueba el vídeo final: siguen siendo obligatorias la decodificación completa, audio, escena, minimapa y revisión visual del export.

> **26/10/2026 — Actualización de aprobación y reparto.** El usuario aprobó la publicación de las dos revisiones corregidas de Alpes: ya son públicas como carrera y revancha, sin volver a subir los archivos. La siguiente carrera de Alpes debe usar otros países. La nueva revisión aislada de manga 2 usa ITA, GBR, MEX, NLD, FRA y USA, conserva la producción completa y todavía requiere revisión del usuario antes de publicación pública o archivo en Cloud. Estado actual en `HANDOFF.md` y `out/tcr/alps-action-v2-job.json`; no reiniciar la toma anterior con el mismo reparto.

La preparación y el render de revisiones admiten manga y países explícitos. Primero comprobar el bloqueo compartido y que la toma no exista. La preparación no modifica los clasificatorios oficiales:

```sh
node scripts/factory.mjs --shared-lock -- node scripts/prepare-alps-review.mjs 24 --heat=2 --take=action-v2 --countries=ITA,GBR,MEX,NLD,FRA,USA
node scripts/factory.mjs --shared-lock -- node scripts/render-alps-review.mjs 24 --stills --heat=2 --take=action-v2
# Tras comprobar la simulación, las cámaras y los fotogramas nativos:
node scripts/factory.mjs --shared-lock -- node scripts/render-alps-review.mjs 24 --render --heat=2 --take=action-v2
```

El render nunca sube ni publica. Para esta revisión remota hay un observador inmediato independiente, limitado a seis horas, que llama al uploader existente con visibilidad Unlisted solo si el máster completo supera sus controles. No constituye aprobación editorial ni una cola general de publicación. Registro: `out/tcr/alps-action-v2-delivery.json`.

> **25/10/2026 — Producción pendiente de correcciones.** La auditoría encontró problemas de reglamento, física, rótulos y recuperación del pipeline. No ejecutar todavía el render del campeonato TCR ni publicar la manga recuperada. El preview local del editor solicitado por el usuario usa el flujo independiente descrito abajo. Consultar [AUDIT-2026-10-25.md](AUDIT-2026-10-25.md). Los comandos siguientes documentan el flujo, no certifican su aprobación para producción. La manga 2 preparada deberá regenerarse si cambia el motor o el reglamento.

Activar herramientas en este Mac:

```sh
source /Users/user/marmot/Races/activate.sh
cd /Users/user/marmot/Races/marbleformula
```

## Preparar la siguiente manga sin renderizar ni publicar

```sh
zsh scripts/render-tcr-overnight.sh --location alps --prepare
```

Este es también el comportamiento por defecto. Reconstruye los clasificados a partir de las telemetrías verificadas de las mangas ya completadas, genera la siguiente simulación y prepara su bundle. El estado está en `out/tcr/alps/ready.json`. Tokio usa `--location tokyo`.

## Renderizar localmente

### Reparación activa de las revisiones de Alpes (26/10/2026)

Consultar primero `out/tcr/alps-repair/status.json`: hay una cola de reparación de las dos revisiones, con el bloqueo compartido. No iniciar una segunda cola. La exportación mantiene todos los fotogramas y la calidad nativa4K60, renovando Chrome cada180 fotogramas. Cada tramo se decodifica y se comprueba para detectar la desaparición de la escena antes de continuar. El vídeo se une con `-c:v copy` y el audio original continuo se codifica una sola vez. Los fallos conservan su evidencia; solo se promueve el MP4 final después de los controles de todo el archivo. Los archivos corregidos llevan `-repaired-4k.mp4`; nunca se sobrescribe el máster original ni los borradores fallidos.

La prueba interna de180 fotogramas pasó, pero no sustituye la revisión del vídeo completo con el usuario. La detección automática de fondo blanco/negro tampoco aprueba las cámaras o la emoción de la carrera. Estado y registros: `out/tcr/alps-repair/`. No se publica ni archiva automáticamente.

```sh
caffeinate -dimsu zsh scripts/render-tcr-overnight.sh --location alps --render
```

Conserva las mangas existentes solo si coinciden con su hash registrado y con el formato y número de fotogramas esperado. Para una manga recuperada de otra máquina se necesita primero su telemetría y registro de verificación en `out/tcr/<location>/`.

Los nuevos renders se escriben como `.partial.mp4` en `$VIDEO_OUT`. Solo se renombran tras comprobar formato, decodificación completa y fotogramas corruptos. El proceso usa el bloqueo compartido durante preparación y render, y guarda telemetría, audio y clasificados separados por circuito. Se niega a crear una final sin las cuatro clasificaciones y diez candidatos distintos.

Al completar las mangas, concatena los vídeos íntegros con `-c copy -movflags +faststart`, sin recortar ni recodificar los másteres. Genera metadatos de publicación para revisión. No llama a YouTube ni a Google Cloud.

## Validar, publicar y archivar

1. Revisar los vídeos con el usuario, incluidos rótulos, ganadores, sonido y duración. Los controles técnicos no sustituyen su validación.
2. Revisar título/descripción/miniatura y comprobar la elegibilidad actual del canal si el vídeo supera 15 minutos.
3. Solo después de la validación, ejecutar el uploader de forma independiente. Primero se puede comprobar la cola:

```sh
npm run upload -- --file "$VIDEO_OUT/tcr-alps-tournament-4k.mp4" --round tcr-alps-tournament-4k --dry-run
# Ejecutar sin --dry-run únicamente después de la validación del usuario.
```

4. Confirmar el éxito y procesamiento en YouTube. Después archivar el vídeo final en Google Cloud mediante una acción separada.
5. Conservar el máster local salvo instrucción expresa de borrarlo.

Las instrucciones antiguas que describen subida automática del script nocturno ya no corresponden a su comportamiento actual.


## Preview local del editor, sin publicar

```sh
caffeinate -dimsu npm run render:racecraft -- --simulation <UUID> --render
```

El UUID debe corresponder a un ensayo de coches actual, completo y con tres checkpoints. Se reutilizan las poses físicas guardadas en los modelos de producción, con vídeo nativo 4K60. Sin `--render` solo valida y prepara. No llama a `season`, al uploader ni a Cloud; no sustituye la preparación del campeonato TCR. Consulta `designer/README.md` para validaciones, hashes, audio y límites. La biblioteca muestra el resultado local como pendiente de revisión. El usuario debe revisar el vídeo antes de cualquier publicación.


## Car 360 presentation (27 October 2026)

New car bakes prepend the established showroom, with the actual entrants and five seconds per complete car rotation. A six-car presentation adds34seconds; physics/result clocks remain unchanged. Future preparation writes the separate `-intro.wav`, and review exports include both full presentation and full race. The segmented renderer offsets native still/scene-check positions and mixes intro/race audio at exact44.1kHz sample offsets (735samples per60fps frame). Original no-intro snapshots retain their old durations/audio.

The first full showcase is queued under `out/tcr/alps-showcase-v1-job.json`; consult HANDOFF.md and the shared lock before launching anything. Its detached delivery observer uploads Unlisted only after complete verification, following the user's remote-review instruction. Native stills are implementation QA; the complete moving video remains pending review.


## Swiss Turbo challenge (27 October 2026)

The user requested a faster successor with obstacles and acceleration lanes. Preparation supports `--variant=turbo`, an opt-in evolution of the existing Swiss course. Use a fresh take and the shared factory lock, e.g. `node scripts/factory.mjs --shared-lock -- node scripts/prepare-alps-review.mjs 34 --heat=4 --take=turbo-v3 --variant=turbo --countries=ITA,FRA,AUT,CHN,IRL,USA`; the actual seed34 take is already running, so do not repeat this command. Check its job/ready files first.

The preset adds eight acceleration strips and seven physical islands with shared route/collision dimensions, higher powertrain settings and full-body island response. Preparation audits every saved car pose against the island envelope; rendering requires that audit to pass. Standard Swiss and marble obstacle planning remain unchanged. Native still selection includes `island-1` through `island-7`, `accel-entry` and `accel-dual`. Full production output still uses the existing segmented4K60 renderer, original authored scene and audio.

The reviewed showcase-v1 is public/approved/archived; the Turbo successor remains pending review. Its separate Unlisted uploader is queued behind the recorded YouTube upload-limit backoff. See HANDOFF.md and `out/tcr/youtube-review-delivery-hold.json` before any upload.
