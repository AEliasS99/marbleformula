// Editorial overlay clock only: never inserts frames, interrupts racing or
// touches the saved cameras, audio, physics, classifications or results.
export function channelCTAWindow(timeline,fps,{shortEnd}={}){
 if(!(Number.isFinite(fps)&&fps>0))return null;
 const results=timeline.results?.at;
 if(!Number.isFinite(results))return null;
 const end=Number.isFinite(shortEnd)?shortEnd:timeline.total;
 if(!Number.isFinite(end))return null;
 const start=Number.isFinite(shortEnd)?Math.max(results+fps,end-3.5*fps):results+.75*fps;
 const to=Math.min(end-.25*fps,start+14*fps);
 return to-start>=fps?{start:Math.ceil(start),end:Math.floor(to)}:null;
}
export function channelCTAAt(frame,window,fps){
 if(!window||frame<window.start||frame>=window.end)return null;
 const age=frame-window.start,remaining=window.end-frame;
 const ease=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
 const opacity=ease(age/(.3*fps))*ease(remaining/(.3*fps));
 const pop=ease(age/(.45*fps));
 // A single restrained thumb pulse, driven entirely by the frame number.
 const pulse=age<1.1*fps?Math.sin(Math.PI*Math.max(0,Math.min(1,(age-.35*fps)/(.75*fps)))):0;
 return {opacity,slide:1-pop,thumbScale:1+.12*pulse};
}
// Give the prompt a second opportunity while cars/marbles are stationary on
// the grid. Finish before green; never cover live action or add intro time.
export function channelCTAState(frame,timeline,fps,{shortEnd}={}){
 const closing=channelCTAAt(frame,channelCTAWindow(timeline,fps,{shortEnd}),fps);
 if(closing)return {...closing,compact:false};
 if(Number.isFinite(shortEnd)||!(Number.isFinite(fps)&&fps>0)||!Number.isFinite(timeline.raceStart))return null;
 const start=Math.ceil(.3*fps),end=Math.floor(Math.min(start+4*fps,timeline.raceStart-.5*fps));
 if(end-start<1.5*fps)return null;
 const grid=channelCTAAt(frame,{start,end},fps);
 return grid?{...grid,compact:true}:null;
}
export function channelCTABounds(width,height,{compact=false}={}){
 const s=Math.min(width,height)/1080,portrait=height>width;
 if(compact){const w=(portrait?900:520)*s,h=76*s;return {left:portrait?(width-w)/2:36*s,top:height-(portrait?240:64)*s-h,width:w,height:h,scale:s,portrait};}
 const w=(portrait?800:332)*s,h=(portrait?112:174)*s;
 return {left:portrait?(width-w)/2:36*s,top:height-(portrait?240:64)*s-h,width:w,height:h,scale:s,portrait};
}
