import {useEffect,useMemo} from 'react';
import {challengeDeckGeometry} from './obstacles/raised-choice.js';
import {applyMachineSurface} from './machine-surfaces.js';
export function ChallengeDeck({record}:{record:any}){
 const geometry=useMemo(()=>challengeDeckGeometry(record),[record]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} position={record.pos} quaternion={record.quat} castShadow receiveShadow>
  <meshStandardMaterial color="#806342" roughness={.84} onBeforeCompile={shader=>applyMachineSurface(shader,'fin',record.size)} customProgramCacheKey={()=>'raised-choice-timber-v1'}/>
 </mesh>;
}
