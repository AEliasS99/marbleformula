import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import {islandMeshData} from './car-island.js';

export function SoftIsland({size}:{size:[number,number,number]}){
 const [length,height,width]=size;
 const geometry=useMemo(()=>{
  const data=islandMeshData([length,height,width]),indexed=new THREE.BufferGeometry();
  indexed.setAttribute('position',new THREE.Float32BufferAttribute(data.vertices,3));indexed.setIndex(data.indices);
  const g=indexed.toNonIndexed();indexed.dispose();g.computeVertexNormals();
  const colours=[];const positions=g.getAttribute('position');
  for(let k=0;k<positions.count;k+=3){
   const x=(positions.getX(k)+positions.getX(k+1)+positions.getX(k+2))/3;
   const y=(positions.getY(k)+positions.getY(k+1)+positions.getY(k+2))/3;
   const stripe=y<height*.3&&Math.floor((x+length/2)/.42)%3===1;
   const c=new THREE.Color(stripe?'#cb4550':'#e7e8df');
   for(let j=0;j<3;j++)colours.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));return g;
 },[length,height,width]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.82}/></mesh>;
}
