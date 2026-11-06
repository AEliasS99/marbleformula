import {useEffect,useMemo} from 'react';import{gridDividerGeometry}from'./grid-divider.js';
export function GridDivider({size}:{size:[number,number,number]}){
 const geometry=useMemo(()=>gridDividerGeometry(size),[size]);useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color="#b8a277" roughness={.72} metalness={.12}/></mesh>;
}
