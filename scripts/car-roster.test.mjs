import test from 'node:test';
import assert from 'node:assert/strict';
import {selectCarCountries} from '../src/gp/car-roster.js';
const countries=['ESP','BRA','ARG','AUT','JPN','DEU','ITA','GBR','MEX','NLD','FRA','USA'];
const all=countries.map((abbr,i)=>({abbr,flag:abbr,stats:{vel:i},color:`color-${i}`}));
test('a fresh heat uses the actual established cars and preserves country order and stats',()=>{
 const selected=selectCarCountries(all,' ita, gbr,MEX,NLD,FRA,USA');
 assert.deepEqual(selected.map(car=>car.abbr),countries.slice(6));
 assert(selected.every(car=>all.includes(car)));
 assert(!selected.some(car=>countries.slice(0,6).includes(car.abbr)));
});
test('unknown countries cannot silently disappear or be substituted',()=>{
 assert.throws(()=>selectCarCountries(all,'ITA,GBR,MEX,NLD,FRA,ZZZ'),/Unknown car country/);
});
test('custom heats reject duplicate or incomplete lineups',()=>{
 for(const input of ['ITA,GBR,MEX,NLD,FRA,ita','ITA,GBR,MEX','ITA,GBR,MEX,NLD,FRA,'])
  assert.throws(()=>selectCarCountries(all,input));
});
