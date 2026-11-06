import test from 'node:test';
import assert from 'node:assert/strict';
import {zoomBlurSamples,sceneBlurSamples} from '../src/gp/camera-exposure.js';

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

test('recorded Tuscany chase turn resolves doubled village edges with a fixed 52 degree lens',()=>{
 // Exact recorded camera neighbours9599–9601 around native frame11520.
 const rows=[[35.496,-49.384,13.349,31.519,-51.299,14.095],[35.459,-49.392,13.386,31.409,-51.305,14.232],[35.421,-49.401,13.424,31.303,-51.31,14.37]];
 const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t),shot=r=>({pos:r.slice(0,3),target:r.slice(3),fov:52,kind:'chase'});
 const before=shot(mix(rows[0],rows[1],.825)),after=shot(mix(rows[1],rows[2],.175));
 const native=sceneBlurSamples(2,before,after,3840,2160);
 assert.ok(native>=8&&native<=32,'recorded camera turn still uses two discrete exposures');
 assert.ok(native>sceneBlurSamples(2,before,after,1280,720));
 assert.equal(sceneBlurSamples(2,before,before,3840,2160),2,'static architecture unnecessarily supersampled in time');
 assert.equal(sceneBlurSamples(2,before,{...after,kind:'side'},3840,2160),2,'hard cut interpolated into another shot');
});
