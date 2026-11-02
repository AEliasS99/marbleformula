// Uniformly scale an existing mechanism around its placement, including its
// future kinematic translations. The original modules and records stay untouched.
export function scaledWorld(world,anchor,scale){
 const bodies=new WeakMap();
 const point=p=>({x:anchor[0]+(p.x-anchor[0])*scale,y:anchor[1]+(p.y-anchor[1])*scale,z:anchor[2]+(p.z-anchor[2])*scale});
 return {
  createRigidBody(desc){desc.setTranslation(...Object.values(point(desc.translation)));const raw=world.createRigidBody(desc);const proxy=new Proxy(raw,{get(target,key){if(key==='setNextKinematicTranslation')return p=>target.setNextKinematicTranslation(point(p));const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});bodies.set(proxy,raw);return proxy;},
  createCollider(desc,body){const s=desc.shape;if(s.halfExtents)for(const key of ['x','y','z'])s.halfExtents[key]*=scale;if(s.radius!==undefined)s.radius*=scale;if(s.halfHeight!==undefined)s.halfHeight*=scale;if(s.vertices)s.vertices=Float32Array.from(s.vertices,x=>x*scale);for(const key of ['x','y','z'])desc.translation[key]*=scale;return world.createCollider(desc,bodies.get(body)||body);},
 };
}
