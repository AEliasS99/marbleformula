import test from 'node:test';
import assert from 'node:assert/strict';
import {TEAMS,teamOf} from '../src/gp/teams.js';
import {marbleHostRoster} from '../src/gp/marble-presentation.js';
import {marbleProductionCountries} from './marble-production-profiles.mjs';

const countries=TEAMS.flatMap(t=>t.drivers);
test('explicit order uses the actual entrants and preserves every country and team',()=>{
 const roster=countries.map((abbr,i)=>({abbr,flag:abbr,color:`color-${i}`,stats:{i}}));
 const before=JSON.stringify(roster),requested=[...countries.slice(7),...countries.slice(0,7)];
 const checked=marbleProductionCountries({requested:requested.map(c=>c.toLowerCase()).join(', ')});
 const result=marbleHostRoster(roster,'AUT',checked);
 assert.equal(result[0],roster.find(m=>m.abbr==='AUT'));
 assert.deepEqual(result.slice(1).map(m=>m.abbr),requested.filter(c=>c!=='AUT'));
 for(const m of result){assert.equal(m,roster.find(r=>r.abbr===m.abbr));assert.ok(teamOf(m.abbr));}
 assert.equal(JSON.stringify(roster),before);
 assert.deepEqual(new Set(result.map(m=>m.abbr)),new Set(countries));
 assert.equal(marbleProductionCountries(),undefined);
 assert.equal(marbleHostRoster(roster),roster);
});
test('malformed and substituted country lineups fail before preparation',()=>{
 for(const requested of ['',null,69,countries.slice(1),[...countries.slice(1),'AUT'],[...countries.slice(1),'CHE'],[...countries,null]]){
  assert.throws(()=>marbleProductionCountries({requested}),/twenty actual team countries/);
 }
 assert.throws(()=>marbleHostRoster(countries.map(abbr=>({abbr})),'AUT',[...countries.slice(1),'AUT']),/every actual entrant/);
});
test('camera resume keeps the exact saved country indices and rejects reordered physics identities',()=>{
 const saved={marbles:countries.map(abbr=>({abbr}))},before=JSON.stringify(saved);
 assert.deepEqual(marbleProductionCountries({resume:true,saved}),countries);
 assert.deepEqual(marbleProductionCountries({resume:true,saved,requested:countries.join(',')}),countries);
 assert.throws(()=>marbleProductionCountries({resume:true,saved,requested:[...countries].reverse()}),/cannot change saved countries or order/);
 assert.throws(()=>marbleProductionCountries({resume:true}),/saved race metadata/);
 assert.equal(JSON.stringify(saved),before);
});
