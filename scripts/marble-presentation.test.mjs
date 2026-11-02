import {test} from 'node:test';
import assert from 'node:assert/strict';
import {introPlan} from '../src/gp/intro-plan.js';
import {marbleRaceFirstIntro,knockoutCopy,marbleHostRoster,marbleShowroomTeams,marbleIntroSample} from '../src/gp/marble-presentation.js';
import {replaySubjectBounds,auditReplay} from './prepare-replay-camera.mjs';
const fixture=()=>({fps:60,round:1,info:{vehicle:'marble'},marbles:Array.from({length:20},()=>({finishFrame:12000})),
 timeline:{highlights:[{f:900,from:850,to:960,speed:.4,strength:12,feature:'hammer'},{f:11900,from:11800,to:12050,speed:.4,strength:100,feature:'finish'}]},highlightCams:[[[1],[2]],[[1],[2]]],
 checkpoints:[{survive:17},{survive:14},{survive:10}],results:Array.from({length:20},(_,i)=>({points:i<10?10-i:0})),frames:[[1,2]],cams:[[3,4]]});
const cards=[{type:'elevator',u:300},{type:'hammer',u:100},{type:'vortex',u:170},{type:'spinner',u:220}];
test('new clock keeps every team, two real machines and a safe action hook within32seconds',()=>{
 const d=fixture(),before=JSON.stringify(d),legacy=introPlan({round:1,L:330,highlight:1,cards,teams:10}),original=JSON.stringify(legacy);
 const p=marbleRaceFirstIntro(d,legacy);assert.equal(p.total,32*60);assert.equal(p.highlight,0);
 assert.equal(p.scenes.find(s=>s.id==='teams').frames/p.teamFrames,10);
 assert.deepEqual(p.cards.map(c=>c.type),['hammer','vortex']);assert.ok(p.cards.every(c=>c.to-c.from===240));
 assert.equal(JSON.stringify(d),before);assert.equal(JSON.stringify(legacy),original);
 assert.equal(p.scenes.at(-1).at+p.scenes.at(-1).frames,p.total);
});
test('later rounds keep stakes but avoid repeating all team presentations',()=>{const d=fixture();d.round=2;const p=marbleRaceFirstIntro(d,introPlan({round:2,L:330,highlight:null,cards,teams:10}));assert.equal(p.total,20*60);assert.ok(!p.scenes.some(s=>s.id==='teams'));assert.ok(p.scenes.some(s=>s.id==='stakes'));});
test('no valid highlight or no obstacles yields a complete clock without invalid cameras',()=>{const d=fixture();d.highlightCams=[];const p=marbleRaceFirstIntro(d,introPlan({round:1,L:330,highlight:null,cards:[],teams:10}));assert.equal(p.highlight,null);assert.ok(!p.scenes.some(s=>['cold','flyover'].includes(s.id)));assert.equal(p.total,21*60);});
test('rules reflect the saved checkpoints and actual points, including historical different formats',()=>{const d=fixture();assert.equal(knockoutCopy(d).summary,'3 elimination checkpoints (20 → 17 → 14 → 10) · Top 10 score points');delete d.checkpoints;assert.equal(knockoutCopy(d).summary,'20 countries · Top 10 score points');d.results=[];assert.equal(knockoutCopy(d).points,'Race classification');});
test('a car cannot accidentally opt into the marble clock',()=>{const d=fixture();d.info.vehicle='car';assert.throws(()=>marbleRaceFirstIntro(d,{}),/marble race/);});
test('intro motion blur cannot combine two different obstacle cameras across an editorial cut',()=>{
 const p=marbleRaceFirstIntro(fixture(),introPlan({round:1,L:330,highlight:0,cards,teams:10})),fly=p.scenes.find(s=>s.id==='flyover'),cut=fly.at+p.cards[1].from;
 assert.equal(marbleIntroSample(p,cut-.175),cut);assert.equal(marbleIntroSample(p,cut+.175),cut+.175);assert.equal(marbleIntroSample(p,cut-1+.175),cut-1+.175);assert.equal(marbleIntroSample({...p,profile:undefined},cut-.175),cut-.175);
});
test('host-first opt-in preserves countries, teams and their original objects',()=>{
 const roster=[{abbr:'ESP'},{abbr:'ITA'},{abbr:'JPN'}];assert.equal(marbleHostRoster(roster),roster);assert.deepEqual(marbleHostRoster(roster,'ITA'),[roster[1],roster[0],roster[2]]);assert.throws(()=>marbleHostRoster(roster,'ZZZ'));
 const teams=[{drivers:['ESP','JPN']},{drivers:['ARG','ITA']}],d={hostCountry:'ITA',intro:{profile:'marble-race-first-v1'}};
 const shown=marbleShowroomTeams(teams,d);assert.deepEqual(shown.map(t=>t.drivers),[['ITA','ARG'],['ESP','JPN']]);assert.deepEqual(teams[1].drivers,['ARG','ITA']);assert.equal(marbleShowroomTeams(teams,{}),teams);
});
test('marble replay uses its real sphere instead of inherited car class dimensions',()=>{
 const d={info:{vehicle:'marble'},marbleRadius:.2,marbles:[{finishFrame:12,stats:{cls:'BGY'}}],timeline:{replay:{at:0},results:{at:2}}};
 assert.deepEqual(replaySubjectBounds(d,0),{min:[-.2,-.2,-.2],max:[.2,.2,.2]});
 const race={marblePose:()=>({pos:[0,0,0],quat:[0,0,0,1]}),mainView:{tAt:f=>f},shotAt:()=>({pos:[0,1,3],target:[0,0,0],fov:42})};
 assert.ok(auditReplay(d,race,{blocks:()=>false}).passed);assert.ok(!auditReplay(d,race,{blocks:()=>true}).passed);
});
