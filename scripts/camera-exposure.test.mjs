import test from 'node:test';
import assert from 'node:assert/strict';
import {zoomBlurSamples} from '../src/gp/camera-exposure.js';

test('native UHD finish zoom resolves the real 3-degree-per-frame lens recovery', () => {
  const before = 64 + 3 * .175, after = 64 - 3 * .175;
  const samples = zoomBlurSamples(2, before, after, 3840, 2160);
  const travel = 1920 * Math.abs(Math.tan(before * Math.PI / 360) / Math.tan(after * Math.PI / 360) - 1);
  assert.ok(samples > 8);
  assert.ok(travel / (samples - 1) <= 2);
});
test('static lens and hard cuts keep existing exterior and cockpit quality', () => {
  assert.equal(zoomBlurSamples(2, 67, 67, 3840, 2160), 2);
  assert.equal(zoomBlurSamples(8, 55, 55, 3840, 2160), 8);
  assert.equal(zoomBlurSamples(2, NaN, 55, 3840, 2160), 2);
});
test('zoom exposure density follows output resolution and stays bounded', () => {
  assert.ok(zoomBlurSamples(2, 64.525, 63.475, 3840, 2160) > zoomBlurSamples(2, 64.525, 63.475, 1280, 720));
  assert.equal(zoomBlurSamples(2, 100, 10, 3840, 2160), 32);
});
