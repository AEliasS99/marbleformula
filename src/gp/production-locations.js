import {CIRCUITS} from './circuits/index.js';
import italy from './circuits/r8-tuscany.js';
import germany from './circuits/r9-blackforest.js';
import france from './circuits/r11-provence.js';
import austria from './circuits/r12-wachau.js';
import india from './circuits/r13-jaipur.js';
import britain from './circuits/r10-britain.js';
import spain from './circuits/r6-barcelona.js';
import colombia from './circuits/r7-coffeeandes.js';
const locations={france:{id:france.id,label:'Francia',host:'FRA',round:france,roundNumber:11},britain:{id:britain.id,label:'Gran Bretaña',host:'GBR',round:britain,roundNumber:10},germany:{id:germany.id,label:'Alemania',host:'DEU',round:germany,roundNumber:9},italy:{id:italy.id,label:'Italia',host:'ITA',round:italy,roundNumber:8},alps:{id:'r1-monaco',label:'Alpes',host:'CHE'},tokyo:{id:'r5-monza',label:'Tokyo',host:'JPN'},cairo:{id:'r2-silverstone',label:'Cairo',host:'EGY'},sydney:{id:'r3-spa',label:'Sydney',host:'AUS'},newyork:{id:'r4-suzuka',label:'New York',host:'USA'},spain:{id:spain.id,label:'España',host:'ESP',round:spain},colombia:{id:colombia.id,label:'Colombia',host:'COL',round:colombia,roundNumber:7}};
// Prioritize unused settings; completed Spain/Alpes/Tokyo/Colombia stay in the
// registry for explicit revisits, outside this new-production queue.
// Austria is explicitly prepared as a marble exhibition. Do not silently add
// it to the car tour before its own car physics and native proofs exist.
locations.austria={id:austria.id,label:'Austria',host:'AUT',round:austria,roundNumber:12};
locations.india={id:india.id,label:'India',host:'IND',round:india,roundNumber:13};
export const HOST_TOUR=Object.freeze(['cairo','sydney','newyork','italy','germany','britain','france']);
const tourCountries=['ESP','JPN','EGY','AUS','USA','CHE','BRA','ARG','AUT','DEU','ITA','GBR','MEX','NLD','FRA','BEL','SWE','CAN','CHN','POL','IRL','DNK','IND','COL'];
export function hostFirstCountries(location,countries){
 const host=productionLocation(location).host,codes=(Array.isArray(countries)?countries:countries.split(',')).map(c=>c.trim().toUpperCase());
 if(![6,10,12].includes(codes.length)||new Set(codes).size!==codes.length)throw Error('Host grid needs 6, 10 or 12 distinct countries');
 if(codes.some(c=>!tourCountries.includes(c)))throw Error('Unknown tour country');
 return [host,...codes.filter(c=>c!==host)].slice(0,codes.length);
}
export function tourRacePlan(previousLocation,seed){
 if(!Number.isInteger(seed)||seed<0)throw Error('Tour uses the next sequential fixed seed');
 const i=HOST_TOUR.indexOf(previousLocation);if(!locations[previousLocation])throw Error('Unknown previous host');
 if(i===HOST_TOUR.length-1)throw Error('Unused host tour completed; design another country before repeating a completed setting');
 const location=HOST_TOUR[i+1],host=productionLocation(location).host;
 const rest=tourCountries.filter(c=>c!==host),offset=seed%rest.length;
 return {location,host,seed,variant:'world-rush',countries:[host,...rest.slice(offset),...rest.slice(0,offset)].slice(0,12)};
}
export function productionLocation(name='alps') {
  const place=locations[name];if(!place)throw Error('Unknown production location');
  return {...place,name,round:place.round??CIRCUITS.find(c=>c.id===place.id),roundNumber:place.roundNumber??(place.round?CIRCUITS.length+1:CIRCUITS.findIndex(c=>c.id===place.id)+1)};
}
export function productionReviewIdentity(location,heat,take,seed) {
  const place=productionLocation(location);
  if(!/^[1-4]$/.test(String(heat))||!/^[a-z][a-z0-9-]{0,32}$/.test(take)||!Number.isInteger(seed)||seed<0)throw Error('Invalid review identity');
  return {name:`${place.name}-heat${heat}-${take}-seed${seed}`,folder:place.name==='alps'?'out/tcr/alps-review':'out/tcr/track-review',composition:place.name==='alps'?'Alps-Evolution-4k':`${place.name[0].toUpperCase()+place.name.slice(1)}-Race-4k`};
}
