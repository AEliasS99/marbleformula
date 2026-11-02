// Credits describe declared soundtrack metadata, never a scenery or intro style.
// Absent metadata retains historical exports' existing musical attribution.
export function audioCredit(data){
 if(data.audioProfile==='asmr-v1')return {label:'Sound:',title:'Marble & track sounds',icon:'🔊'};
 if(data.audioProfile!=null)return {label:'Sound:',title:'Race audio',icon:'🔊'};
 const songs=['Neon Strip Velocity','Interlagos Samba','Miami Marina Pulse','Zandvoort Dune Drift','Yas Marina Finale'];
 const title=data.info?.vehicle==='car'?'Marble Formula · Original Synthwave':songs[((data.round??1)-1)%songs.length];
 return {label:'Song:',title,icon:'🎵'};
}
