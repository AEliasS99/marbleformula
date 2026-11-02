import test from 'node:test';import assert from 'node:assert/strict';
import {carMotionReport} from './car-motion-report.mjs';
const fixture=(steps,modern=true)=>{let x=0;return {fps:60,timeline:{raceStart:0},marbles:[{finishFrame:null,dqFrame:null}],carConditions:{racecraft:modern?{boostModel:'lane-charge-v2',maximumSpeed:66,acceleration:14,braking:22,boostAccelerationMultiplier:10}:{}},boosters:[{accel:140}],frames:[[[0,0,0,0,0,0,1,0]],...steps.map(step=>{x+=step;return [[x,0,0,0,0,0,1,x]];})]};};
test('steady configured nitro motion exceeds 1m without a teleport',()=>assert.equal(carMotionReport(fixture([1.1,1.1,1.1])).passed,true));
test('speed beyond actual configured envelope fails',()=>assert.equal(carMotionReport(fixture([1.2,1.2])).passed,false));
test('abrupt jump below the speed cap still fails continuity',()=>assert.equal(carMotionReport(fixture([.4,1.09])).passed,false));
test('legacy guard is preserved',()=>{assert.equal(carMotionReport(fixture([.98,.98],false)).passed,true);assert.equal(carMotionReport(fixture([1.05],false)).passed,false);});
test('invalid recorded poses fail closed',()=>assert.equal(carMotionReport(fixture([NaN])).passed,false));
