# Auditoría de fiabilidad — 20 oct 2026

Revisión en profundidad de todo el código: bake (física), director de cámaras, renderer y fábrica. Cuatro revisiones independientes en solo lectura; los hallazgos críticos y altos se han comprobado contra los datos reales.

**Lo que está bien:** el bake es determinista (mismo resultado para la misma semilla, solo o tras otras semillas en el mismo proceso), no hay estado que se filtre entre carreras, el renderer pasa el chequeo de tipos estricto, las cámaras principales y de repetición son finitas, los planos cubren cada fotograma sin huecos, el escritor WAV es correcto y los textos de YouTube cumplen los límites.

## Críticos — rompen vídeos ya producidos

| # | Dónde | Problema | Prueba | Arreglo |
|---|---|---|---|---|
| C1 | `season.mjs` escalera (pared trasera, ~L952) | La pared trasera del hueco empieza a 1,1 sobre el muelle: por debajo está abierto y la pista termina hasta 0,5 antes del muelle. Hay canicas que caen por detrás al vacío. El bake no lo detecta (`stuck()` solo mira antes del final). | Datos actuales: Monaco pierde 6 canicas, Suzuka 7, Monza 2. | Pared trasera hasta abajo; muestra final exactamente en `END`; marcar DNF y fallar el bake si una canica acaba muy por debajo de la pista. |
| C2 | `directRace`, plano de escalera (~L2030) | El plano de la escalera absorbe cada viaje nuevo y se alarga hasta el final. | Un solo plano de 162 s en Silverstone y 154 s en Monza. | Limitar a 6–8 s y no prolongar por viajes absorbidos. |
| C3 | `factory-loop.sh`, `factory.mjs` | No hay bloqueo: parar el bucle deja la fábrica viva, y arrancarlo otra vez lanza una segunda fábrica sobre la misma temporada; se pisan los masters y `state.json`. | El proceso de la temporada 2 sigue vivo sin su bucle. | Lockfile con PID, grupo de procesos, `trap` y SIGTERM que mata a los hijos. |

## Altos

| # | Dónde | Problema | Arreglo |
|---|---|---|---|
| A1 | `season.mjs` cámaras de repetición (L2127) | Usan el progreso total (vuelta × L + u) en vez del de la vuelta: en las vueltas 2 y 3 la cámara se pone al final de la pista, a 25–150 de la canica. Afecta también al cold open. | `uLoc` en vez de `uOf`. |
| A2 | `season.mjs` parada de la escalera | Al pararse la escalera, la última canica se queda atrapada bajo la salida y nunca termina. | Contar la vuelta al salir del hueco; parar solo con los huecos vacíos. |
| A3 | `season.mjs` calibración de drenajes | Se calibra en una pasada con otra sincronía: objetivo 1, salen 4. | Calibrar con la misma sincronía y tope de `target` en la pasada final. |
| A4 | `GrandPrix.tsx` L54 | La mitad derecha de dos pantallas partidas seguidas conserva la cámara de la primera (sin `key`). | `key` por pantalla partida; cachear `splitView`. |
| A5 | `GrandPrix.tsx` L48–58 | Cada pantalla partida destruye y recrea todos los lienzos WebGL (~45 veces por vídeo; 2–3 contextos a la vez). Causa probable de los picos de memoria y fotogramas corruptos. | Mantener montado el lienzo principal; montar solo el derecho. |
| A6 | `factory.mjs` | El bundle no está ligado al bake: se construye después desde `src/gp/races`, que puede haber cambiado. Ya ha pasado en la temporada 2. | Bundle dentro del paso de bake; datos por temporada. |
| A7 | `factory.mjs` | `state.json` se sobrescribe sin escritura atómica; procesos con estado en memoria se borran las marcas. | Temporal + rename; volver a leer y fusionar. |
| A8 | `factory-loop.sh` | Reintenta cualquier fallo cada 10 min para siempre. | Contador de fallos, espera creciente y marca FAILED. |

## Medios

| # | Dónde | Problema |
|---|---|---|
| M1 | `season.mjs` colocación automática | Crestas, rodillos, etc. pueden caer sobre las aletas y la paleta (Silverstone: cresta en 427 encima de las aletas). Reservar `END−18…END`. |
| M2 | `season.mjs` planificador | Para circuitos sin diseño, coloca tubos de longitud 0, crestas y boosters, y aún puertas de reagrupamiento. |
| M3 | `directRace` foco | El grupo seguido salta 20–300 unidades a mitad de plano y la cámara cruza el circuito en 1,4 s. Forzar corte en esos saltos. |
| M4 | `race.ts`, `Effects.tsx` | El desenfoque de movimiento mezcla dos cámaras en cada corte (doble exposición en el primer fotograma de cada plano). |
| M5 | `Stage.tsx` | `antialias: true` reserva ~265 MB por lienzo en 4K que no se usan. |
| M6 | `Scene.tsx`, `Machines.tsx` | Objetos three.js globales retienen cada renderer muerto. |
| M7 | `Intro.tsx` | El showroom no libera las texturas de cada equipo (~110 MB). |
| M8 | `factory.mjs` | `garbled()` da 0 si el chequeo falla por cualquier motivo; `check-frames.py` no sirve para el Short vertical. |
| M9 | `factory.mjs` | `--only` no invalida los pasos que dependen; sweep y bake son de toda la temporada; el bake no se compara con la elección del sweep. |
| M10 | `factory.mjs` | Sin timeouts: un Chrome o ffmpeg colgado para la fábrica para siempre. |
| M11 | `factory.mjs` | Los títulos no llevan la temporada: todas las temporadas se titulan igual. |

## Bajos

Ganadores parados en el muelle que se solapan (fantasmas); el peralte se cuela en las zonas que deberían ser planas; Monaco y Suzuka comparten la misma secuencia aleatoria con la misma semilla; grano de película dependiente del reloj real; insignias de líder desplazadas en vertical; pistones de la salida reconstruidos cada fotograma; código muerto de ascensor, reagrupamiento e interruptor; guardas que no protegen; vídeo con fotogramas corruptos tras dos intentos marcado como bueno; 7 GB de temporales de Remotion; `render-round.sh` sin `set -e`; etiquetas duplicadas; fuente de reserva de 10 px en la miniatura.

## Orden de arreglo propuesto

1. C1, A2, C2, A1 — la carrera y las cámaras (re-bake).
2. A4, A5, M5, M6, M7 — memoria y pantallas partidas del renderer.
3. C3, A6, A7, A8, M8, M10 — fábrica desatendida a prueba de fallos.
4. Medios y bajos restantes; luego validar con un vídeo completo de Monaco.
