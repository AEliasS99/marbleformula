# Racecraft Studio — taller local de diseño

Arrancar desde `marbleformula`:

```sh
source ../activate.sh
npm run designer
```

Abrir http://127.0.0.1:8081. El servidor escucha únicamente en loopback. No necesita servicios externos ni credenciales y no expone el directorio del repositorio. La web pública existente y Remotion Studio siguen siendo aplicaciones independientes.

## Lo que se puede hacer

- Trabajar en espacios separados de canicas y coches, con varios proyectos.
- Crear desde el circuito del taller o importar el trazado de uno de los cinco circuitos actuales del motor.
- Orbitar/acercar la vista 3D; cambiar al plano y arrastrar puntos. Doble clic inserta un punto; también se puede añadir desde el botón o el inspector. Ajustar posición, altura, ancho, tema, vueltas y semilla.
- Colocar obstáculos y decoración en un porcentaje del recorrido; ajustar desplazamiento lateral y escala; duplicar o retirar piezas.
- Crear piezas y variantes reutilizables a partir de formas de referencia, con nombre, color, tamaño y descripción de su comportamiento deseado.
- Personalizar nombres, colores, tamaño y participantes activos; en coches, clase y presupuesto de atributos.
- Añadir notas al circuito, punto, elemento o participante seleccionado, y marcarlas resueltas.
- Guardar automáticamente, deshacer/rehacer, exportar/importar proyectos con sus piezas propias y generar una ficha para este chat de Codex.

## Ensayos físicos locales

1. Abre un diseño y pulsa **Probar carrera**. Se guarda primero y se revisa su compatibilidad.
2. Elige duración (30–180 s) y velocidad inicial (0–25 m/s). Es energía de lanzamiento explícita, no una velocidad impuesta durante la carrera.
3. Reproduce, pausa y busca un instante en la línea de tiempo. La vista física muestra la malla de colisión y los cuerpos calculados, incluidos los obstáculos móviles; la vista conceptual sigue separada.
4. Revisa meta, eliminaciones, salidas de pista, bloqueos y tiempo agotado. Puedes exportar el informe con movimientos. Cada ensayo guarda diseño, parámetros, huella de fuentes y resultados en `.simulations/`, y se puede reabrir tras recargar el navegador.
5. Cualquier edición invalida la reproducción como prueba del diseño actual. La API exige revisión y etag, y la web no reutiliza un resultado de otra revisión.

**Nuevo diseño → Laboratorio físico** crea un circuito compatible para canicas o coches, con seis participantes, tres checkpoints y barreras de 1,5 m. Las canicas incluyen aceleradores explícitos para completar el circuito cerrado. Los proyectos existentes no se modifican.

### Física y reglas

- Rapier con paso fijo de 1/120 s, CCD y 8 iteraciones de solver. Telemetría a 30 fps; el ensayo no genera vídeo automáticamente. Repetir el mismo snapshot en este entorno produce los mismos movimientos.
- Se conserva la spline de control cerrada, con modificaciones locales explícitas para rampas, huecos y drenajes. `designer/public/course.js` genera el mismo suelo en el editor y Rapier; usa `src/gp/trackMesh.js` y `src/gp/vortex.js`. No se aplica el remodelado global de `season.mjs`. La altura de barrera es editable (0,2–3 m; diseños anteriores: 0,58 m).
- Canicas: esferas rígidas de radio `0.55 × tamaño`, gravedad, fricción y giro libre. No tienen piloto ni usan VEL/EST/INT. El circuito cerrado puede requerir impulso o aceleradores para superar ascensos.
- Coches: chasis cuboide de `0.8 × 0.4 × 1.6 × tamaño`, cuatro ruedas por rayos con suspensión, aceleración/frenos y piloto automático que gira hacia el trazado. VEL/EST/INT regulan velocidad objetivo, adherencia y anticipación. Las clases visuales aún comparten este chasis de ensayo. No se fija posición ni velocidad durante la conducción.
- Se respetan participantes activos, tamaño, número de vueltas y semilla de fases de mecanismos. Sin rescates, teletransportes ni reinserciones.
- Con exactamente tres checkpoints y al menos cuatro participantes se usan cupos `N−1`, `N−2`, `N−3`: las dos primeras puertas en vuelta 1 y la tercera en la última. Los cruces se ordenan por tiempo interpolado; empate exacto por ID. Las bajas previas pueden hacer que una puerta no elimine a nadie. En otros diseños se avisa de que el ensayo no tendrá eliminaciones.
- Se registra bloqueo tras 12 s sin desplazarse 0,3 m (también cuenta el movimiento dentro de un embudo); caída cuando el cuerpo baja 4 m respecto al tramo. Son criterios del laboratorio, no el reglamento de producción.

### Piezas compatibles y límites

Los mecanismos `pegs`, `bumpers`, `splitter`, `spinner`, `hammer`, `turntable`, `pusher`, `rollers` y `switch` reutilizan los módulos físicos existentes. `scaled-world.mjs` aplica la escala combinada de pieza y variante a cuerpos, colisionadores y desplazamientos cinemáticos futuros. Se conserva la posición y el desplazamiento lateral. Algunos mecanismos conservan las proporciones del ancho original del motor; la vista física muestra el hueco real.

Todos los tipos del catálogo tienen adaptador:

| Pieza | Comportamiento y representación |
| --- | --- |
| Vórtice | Entrada tangencial que se estrecha hacia el borde, cuenco hiperbólico compartido, garganta abierta y pista inferior. La salida recupera gradualmente la cota de control. La garganta debe dejar pasar al participante mayor. Es una pieza para canicas. |
| Salto | Rampa de 1,5 m, hueco nominal de 2,5 m y recepción inferior; escala ajusta altura y longitud. La velocidad determina el vuelo, sin trayectorias impuestas. |
| Caída | Borde libre, descenso nominal de 1,2 m y transición al trazado. |
| Baches / cresta | Ondulaciones de 17 cm / lomo suave de 1 m, incluidos en la malla de contacto. |
| Túnel | Cubierta semicircular con colisión; radio y longitud escalan. Se dibuja transparente para ver dentro. |
| Ventilador | Aspas cinemáticas y ráfagas laterales dentro de un volumen de 5 m de longitud base. No cambia directamente velocidades. |
| Reagrupador | Barra física que se eleva al reunir la mitad del grupo pendiente o tras 4 s. Puede abrir de nuevo para rezagados y vueltas posteriores. Su movimiento queda en la reproducción. |
| Acelerador / DRS | Fuerza hacia delante dentro de una zona visible, cerca del suelo y fuera de huecos. DRS es una zona de potencia, no aerodinámica. Un acelerador bajo el vórtice no empuja cuerpos que aún están en el cuenco. |
| Chicane / barrera / roca / arco | Postes, cuboides, esfera o estructura con colisión y escala. |
| Pinos / gradas | Decoración sin colisión, presente también en la reproducción. |
| Checkpoint | Puerta lógica centrada y sin escala; no frena cuerpos. |

Las variantes personales guardan `physicsType` y `shape`: heredan un comportamiento reconocido y aplican escala y color. Las variantes anteriores sin `physicsType` usan su forma base. El texto libre describe la intención, pero no programa movimientos nuevos. Un arco conserva su identidad de arco, sin convertirse en checkpoint por compartir dibujo.

Los modificadores del suelo reservan un tramo de entrada y recepción. El validador impide que esos tramos se solapen, crucen la salida o contengan checkpoints; comprueba garganta, gálibo y dimensiones. Las piezas que modifican todo el ancho deben estar centradas; el vórtice sí admite desplazamiento lateral con transiciones de entrada/salida. Los anchos y pendientes extremos siguen sujetos a validación. La longitud de carrera se mide sobre la spline de control; el recorrido orbital dentro del cuenco no cuenta vueltas adicionales.

**Nuevo diseño → Laboratorio completo** reúne todos los obstáculos de canicas en una pista de pruebas con seis canicas de tamaño 0,7, barreras altas e impulsos visibles. Es un banco para detectar caídas y atascos, no una carrera equilibrada o garantizada de llegar a meta. El laboratorio básico sigue disponible para construir progresivamente. Ningún proyecto existente se convierte o se elimina automáticamente.

Selecciona una pieza y pulsa **Ver pieza de cerca**. Rampas, huecos, cuencos y túneles ya se ven en el diseño antes de calcular. En resultados, **Sucesos de las piezas** permite saltar a la entrada/salida de un vórtice o a la apertura de una barrera. El movimiento de los participantes fuera de la reproducción sigue siendo una animación conceptual.

### Relación con producción

Esto conecta los documentos del editor con física real y reutiliza geometría/mecanismos del motor, pero **no sustituye el controlador de temporada ni acredita todavía el render de producción**. `season.mjs` transforma trazados, configura parrillas globales y usa reglas diferentes. Para producir este diseño habrá que usar su snapshot aprobado y los movimientos del ensayo elegido, o completar la integración equivalente; no regenerar una pista distinta en silencio.

Cada cálculo corre en un proceso aislado bajo el bloqueo compartido de `scripts/factory.mjs`. Solo hay un ensayo activo por servidor, puede cancelarse y tiene un límite de tres minutos de proceso (incluida espera del bloqueo), con memoria de Node acotada. Resultados parciales o fallidos no se ofrecen como completos. Un reinicio marca trabajos abandonados como interrumpidos. El límite de 180 s es del ensayo, no un recorte de vídeos máster.

No hay endpoints de render, YouTube, Cloud ni despliegue. «Diseño acordado» no equivale a aprobar producción o publicación. Sigue vigente `AUDIT-2026-10-25.md`.

## Cómo trabajamos juntos

1. Diseña y deja notas sobre las piezas. Espera «Guardado».
2. En este chat, pide: «Revisa el proyecto Valle Esmeralda y sus notas» o usa «Ficha para Codex».
3. Codex puede leer/modificar el JSON de `designs/` y construir la geometría/lógica que falta. No hay un agente ni un chat automático oculto en la web.
4. Tras cambios desde fuera, usa «Mis proyectos → Recargar guardado». Si había cambios locales se descarga una copia antes de recargar. Un conflicto nunca se resuelve sobrescribiendo silenciosamente.

## Persistencia y concurrencia

- Proyectos actuales: `designs/<uuid>.json`. Biblioteca personal: `designs/library.json`. Son archivos normales que pueden versionarse en Git; no se suben automáticamente.
- Historial previo a cada guardado: `designs/history/<uuid>-r<N>.json`, ignorado por Git. Restaurar una revisión requiere leerla, revisarla e importarla como nuevo proyecto o actualizar el documento mediante la API.
- Hay también una copia de recuperación en el navegador para cambios aún sin guardar. La copia de archivos del Mac es la referencia compartida.
- PUT exige revisión y hash del documento cargado. El servidor relee el archivo justo antes de escribir y hace rename atómico. Detecta cambios de otras ventanas y ediciones desde Codex, incluso sin incremento de revisión.
- Para editar vía API: GET `/api/projects/<id>`, modificar el documento y PUT con `revision` y `_etag` recibidos; incluir `Origin: http://127.0.0.1:8081` y JSON. `_etag` no se guarda en disco. Las operaciones de escritura desde otros orígenes se rechazan.
- Un editor externo debe preferir la API. Si modifica archivos directamente, escribir atómicamente, validar con `validateProject`, incrementar `revision` y conservar copia del anterior. No escribir durante otra edición activa sin coordinar el conflicto.
- Exportar incluye las definiciones de piezas propias usadas por el proyecto. Importar crea un ID nuevo y nunca sustituye un proyecto existente.

`DESIGNER_PORT` y `DESIGNER_DATA_DIR` permiten arrancar una instancia aislada para pruebas. No ejecutar dos servidores sobre el mismo directorio de datos; el bloqueo optimista está diseñado para una instancia con varias ventanas.

## Comprobación

`npm run designer:test` verifica esquema, persistencia, historial, importación/exportación, conflictos simultáneos y por edición externa, rechazo de otros orígenes y ausencia de acceso a secretos. La prueba UI local usa Playwright instalado en el workspace y datos temporales, no los proyectos del usuario: `.tools/test-designer-ui.mjs` (desde `Races`).

Atajos: ⌘/Ctrl+S guarda; ⌘/Ctrl+Z deshace; ⇧⌘/Ctrl+Z rehace; Escape cancela colocación; Suprimir retira la selección cuando no se está escribiendo.

## Verificación

`npm run designer:test` prueba el modelo, guardado, conflicto entre ventanas, API de ensayos, snapshots, cancelación y recuperación. Las pruebas físicas se serializan con el bloqueo compartido: repetibilidad, gravedad, choques, desplazamiento/escala, altura de barrera, mecanismos, vueltas y checkpoints. Los adaptadores nuevos verifican con rayos huecos reales y garganta abierta, paso por el vórtice, vuelo/aterrizaje, viento, puertas, escala cinemática y validación de solapes. El navegador se comprueba con los scripts locales `.tools/test-designer-ui.mjs` y `.tools/test-designer-physics-ui.mjs` y `.tools/test-designer-adapters-ui.mjs` en el directorio padre, usando proyectos temporales.

## Video Library / Producciones

Abre `http://127.0.0.1:8081/#productions`. Puedes buscar versiones, filtrar estados, reproducir los originales locales, copiar rutas y navegar entre las publicaciones y sus archivos candidatos. Cambiar de sección conserva el proyecto y el autoguardado.

### Verificación de Google Cloud y YouTube

**Verificar Cloud + YouTube** consulta ambos servicios con las sesiones existentes de este Mac. No modifica contenido remoto ni descarga vídeos. **Actualizar vista** solo relee archivos locales y los últimos resultados. No hay consultas automáticas al abrir la página, temporizadores de comprobación remota ni uploads.

- Cloud: usa `gcloud auth print-access-token` y la API JSON de Storage para listar todas las páginas de `elias-marmot-races`. Guarda únicamente metadatos de vídeo: nombre, bytes, fecha, generación, MD5 cuando existe y CRC32C. Credenciales, sesiones de upload y otros objetos quedan excluidos.
- YouTube: renueva en memoria el acceso con `.youtube-client.json` y `.youtube-token.json`, comprueba que la autorización pertenece al canal `UC58QJgyNGyZTJ36z3IgPocg` (@MarbleFormula), recorre su playlist de uploads y consulta `videos.list` en lotes de 50. Incluye los IDs históricos conocidos aunque no aparezcan en la playlist. Conserva visibilidad, estado de subida/procesamiento y los metadatos del original que devuelve YouTube.
- Solo usa lecturas de contenido remoto; el único POST a Google es el intercambio OAuth para renovar el acceso. No importa ni ejecuta el uploader. No expone tokens al navegador ni los escribe en el caché.
- Cada servicio tiene fecha de último éxito y último intento, con error independiente. Un fallo no borra el último resultado válido. Una consulta incompleta o una paginación repetida no sustituye el inventario anterior. Peticiones simultáneas comparten el trabajo; hay un intervalo mínimo de 15 segundos entre arranques.
- La comprobación se inicia mediante POST `/api/productions/verify`, protegido por Host, Origin y JSON. Devuelve 202 y la UI consulta GET `/api/productions/verification` mientras dura ese trabajo. GET `/api/productions` devuelve el catálogo sin provocar llamadas externas.
- El caché local ignorado es `designs/.productions/remotes.json` (permisos 0600), bajo `DESIGNER_DATA_DIR` si se especifica otro directorio. Persiste los resultados tras reinicios; no se sirve directamente como archivo estático.

Si caduca Cloud, ejecutar `gcloud auth login`. Si caduca YouTube, `npm run upload:auth` y seleccionar @MarbleFormula. La biblioteca muestra el error y conserva el último resultado; no abre autorizaciones interactivas automáticamente. Los scopes actuales del uploader son más amplios, pero la biblioteca solo implementa lecturas.

### Correspondencias y estados

- Nombre original + bytes coincidentes: correspondencia de metadatos, no comprobación criptográfica.
- Tamaño exacto único sin nombre: **original candidato**, con ruta y número exacto de bytes. No se declara identidad binaria.
- Varias rutas posibles: **ambiguo**, sin seleccionar una automáticamente. Nunca se adivina por título, temporada o parecido del nombre.
- Sin tamaño/original disponible: queda sin localizar. Se pueden inspeccionar los candidatos y volver desde el archivo a todas sus publicaciones relacionadas, incluidos uploads duplicados.
- Un vídeo con visibilidad pública pero procesamiento pendiente se muestra como **procesando**, no como publicación completada. Privado, no listado, error y un ID no devuelto por la API tienen estados separados. No devuelto no demuestra por sí solo que un vídeo haya sido eliminado.
- Ninguna correspondencia aprueba una publicación ni mueve un archivo a una cola de subida.

Las definiciones de los metadatos están en la [referencia de vídeos de YouTube](https://developers.google.com/youtube/data/reference/rest/v3/videos) y la [API de objetos de Cloud Storage](https://docs.cloud.google.com/storage/docs/json_api/v1/objects).

### Fuentes locales y fallback

- `$VIDEO_OUT` (por defecto `~/GoogleCloud`): carpeta local, sin seguir symlinks. Reproducción original mediante `/api/productions/<id>/media`, con HTTP Range/HEAD y sin rutas arbitrarias del cliente.
- `../.tools/gcloud-bucket-inventory.json`: snapshot inicial, usado hasta el primer éxito de la API. `DESIGNER_CLOUD_INVENTORY` permite un inventario alternativo en pruebas.
- `HANDOFF.md` y registros `out/**/uploaded.json` / `out/**/*-uploaded.json` de ambos repositorios: historial inicial. Los resultados actuales de YouTube prevalecen cuando están disponibles.
- `out/tcr/*/ready.json`: preparaciones sin vídeo local, sujetas a revisión del motor y reglamento.
- Verificación/revisión de Alpes manga 1: integridad técnica registrada, correcciones editoriales y validación humana pendiente. No se recalcula su checksum al abrir la biblioteca. Igual ruta relativa y tamaño agrupan ubicaciones local/Cloud sin acreditar identidad binaria.

La biblioteca no permite aprobar, renderizar, subir, archivar ni borrar vídeos. No hay cola de subida aprobada importada. Pruebas/previews se identifican por sus rutas; los archivos desconocidos conservan ese estado.

Pruebas desde este repositorio: `node --test designer/production-remote.test.mjs designer/productions.test.mjs designer/server.test.mjs`. Los ensayos de navegador del workspace están en `../.tools/test-productions-ui.mjs` (proyectos temporales, sin consultas remotas) y `../.tools/test-production-connections-ui.mjs` (consulta real de solo lectura sobre el servidor local).

## YouTube Analytics (2026-10-25)

Open `http://127.0.0.1:8081/#analytics` → **Conectar Analytics** → choose an approved Google account that manages @MarbleFormula → grant `youtube.readonly` and `yt-analytics.readonly` → **Actualizar Analytics**. This uses a separate ignored `.youtube-analytics/.youtube-token.json` (0600), loopback callback port 8898, state and PKCE; the uploader token is preserved. The channel ID is checked before saving. The OAuth app is currently in testing mode: a 403 `access_denied` saying access is limited to testers requires an approved account, or the project owner adding the intended account under Google Auth Platform → Audience → Test users. Do not publish the app or broaden Cloud IAM as a workaround. OAuth authorization is separate from enabling YouTube Analytics API in the client's Cloud project.

The dashboard reads channel and per-video views, watch minutes/hours, average view duration/percentage, subscriber gains/losses and retention. It compares a rolling 28 complete Pacific calendar days with the preceding 28, and exposes first-7/first-28 calendar-day windows only when the daily report reaches their end date. These are not exact elapsed-hour cohorts. Empty or privacy-limited reports are unavailable, never invented zeros. Failed refreshes preserve the last successful snapshot with its date and an error. Cache and manually transcribed Studio audience readings live in ignored `designs/.productions/analytics.json` and `audience.json` with 0600 permissions. Opening the tab reads local data; remote reads require Refresh.

Returning-viewer counts are **not a documented Analytics API metric**. The main strategy card links to Studio Audience and accepts explicitly manual, dated 28-day counts. Retention ratios above 100% are preserved (rewatched segments); they do not mean returning viewers. CTR is reviewed in Studio. Series classification is a title-based hint, not a verified editorial label. Compare similar formats and durations; three mature episodes are a planning threshold, not statistical proof.

The strategy section tracks the returning-audience objective, comparable release windows and approved release cadence. It does not schedule, upload, edit videos or archive to Cloud. Tests: `node --test designer/analytics*.test.mjs designer/server.test.mjs`; workspace browser fixture `.tools/test-analytics-ui.mjs` checks escaped titles, missing data, retention scaling, manual persistence, navigation and mobile layout. Fixtures stay in temporary folders.

Saved replay links may include `?project=<project-id>&simulation=<simulation-id>#design`. They only load simulations in that project's history; current engine, matching project etag and clean draft checks remain mandatory. The fresh car replay `3afadab6-78e2-44cd-a6bf-f7ec05d5d345` for project `97749ddf-ebcd-44df-aa7c-5746fa5211ad` demonstrates the editor controller, not the production renderer: three finishers, two eliminated and Austria stalled. Do not represent this as production approval.


### Preview de coches con el renderer de producción (Rapier v3)

El nuevo comando reutiliza el **snapshot físico guardado**, el interpolador del editor y los modelos detallados de coches de `src/gp/CarModel.tsx`. No vuelve a simular ni modifica los datos de temporada. El render es nativo 3840×2160 a 60 fps; interpola la telemetría de 30 fps calculada a 120 Hz. Incluye dos segundos de parrilla, toda la carrera y tres segundos de resultados, con audio sintetizado de revisión.

```sh
npm run render:racecraft -- --simulation <UUID>            # validar y preparar
caffeinate -dimsu npm run render:racecraft -- --simulation <UUID> --render
```

Exige un ensayo actual de coches, diseño sin cambios, tres checkpoints y todos los participantes finalizados o eliminados. Rechaza bloqueos, caídas, tiempos agotados y snapshots antiguos. Usa el bloqueo compartido; no ejecutar otros bakes mientras renderiza. Guarda MP4 exclusivamente en `$VIDEO_OUT`, primero como parcial y después de verificar 4K60, número exacto de fotogramas, audio y decodificación completa. Conserva los existentes sin sobrescribirlos. `out/racecraft/<UUID>/manifest.json` registra hashes de física, snapshot, resultado, renderer y vídeo; la biblioteca identifica el archivo por ruta/tamaño y lo presenta como **pendiente de revisión**, nunca aprobado por estos controles.

Rapier v3 excluye los chasis de otros participantes de los rayos de suspensión. Antes una rueda podía apoyarse en el techo de otro coche y volcarlo; se mantienen las colisiones entre chasis. La regresión de seis coches verifica estabilidad, las tres eliminaciones, todos en meta sin eliminaciones y repetibilidad. No hay rescates ni imposición de velocidad.

Este puente es para previews de coches del editor. El controlador antiguo de `season.mjs` y el campeonato TCR no se han migrado; Alpes conserva sus correcciones pendientes. El render reproduce suelo, obstáculos y vehículos físicos; la decoración conceptual del editor no está completamente integrada. Revisar física, cámaras, sonido y estilo antes de una producción larga. Render, aprobación, subida a YouTube y archivo Cloud siguen siendo pasos independientes.

### Dirección de cámaras y versiones de revisión

`npm run render:racecraft -- --simulation <UUID> --take camera-review --render` conserva la física y crea otro vídeo para comparar cámaras sin sobrescribir el preview anterior. Cada toma usa un subdirectorio propio en `out/racecraft/` y registra `camera-plan.json` con sujetos y motivo del plano. El director se basa en participantes activos, batalla, adelantamiento, incidente, checkpoint y ventanas de meta. No sigue a un país fijo ni conoce al ganador para decidir la cobertura normal. La meta usa el mismo plano de cruce que la geometría guardada. El nuevo vídeo aparece como **Coches · Cámaras y meta · Preview 4K**, pendiente de revisión. Consultar `CAMERA-AUDIT-2026-10-25.md` para el alcance y las limitaciones.
