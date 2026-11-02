# Diseños compartidos del taller

Estos JSON son el punto de encuentro entre el editor local Racecraft y Codex. Los archivos actuales pueden versionarse; `history/` conserva copias locales previas a cada guardado y está ignorado por Git.

No contienen simulaciones validadas ni autorizaciones para renderizar o publicar. Lee `../designer/README.md` antes de modificar archivos o integrar un diseño en el motor.

Los ensayos físicos se guardan en `.simulations/` (ignorado): `<id>.input.json` conserva el snapshot y `<id>.result.json` los movimientos, eventos y resultados. `<id>.job.json` conserva estado, revisión y huellas. Estos ensayos no aprueban producción; no se sincronizan a Cloud.
