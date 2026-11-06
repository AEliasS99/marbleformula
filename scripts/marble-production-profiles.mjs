// Future production uses the repaired pipeline; an existing immutable take
// retains its declared profiles when only its cameras are resumed.
import {TEAMS} from '../src/gp/teams.js';
export function marbleProductionCountries({requested,resume=false,saved}={}){
 if(resume&&!saved)throw Error('Camera resume requires the saved race metadata');
 if(requested===undefined&&!resume)return undefined;
 const codes=requested===undefined?saved.marbles?.map(m=>m.abbr):
  (Array.isArray(requested)?requested:String(requested).split(',')).map(c=>typeof c==='string'?c.trim().toUpperCase():c);
 const actual=TEAMS.flatMap(t=>t.drivers);
 if(!Array.isArray(codes)||codes.length!==20||new Set(codes).size!==20||codes.some(c=>!actual.includes(c)))throw Error('Marble production requires the twenty actual team countries exactly once');
 if(resume&&JSON.stringify(codes)!==JSON.stringify(saved.marbles?.map(m=>m.abbr)))throw Error('Camera-only resume cannot change saved countries or order');
 return codes;
}
export function marbleProductionLaps({requested,resume=false,saved}={}){
 if(resume&&!saved)throw Error('Camera resume requires the saved race metadata');
 const laps=requested===undefined?(resume?saved.info?.laps:2):requested;
 if(![1,2,'1','2'].includes(laps))throw Error('Marble production requires one or two laps');
 const result=Number(laps);
 if(resume&&result!==saved.info?.laps)throw Error('Camera-only resume cannot change saved laps');
 return result;
}
export function marbleProductionProfiles({location,resume=false,saved,requested={}}){
 if(resume&&!saved)throw Error('Camera resume requires the saved race metadata');
 const physicsProfile=requested.physicsProfile??(resume?saved.info.physicsProfile:'contact-flow-v3');
 const audioProfile=requested.audioProfile??(resume?saved.audioProfile:'asmr-v2');
 const savedVisual={'tuscany-venue-v3':'tuscany-craft','wachau-venue-v1':'wachau-craft','jaipur-venue-v1':'jaipur-craft'};
 const visualProfile=requested.visualProfile??(resume?(savedVisual[saved.info.sceneryProfile]??'legacy'):location==='italy'?'tuscany-craft':location==='austria'?'wachau-craft':location==='india'?'jaipur-craft':'legacy');
 if(!['contact-flow-v2','contact-flow-v3'].includes(physicsProfile)||!['asmr-v1','asmr-v2'].includes(audioProfile)||!['legacy','tuscany-craft','wachau-craft','jaipur-craft'].includes(visualProfile))throw Error('Unsupported marble production profile');
 if(visualProfile==='tuscany-craft'&&location!=='italy')throw Error('Tuscan craft requires the existing Italy circuit');
 if(visualProfile==='wachau-craft'&&location!=='austria')throw Error('Wachau craft requires the Austria circuit');
 if(visualProfile==='jaipur-craft'&&location!=='india')throw Error('Jaipur craft requires the India circuit');
 if(!resume&&location==='india'&&visualProfile!=='jaipur-craft')throw Error('New India production requires its crafted regional scenery');
 if(!resume&&location==='austria'&&visualProfile!=='wachau-craft')throw Error('New Austria production requires its crafted regional scenery');
 if(resume&&(physicsProfile!==saved.info.physicsProfile||audioProfile!==saved.audioProfile))throw Error('Camera-only resume cannot change saved physics or audio profiles');
 return {physicsProfile,audioProfile,visualProfile};
}
