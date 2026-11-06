import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {marbleChallengeAudit} from './marble-challenge-audit.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/india70-recorded-lane-bypass.json',import.meta.url)));

test('actual India70 airborne lane crossings remain rejected despite fast completed transit',()=>{
 for(const {country,data,expectedReason} of fixture.cases){
  const report=marbleChallengeAudit(data);
  assert.equal(report.passed,false,country+' must not be admitted from completion alone');
  const failure=report.failures.find(f=>f.reason===expectedReason);
  assert.ok(failure,country+' must fail actual recorded lane occupancy');
  assert.ok(failure.bypassSamples>0);
  assert.ok(failure.exit!==null&&failure.seconds<8,'Fast completion is not sufficient physical validation');
 }
});
