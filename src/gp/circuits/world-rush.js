// Extend the established wide-road action composer to the existing host venues.
// The outline, regional scenery and production renderer remain those of the host.
import {colombiaRushRound,colombiaRushAction} from './colombia-action.js';
import {variedRaceAction} from '../race-action-profile.js';
export const worldRushRound=base=>({...colombiaRushRound(base),carRoadScale:base.carRoadScale??2.3,carRoadWidth:base.carRoadWidth??6.4});
export function worldRushAction(base,course){
 const round=colombiaRushAction(base,course,{minimumSectors:4,...base.carActionProfile});
 const themed={...round,carChallenges:{...round.carChallenges,variant:'world-rush',
  patches:round.carChallenges.patches.map((p,i)=>({...p,id:`${base.id}-wet-${i+1}`,label:'WET ROAD · DRY PASSING LINE'})),
  refinement:'host-tour-powered-lanes-wet-road-v3'}};
 return base.carActionProfile?.actionVersion==='race-action-v4'?variedRaceAction(themed,course):themed;
}
