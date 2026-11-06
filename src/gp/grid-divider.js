import {BufferGeometry,Float32BufferAttribute} from 'three';
// Same grid divider footprint, with a long oblique entry instead of a square
// end face that pins lift arrivals. Shared actual hull in physics and picture.
export function gridDividerHull([length,height,width]){
 const x=length/2,y=height/2,z=width/2,nose=Math.min(1.2,length*.3);
 const footprint=[[-x,-z],[-x+nose,z],[x,z],[x,-z]],vertices=[];
 for(const h of [-y,y])for(const [a,b]of footprint)vertices.push(a,h,b);
 const indices=[0,2,1,0,3,2,4,5,6,4,6,7];
 for(let k=0;k<4;k++){const j=(k+1)%4;indices.push(k,j,k+4,j,j+4,k+4);}
 return {vertices,indices};
}
export function gridDividerGeometry(size){
 const {vertices,indices}=gridDividerHull(size),base=new BufferGeometry();base.setAttribute('position',new Float32BufferAttribute(vertices,3));base.setIndex(indices);
 const g=base.toNonIndexed();base.dispose();g.computeVertexNormals();g.computeBoundingBox();return g;
}
