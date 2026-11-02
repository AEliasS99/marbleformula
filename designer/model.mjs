import {randomUUID} from 'node:crypto';
import {catalog,roster,templates} from './catalog.mjs';
export const schemaVersion=1;
const modes=['marbles','cars'];
const fail=m=>{throw Object.assign(new Error(m),{status:400});};
const text=(v,max=200)=>typeof v==='string'&&v.length<=max;
const number=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
export function validateProject(p){
 if(!p||p.schemaVersion!==1||!id(p.id)||!text(p.name,100)||!p.name.trim()||!modes.includes(p.mode))fail('Proyecto inválido: nombre, modo o versión.');
 if(!Array.isArray(p.points)||p.points.length<4||p.points.length>100||p.points.some(q=>!id(q.id)||!number(q.x,-200,200)||!number(q.z,-200,200)||!number(q.y,0,60)))fail('El trazado necesita entre 4 y 100 puntos válidos.');
 if(new Set(p.points.map(q=>q.id)).size!==p.points.length)fail('Identificadores de puntos repetidos.');
 if(!number(p.width,2,14)||!number(p.laps,1,10)||!Number.isInteger(p.laps)||!number(p.seed,1,999999)||!Number.isInteger(p.seed)||!['alpine','desert','night'].includes(p.theme))fail('Configuración del circuito inválida.');
 if(!number(p.wallHeight??.58,.2,3))fail('Altura de barrera inválida (0,2–3 m).');
 if(!Array.isArray(p.elements)||p.elements.length>200||p.elements.some(e=>!id(e.id)||!id(e.assetId)||!text(e.name,100)||!number(e.at,0,.9999)||!number(e.offset,-30,30)||!number(e.scale,.3,3)))fail('Elementos inválidos.');
 if(new Set(p.elements.map(e=>e.id)).size!==p.elements.length)fail('Identificadores de elementos repetidos.');
 if(!Array.isArray(p.participants)||p.participants.length<1||p.participants.length>40||p.participants.some(r=>!id(r.id)||!text(r.name,60)||!/^#[a-f0-9]{6}$/i.test(r.color)||typeof r.enabled!=='boolean'||!number(r.size,.5,2)||!['GT','F1','BGY','JET'].includes(r.vehicleClass)||['speed','grip','intelligence'].some(k=>!number(r[k],1,5)||!Number.isInteger(r[k]))))fail('Participantes inválidos.');
 if(new Set(p.participants.map(r=>r.id)).size!==p.participants.length)fail('Identificadores de participantes repetidos.');
 if(!Array.isArray(p.notes)||p.notes.length>100||p.notes.some(n=>!id(n.id)||!text(n.text,3000)||!text(n.target,100)||typeof n.resolved!=='boolean'))fail('Notas inválidas.');
 if(!text(p.intent,3000)||!['draft','review','agreed'].includes(p.stage))fail('Ficha de diseño inválida.');
 return p;
}
export function createProject({mode='marbles',name,template}={}){
 if(!modes.includes(mode))fail('Modo inválido.');
 if(template==='physics-complete'){
  const p=createProject({mode,template:'physics-lab',name:name||`Laboratorio completo · ${mode==='cars'?'Coches':'Canicas'}`});
  p.points.forEach(q=>{q.x*=3;q.z*=3;q.y=12;});p.width=6;p.wallHeight=3;p.laps=1;p.elements=[];
  const add=(assetId,at,name=assetId)=>p.elements.push({id:randomUUID(),assetId,name,at,offset:0,scale:1});
  for(const [i,at] of [.11,.43,.95].entries())add('checkpoint',at,'Checkpoint '+(i+1));
  if(mode==='marbles')for(const [type,at] of [['spinner',.06],['vortex',.16],['pegs',.25],['splitter',.30],['jump',.36],['hammer',.40],['drop',.46],['turntable',.50],['bumps',.55],['pusher',.59],['crest',.64],['rollers',.68],['tube',.73],['fan',.77],['regroup',.82],['switch',.87],['bumpers',.91]])add(type,at,catalog.find(a=>a.id===type).name);
  else {add('chicane',.30,'Chicane');add('drs',.55,'Recta de ataque');}
  if(mode==='marbles'){
   for(const at of [.02,.05,.09,.115,.21,.24,.28,.33,.345,.39,.45,.49,.53,.58,.62,.67,.71,.76,.80,.85,.90,.94,.98])add('booster',at,'Impulso visible');
   add('booster',.1564,'Impulso de salida del vórtice');
  }
  if(mode==='marbles')p.participants.forEach(r=>r.size=.7);
  p.source='racecraft-complete-lab';p.intent='Banco completo de obstáculos, con impulsos visibles. Los resultados muestran qué piezas dejan pasar, eliminan o atascan a cada participante.';return validateProject(p);
 }
 if(template==='physics-lab'){
  const p=createProject({mode,name:name||`Laboratorio · ${mode==='cars'?'Coches':'Canicas'}`});
  p.points=Array.from({length:12},(_,i)=>({id:randomUUID(),x:30*Math.sin(i*Math.PI/6),y:5,z:30*Math.cos(i*Math.PI/6)}));p.width=6;p.wallHeight=1.5;p.laps=1;
  p.participants.forEach((r,i)=>r.enabled=i<6);p.elements=p.elements.filter(e=>e.assetId==='checkpoint');
  if(mode==='marbles')for(const at of [.02,.2,.4,.6,.8])p.elements.push({id:randomUUID(),assetId:'booster',name:'Acelerador de ensayo',at,offset:0,scale:1});
  p.intent='Circuito de laboratorio compatible con física. Modifica puntos y piezas y compara los ensayos.';p.source='racecraft-physics-lab';return validateProject(p);
 }
 const source=templates.find(t=>t.id===template);
 const points=(source?.outline||[{x:-48,z:28,y:5},{x:-48,z:-20,y:10},{x:-30,z:-38,y:16},{x:10,z:-38,y:18},{x:43,z:-20,y:12},{x:40,z:12,y:7},{x:18,z:23,y:5},{x:5,z:4,y:9},{x:-18,z:8,y:7},{x:-20,z:30,y:5}]).map(p=>({...p,id:randomUUID()}));
 const element=(assetId,name,at,offset=0)=>({id:randomUUID(),assetId,name,at,offset,scale:1});
 return validateProject({schemaVersion:1,id:randomUUID(),revision:0,name:name|| (mode==='marbles'?'Valle Esmeralda':'Alpine Touring Club'),mode,theme:mode==='marbles'?'alpine':'night',width:mode==='marbles'?4.2:6,laps:mode==='marbles'?2:1,seed:17,points,elements:[element('checkpoint','Checkpoint 1',.27),element('checkpoint','Checkpoint 2',.54),element('checkpoint','Checkpoint 3',.79),...(mode==='marbles'?[element('spinner','Molino del bosque',.12),element('vortex','El gran vórtice',.39),element('jump','Salto del valle',.65)]:[element('drs','Recta de ataque',.15),element('chicane','Chicane del mirador',.66)]),element('pine','Pinos del mirador',.19,10),element('stand','Grada principal',.93,9)],participants:roster.map((p,i)=>({...p,enabled:i<(mode==='marbles'?20:6)})),notes:[],intent:'Una carrera fácil de seguir, con un tramo técnico y una llegada muy visible.',stage:'draft',source:source?.source||null});
}
export function validateAsset(a){
 if(!a||!id(a.id)||!text(a.name,80)||!a.name.trim()||!text(a.description,1000)||!['obstacle','scenery','rules'].includes(a.category)||!Array.isArray(a.modes)||!a.modes.length||a.modes.some(m=>!modes.includes(m))||!catalog.some(x=>x.shape===a.shape)||!/^#[a-f0-9]{6}$/i.test(a.color)||!number(a.scale,.3,3))fail('La pieza necesita nombre, forma, color y escala válidos.');
 if(a.physicsType!==undefined&&!catalog.some(base=>base.id===a.physicsType&&base.shape===a.shape))fail('Comportamiento físico base incompatible con la forma.');
 return {...a,physicsType:a.physicsType||a.shape,engineStatus:'existing',custom:true};
}
export function brief(p,library=[]){
 const all=[...catalog,...library];
 return `# ${p.name}\n\nProyecto: ${p.id}\nRevisión: ${p.revision}\nArchivo: designs/${p.id}.json\nModo: ${p.mode==='cars'?'Coches':'Canicas'}\nEstado de diseño: ${p.stage}\n\n## Intención\n${p.intent}\n\n## Circuito\n${p.points.length} puntos, ancho ${p.width} m, barrera ${p.wallHeight??.58} m, ${p.laps} vueltas, semilla ${p.seed}. Tema: ${p.theme}.\n\n## Elementos\n${p.elements.map(e=>`- ${e.name} [${e.id}]: ${all.find(a=>a.id===e.assetId)?.name||e.assetId}, ${(e.at*100).toFixed(1)}% del recorrido, desplazamiento ${e.offset} m, escala ${e.scale}.`).join('\n')}\n\n## Participantes\n${p.participants.filter(r=>r.enabled).map(r=>`- ${r.name} [${r.id}], ${r.color}, tamaño ${r.size}${p.mode==='cars'?`, clase ${r.vehicleClass}, VEL/EST/INT ${r.speed}/${r.grip}/${r.intelligence}`:''}.`).join('\n')}\n\n## Notas para trabajar juntos\n${p.notes.map(n=>`- [${n.resolved?'x':' '}] (${n.target}) ${n.text}`).join('\n')||'Sin notas todavía.'}\n\n## Siguiente paso\nRevisar este diseño en Codex. La vista 3D es conceptual: no valida física, clasificación ni render. No ejecutar producción hasta resolver la auditoría. Usar Probar carrera para comprobar alturas, anchos, participantes y mecanismos compatibles. La producción con season.mjs todavía requiere integración explícita; conservar el snapshot del ensayo elegido.\n`;
}
