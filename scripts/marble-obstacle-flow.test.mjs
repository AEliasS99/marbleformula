import test from 'node:test';import assert from 'node:assert/strict';import{marbleObstacleFlow}from'./marble-obstacle-flow.mjs';
const fixture=()=>({fps:10,info:{length:100,laps:1,finish:90},features:[{type:'bumpers',u:10}],timeline:{raceStart:0},marbles:[{abbr:'ITA',finishFrame:null,dqFrame:null}],frames:Array.from({length:80},(_,f)=>[[f*.5,.35,0,0,0,0,1,f*.5]])});
test('pinball dwell is measured independently from saved progress even without diagnostic counters',()=>{
 const healthy=fixture();assert.ok(marbleObstacleFlow(healthy).passed);
 const blocked=fixture();blocked.frames.splice(25,0,...Array.from({length:40},()=>[blocked.frames[25][0].slice()]));const report=marbleObstacleFlow(blocked);
 assert.equal(report.passed,false);assert.equal(report.blocked.length,1);assert.ok(report.blocked[0].seconds>5);
 assert.equal(blocked.marblePhysicsDiagnostics,undefined,'test must not trust self-reported zero stalls');
});
test('legitimate saved elimination is excluded, while unfinished non-eliminated jam stays failed',()=>{
 const d=fixture();d.frames=d.frames.slice(0,25);assert.equal(marbleObstacleFlow(d).passed,false);
 d.marbles[0].dqFrame=24;const r=marbleObstacleFlow(d);assert.equal(r.checkpointEliminations,1);assert.equal(r.blocked.length,0);
});
