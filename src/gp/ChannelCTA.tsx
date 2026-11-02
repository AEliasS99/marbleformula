import {channelCTAState,channelCTABounds} from './channel-cta.js';

type Timeline={results:{at:number};total:number;raceStart?:number};
type Props={frame:number;fps:number;timeline:Timeline;width:number;height:number;shortEnd?:number};
export function ChannelCTA({frame,fps,timeline,width,height,shortEnd}:Props){
 const state=channelCTAState(frame,timeline,fps,{shortEnd});
 if(!state)return null;
 const b=channelCTABounds(width,height,{compact:state.compact}),s=b.scale;
 const thumb=<svg width={34*s} height={34*s} viewBox="0 0 32 32" fill="none" aria-hidden="true" style={{flexShrink:0,transform:`scale(${state.thumbScale})`}}><path d="M11 14 17 4c1-1 4 0 3.5 3L20 12h6c2 0 3 2 2.5 4l-2 9c-.3 1.7-1.5 3-3.5 3H11V14Z" fill="#ffcc00"/><path d="M3 14h5v14H3z" fill="#ffcc00"/></svg>;
 const subscribe=<span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:9*s,padding:`${9*s}px ${13*s}px`,background:'#e10600',borderRadius:8*s,color:'#fff',fontSize:22*s,fontWeight:900,letterSpacing:.5*s,whiteSpace:'nowrap'}}><svg width={19*s} height={19*s} viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 11 7-11 7z" fill="white"/></svg>SUBSCRIBE</span>;
 if(state.compact)return <div aria-label="Like and subscribe to Marble Formula" style={{position:'absolute',left:b.left,top:b.top,width:b.width,height:b.height,boxSizing:'border-box',pointerEvents:'none',zIndex:40,opacity:state.opacity,transform:`translateY(${state.slide*18*s}px)`,fontFamily:"'Avenir Next', 'Montserrat', 'Helvetica Neue', system-ui, sans-serif",border:`${1.5*s}px solid rgba(255,204,0,.65)`,borderLeft:`${5*s}px solid #ffcc00`,borderRadius:12*s,background:'rgba(14,17,26,.96)',color:'#fff',padding:`${10*s}px ${14*s}px`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:14*s}}>
  <div style={{display:'flex',alignItems:'center',gap:10*s}}>{thumb}<div><div style={{fontSize:24*s,fontWeight:900}}>LIKE THE RACE</div><div style={{fontSize:16*s,fontWeight:750,color:'#ffcc00',marginTop:2*s}}>marbleformula.com</div></div></div>{subscribe}
 </div>;
 return <div aria-label="Like and subscribe to Marble Formula" style={{position:'absolute',left:b.left,top:b.top,width:b.width,height:b.height,boxSizing:'border-box',pointerEvents:'none',zIndex:40,opacity:state.opacity,transform:`translateY(${state.slide*18*s}px)`,fontFamily:"'Avenir Next', 'Montserrat', 'Helvetica Neue', system-ui, sans-serif",border:`${1.5*s}px solid rgba(255,204,0,.65)`,borderTop:`${4*s}px solid #ffcc00`,borderRadius:15*s,background:'linear-gradient(135deg,rgba(14,17,26,.98),rgba(29,34,46,.97))',boxShadow:`0 ${8*s}px ${28*s}px rgba(0,0,0,.3)`,color:'#fff',padding:`${15*s}px ${18*s}px`,display:'flex',flexDirection:b.portrait?'row':'column',alignItems:b.portrait?'center':'stretch',justifyContent:'center',gap:11*s}}>
  <div style={{display:'flex',alignItems:'center',gap:11*s,flex:b.portrait?1:undefined}}>{thumb}<div><div style={{fontWeight:900,fontSize:24*s,letterSpacing:.3*s,lineHeight:1.2}}>LIKE &amp; SUBSCRIBE</div><div style={{fontWeight:650,fontSize:16*s,color:'#e2e5eb',marginTop:3*s}}>@MarbleFormula</div><div style={{fontWeight:750,fontSize:16*s,color:'#ffcc00',marginTop:3*s}}>Visit marbleformula.com</div></div></div>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12*s}}>{subscribe}{!b.portrait&&<span style={{fontSize:13*s,lineHeight:1.3,color:'#e2e5eb',maxWidth:78*s}}>Join the<br/>next race</span>}</div>
 </div>;
}
