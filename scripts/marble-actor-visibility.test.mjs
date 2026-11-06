import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {marbleActorVisibility} from '../src/gp/marble-actor-visibility.js';
const saved = JSON.parse(fs.readFileSync(new URL('./fixtures/jaipur-foreground-camera.json', import.meta.url)));

test('recorded Jaipur pack hides SWE from the old camera despite a clear scenery ray', () => {
  const result = marbleActorVisibility(saved.camera.slice(0, 3), saved.poses[saved.subject], saved.radius, saved.poses);
  assert.equal(result.visible, false);
  assert.equal(result.blocked, 9);
  assert.equal(result.cameraInsideActor, false);
  const head = saved.poses[saved.subject];
  assert.equal(marbleActorVisibility([head[0] + 3, head[1] + .3, head[2]], head, saved.radius, saved.poses).visible, true);
});

test('actors behind the subject or camera do not block; partial passes are permitted', () => {
  const from = [0, 0, 0], target = [0, 0, 10];
  assert.equal(marbleActorVisibility(from, target, .35, [target, [0, 0, 12], [0, 0, -2]]).visible, true);
  assert.equal(marbleActorVisibility(from, target, .35, [target, [.38, 0, 5]]).visible, true);
  assert.equal(marbleActorVisibility(from, target, .35, [target, [0, 0, 5]]).visible, false);
  assert.equal(marbleActorVisibility(from, target, .35, [target, [.1, 0, 0]]).cameraInsideActor, true);
});
