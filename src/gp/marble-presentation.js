// Opt-in editorial clock. Saved physics, race cameras and race audio never move.
const priority={vortex:10,hammer:9,spinner:8,pusher:7,jump:7,turntable:6,rollers:5};
// Temporal exposure may straddle a deliberate editorial cut. Keep both samples
// in the displayed shot, otherwise two unrelated machines become a ghost image.
export function marbleIntroSample(plan,frame){
 const integer=Math.round(frame);
 if(plan.profile!=='marble-race-first-v1'||frame===integer)return frame;
 const key=f=>{const scene=plan.scenes.find(s=>f>=s.at&&f<s.at+s.frames);if(scene?.id!=='flyover')return scene?.id;
  return 'feature-'+plan.cards.findIndex(c=>f-scene.at>=c.from&&f-scene.at<c.to);};
 return key(frame)===key(integer)?frame:integer;
}
export function marbleHostRoster(roster,host){
 if(!host)return roster;
 const entrant=roster.find(m=>m.abbr===host);
 if(!entrant)throw Error('Unknown marble host country');
 return [entrant,...roster.filter(m=>m!==entrant)];
}
export function marbleShowroomTeams(teams,data){
 if(data.intro?.profile!=='marble-race-first-v1'||!data.hostCountry)return teams;
 const host=teams.find(t=>t.drivers.includes(data.hostCountry));
 if(!host)return teams;
 return [{...host,drivers:[data.hostCountry,...host.drivers.filter(c=>c!==data.hostCountry)]},...teams.filter(t=>t!==host)];
}
export function marbleRaceFirstIntro(data,legacy){
 if(data.info?.vehicle==='car')throw Error('Marble presentation requires a marble race');
 if(data.marbles.length!==20)throw Error('Team presentation requires the established twenty-country grid');
 const fps=data.fps;
 if(fps!==60)throw Error('Production presentation requires 60 fps');
 const cards=[...legacy.cards].filter(c=>!['elevator','lift','regroup','dq'].includes(c.type))
  .sort((a,b)=>(priority[b.type]??1)-(priority[a.type]??1)||a.u-b.u).slice(0,2).sort((a,b)=>a.u-b.u)
  .map((c,i)=>({...c,from:i*4*fps,to:(i+1)*4*fps}));
 const firstFinish=Math.min(...data.marbles.map(m=>m.finishFrame).filter(Number.isFinite));
 const highlights=data.timeline.highlights??[];
 const eligible=highlights.map((h,index)=>({h,index})).filter(({h,index})=>
  !h.dq&&!['lift','elevator','regroup','finish'].includes(h.feature)&&
  h.to<firstFinish-3*fps&&data.highlightCams?.[index]?.length>1);
 const selected=eligible.sort((a,b)=>(b.h.strength??0)-(a.h.strength??0)||a.h.f-b.h.f)[0];
 const scenes=[{id:'cold',frames:selected?3*fps:0},{id:'title',frames:2*fps},
  {id:'teams',frames:data.round===1?10*90:0},{id:'stakes',frames:data.round>1?3*fps:0},
  {id:'flyover',frames:cards.length*4*fps},{id:'lineup',frames:4*fps}].filter(s=>s.frames>0);
 let total=0;for(const s of scenes){s.at=total;total+=s.frames;}
 const coldFrom=selected?Math.max(selected.h.from,Math.round(selected.h.f-.55*3*fps*selected.h.speed)):undefined;
 return {...legacy,profile:'marble-race-first-v1',teamFrames:90,scenes,total,cards,
  highlight:selected?.index??null,coldFrom};
}

// Rules come from this race, never a hardcoded championship or competitor count.
export function marbleFinishGap(seconds){
 return seconds>0&&seconds<.01?'<0.01':seconds.toFixed(2);
}
export function standaloneMarbleRace(data){
 return data.info?.vehicle==='marble'&&data.intro?.profile==='marble-race-first-v1'&&data.rounds===1;
}
export function knockoutCopy(data){
 const count=data.marbles.length,cps=data.checkpoints??[];
 const flow=[count,...cps.map(c=>c.survive)].join(' → ');
 const scoring=(data.results??[]).filter(r=>r.points>0).length;
 const points=scoring?`Top ${scoring} score points`:'Race classification';
 return {flow,points,checkpointCount:cps.length,
  summary:cps.length?`${cps.length} elimination checkpoints (${flow}) · ${points}`:`${count} countries · ${points}`};
}

// Keep this opt-in grid tour on the waiting-racer side of the closed start
// flap. A low camera ahead of the gate looks back through its opaque sign.
export function marbleLineupShot(g,p){
 const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>x*x*(3-2*x);
 const sgn=Math.sign(g.pole.lat||1),sweep=clamp((p-.02)/.78),toPole=smooth(clamp((p-.82)/.16));
 const swept=-sgn*g.wide*.96+2*sgn*g.wide*.96*sweep;
 const lat=swept+(g.pole.lat-swept)*toPole;
 const point=(long,lateral,height)=>g.c.map((v,i)=>v+g.t[i]*long+g.r[i]*lateral+(i===1?height:0));
 return {pos:point(g.front+.4,lat,4.1-.2*toPole),target:point(g.front-.65,lat*.96,.1),fov:42-4*toPole,kind:'lineup'};
}
