# Italian craft: first Runpod AI asset batch

These reusable assets extend the existing Marble Formula production. They do not replace the renderer, saved physics, race camera, flags, results or contact soundtrack. Race rendering remains local on the Mac. No complete new episode was exported by this asset task.

## Actual outputs

- FLUX.2-klein-base-4B, BF16 without quantization, generated four native 2048-square images, fixed seeds 70501–70504. Exact prompts, model revision, durations and hashes are in `source/generation.json`. The column reference includes a complete shaft/base despite requesting a capital; the result is correctly described as a column.
- Roman travertine, oak and bronze source images were prepared into base-colour/normal/roughness packs under `public/materials/ai/italian-craft-v1`. The base colour is AI-generated and processed in linear light for periodic repetition. Normals and roughness are independent authored estimates, not measured or AI-inferred physical PBR. Each pack records this distinction and its hashes in `source.json`.
- Original Microsoft TRELLIS-image-large generated the textured column GLB, fixed seed 70511: 26,382 vertices, 38,938 triangles. Source and weights revisions, timings, memory use and exact GLB hash are in `source/column-generation.json`. Geometry inference took 14.93 seconds; export took 56.49 seconds, excluding model/dependency preparation. This was **not TRELLIS.2**.

## Integration and review scope

`info.aiMaterialProfile: "italian-craft-v1"` explicitly enables travertine on the existing Roman gallery stone parts. Their small inset bevels remain within the original collider bounds. Historical saved races keep their prior appearance. Native A/B images use identical actual Tuscany geometry, camera, lighting and exposure. The accepted scanned timber remains the production baseline; oak and bronze are candidates and have not replaced it. The bronze source contains shading/border contamination; a passing seam metric alone does not approve it.

`sceneProps` records explicitly place decorative columns through the established Stage. Shape and floor normalization live inside the frozen source tree in `src/gp/assets/italian-column-v1.json`; the exact same triangles and transforms are used in camera occlusion, live direction and replay. Road exclusion checks every sampled road segment conservatively across all elevations. The prop is not watertight and must not become a physical racing surface or a load-bearing mechanism. Frozen preparation includes prop textures and material maps, and rendering rejects an active AI scene lacking its frozen assets.

The initial native column appearance was rejected: TextureLoader flipped the extracted GLB image against its unchanged UV atlas. It was corrected to the original glTF image convention and a regression now exercises actual atlas coordinates. Rejected images are preserved. Four corrected native views were individually inspected. Carving and texture registration are visible; front/back shadowed views lose detail and the baked colour may retain source lighting. Further lighting/material and moving-footage review remains required. It is not approved as premium finished-episode art merely because tests or stills pass.

No AI prop/profile has been inserted into a historical master or the held India70 race. The two-column Tuscany piazza arrangement is an internal placement study, not a new raced circuit or editorial deliverable. The column GLB and material maps are reusable actual outputs; native component inspection is supporting evidence.

## Resource and provenance notes

The replacement A40 Pod was stopped after the returned image/GLB hashes were verified. The existing US$10 pilot cap was continued, not reset. Operational receipts, cost checks, guardian state, rejected attempts and 4K inspection images remain in `out/ai-enrichment-20261105`. The bounded guardian retains the original temporary-storage cleanup deadline. Local masters and assets are preserved.

Official model sources: https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4B and https://github.com/microsoft/TRELLIS. TRELLIS code/weights use MIT; this is model provenance, not a claim that the generated artwork has independently been relicensed. Hunyuan3D-2.1 was not used after reviewing its territorial terms. TRELLIS.2 was not used because required gated dependencies lacked authorized access. No access restrictions were bypassed.
