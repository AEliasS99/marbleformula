# Barcelona Coast Rush

Standalone Spanish exhibition within the existing GrandPrix production. The official five-round season stays unchanged. `production-locations.js` registers `spain` separately, using the authored `r6-barcelona.js` outline. This is an original stylised Mediterranean setting, not a reconstruction of an official Barcelona circuit.

`spain-action.js` uses the actual baked road samples to position physical islands and acceleration strips. The initial design has eight islands, eight attack lanes and two sea-spray patches with dry outside alternatives. Linked bends and a long approach straight vary braking and line choices. The powered-road descent is1.5degrees (23.5m in the baked car course), rather than the marble engine’s default Alpine grade; the optional car-only setting leaves older circuits unchanged. The same assisted car engine, full chassis contacts, 360 showroom, three checkpoint eliminations, broadcast, finish/replay, audio and segmented native4K60 renderer remain in use. Outcomes are not selected; driver decisions and grip are seeded before the race.

`spain-scenery.js` builds Mediterranean villages, terracotta roofs, balconies, bell towers, palms, Spanish flags, coastal water and yachts from shared primitive descriptors. `spain-mesh.js` validates and merges their geometry by material; `SpainScenery.tsx` adds them to the existing Stage. `camera-occlusion.js` consumes those exact descriptors, including roof tapers and flags. Props use existing scenery placement and explicit road clearance; other country scenes/assets are preserved.

Activate the local environment first. Preparation must run through the shared factory lock, and exports go only to `$VIDEO_OUT`:

```sh
source ../activate.sh
node scripts/factory.mjs --shared-lock -- node scripts/prepare-alps-review.mjs 43 --location=spain --variant=coastal-action --heat=1 --take=costa-v1 --countries=ESP,FRA,ITA,GBR,MEX,JPN
```

Do not rerun an existing take or seed. First inspect `out/tcr/spain-costa-v1-job.json`, `out/factory/shared.lock` and HANDOFF.md. The current reviewed source is under `out/tcr/composition-inputs/spain-costa-v6`; read HANDOFF.md and its live manifest before acting. Older takes are retained diagnostic evidence and must not be restarted. Subsequent commands, camera/native-still gates, frozen-source hashes and current progress are in the handoff. Freeze the checked source and inspect native images before full rendering. Require all racers accounted for, no stalls/recoveries, three checkpoint gates, full body/island clearance and no unresolved framing/occlusion. Technical frame/audio/full-decode/missing-scene checks and exported-video inspection follow rendering.

The independent Unlisted uploader is a later step for remote user review. Public release, Cloud archival and deleting local masters require the established approvals. Preserve failed candidates and the fixed physics seed when correcting a layout/camera problem.
