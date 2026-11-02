import test from 'node:test';import assert from 'node:assert/strict';
import {HOST_TOUR,tourRacePlan,hostFirstCountries} from '../src/gp/production-locations.js';
import {EXHIBITION_CARS} from '../src/gp/car-roster.js';
import {carShowcasePlan,productionIntro} from '../src/gp/car-showcase.js';
test('next fixed seeds use unused host settings, with each host first and no automatic repeat',()=>{
 let last='colombia';const seen=[];
 for(let seed=61;seed<61+HOST_TOUR.length;seed++){
  const p=tourRacePlan(last,seed);assert.equal(p.seed,seed);assert.notEqual(p.location,last);assert.equal(p.countries.length,12);assert.equal(new Set(p.countries).size,12);assert.equal(p.countries[0],p.host);seen.push(p.location);last=p.location;
 }
 assert.deepEqual(seen,HOST_TOUR);assert.equal(tourRacePlan('colombia',61).host,'EGY');
 for(const completed of ['spain','alps','tokyo','colombia'])assert.equal(tourRacePlan(completed,61).location,'cairo');
 assert.equal(tourRacePlan('italy',65).host,'DEU');
 assert.equal(tourRacePlan('germany',66).host,'GBR');
 assert.equal(tourRacePlan('britain',68).host,'FRA');
 assert.throws(()=>tourRacePlan('france',69),/design another country/);
});
test('host ordering never changes supplied entrants when the host is present, or the source list',()=>{
 const codes=['BRA','ARG','ESP','JPN','DEU','ITA'];const before=[...codes];assert.deepEqual(hostFirstCountries('spain',codes),['ESP','BRA','ARG','JPN','DEU','ITA']);assert.deepEqual(codes,before);
 assert.throws(()=>hostFirstCountries('spain','BRA,ARG,JPN,DEU,ITA,ZZZ'));assert.throws(()=>hostFirstCountries('spain','ESP,ESP,BRA,ARG,DEU,ITA'));
 for(const code of ['CHE','EGY','AUS']){const c=EXHIBITION_CARS.find(c=>c.abbr===code);assert.equal(c.stats.vel+c.stats.est+c.stats.int,10);}
});
test('short showcase preserves full per-car slots and historical presentation clocks',()=>{
 const next=carShowcasePlan(12);assert.equal(next.total,1200);assert.equal(next.carFrames,90);
 const past={vehicle:'car',carFrames:300,total:3840};assert.equal(productionIntro(past,true),past);assert.equal(past.total,3840);
});
