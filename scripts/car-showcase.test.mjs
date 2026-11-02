import test from 'node:test';
import assert from 'node:assert/strict';
import {carShowcasePlan,carShowcaseAt,productionIntro} from '../src/gp/car-showcase.js';
test('production enables explicit car presentations without changing historical clocks',()=>{
  const old={total:300},cars=carShowcasePlan(6);
  assert.equal(productionIntro(old,true),null);
  assert.equal(productionIntro(null,true),null);
  assert.equal(productionIntro(old,false),old);
  assert.equal(productionIntro(cars,true),cars);
});
test('new presentations fit twelve full car revolutions into twenty seconds',()=>{
  for(const count of [1,6,10,12])for(const fps of [30,60]){
    const p=carShowcasePlan(count,fps);
    assert.equal(p.total,(count*1.5+2)*fps);
    assert.deepEqual(p.scenes.map(s=>s.at),[0,fps,(1+count*1.5)*fps]);
    for(let i=0;i<count;i++){
      const a=carShowcaseAt(i*p.carFrames,count,p.carFrames),b=carShowcaseAt((i+1)*p.carFrames-1,count,p.carFrames);
      assert.equal(a.index,i);assert.equal(b.index,i);
      assert.ok(Math.abs(b.angle-a.angle-2*Math.PI)<1e-12);
      assert.equal(a.progress,0);assert.equal(b.progress,1);
    }
  }
});
test('arbitrary frame ordering and segment boundaries preserve the orbit',()=>{
  const p=carShowcasePlan(6),frames=[0,179,180,299,300,479,900,1799];
  const expected=frames.map(f=>carShowcaseAt(f,6,p.carFrames));
  for(const i of [7,3,1,5,0,6,2,4])assert.deepEqual(carShowcaseAt(frames[i],6,p.carFrames),expected[i]);
  assert.equal(carShowcaseAt(-50,6,p.carFrames).index,0);
  assert.equal(carShowcaseAt(9999,6,p.carFrames).index,5);
  assert.throws(()=>carShowcasePlan(0));
});
