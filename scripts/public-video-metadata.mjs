// Audience copy belongs in YouTube snippets; technical/review evidence stays
// in local manifests. This changes metadata only, never privacy or approval.
export const WEBSITE_INVITATION='🏁 Explore more marble and car races at https://marbleformula.com';
export function publicVideoMetadata(metadata){
 const title=String(metadata.title??'').replace(/\b(?:Unlisted\s+)?Review\b/gi,'').replace(/\s{2,}/g,' ').replace(/\s*[|·—-]\s*$/,'').trim();
 let description=String(metadata.description??'').replace(/\r\n?/g,'\n');
 // Sentence boundaries require whitespace, so a duration like112.03 seconds
 // cannot leave an orphaned decimal fragment when removing a technical note.
 description=description.split('\n').map(line=>line.split(/(?<=[.!?])\s+/u).filter(sentence=>{
  const s=sentence.trim();
  return !/^(?:Native\s*(?:\d|4K)|Fixed(?:\s+sequential)?\s+seed\s*\d|Original\s+fixed\s+seed|Fictional\b.*\bcircuit\b|Review copy\s*:|Editorial approval|User review pending|Public release\b|This (?:independent|isolated) review\b|It uses the existing start presentation\b|Unlisted (?:Marble Formula review|review for Marble Formula)\b)/i.test(s);
 }).join(' ')).join('\n');
 description=description
  .replace(/\bNative\s+\d{3,4}\s*[x×]\s*\d{3,4}[^.!?\n]*[.!?]?/gi,'')
  .replace(/\bUnlisted\s+review\s+copy\.?/gi,'')
  .replace(/\bFictional\s+(?:stylised\s+)?(?:Italian\s+circuit|Coffee Andes Rush circuit inspired by Colombia[’']s Eje Cafetero)\.?/gi,'')
  .replace(/\bUnlisted\s+(?:remote[- ]review\s+version|user\s+review|review)\s+of\s+(?:the\s+)?/gi,'Watch ')
  .replace(/\b(?:For user review|Editorial approval is pending|User approval required before public release|public release and Cloud archival remain pending)\.?/gi,'')
  .replace(/\bOriginal fixed seed\s*\d+\s+physics and results preserved; camera-only repair\.?/gi,'')
  .replace(/\bThis is an alternate Heat \d+ review, not Heat \d+\.?/gi,'')
  .replace(/\bEvery race is a real physics simulation \(Rapier\): nothing is scripted\. Rendered in 4K\.?/gi,'');
 const paragraphs=description.split(/\n\s*\n/).map(p=>p.split('\n').map(line=>line.replace(/[ \t]{2,}/g,' ').trim()).filter(Boolean).join('\n')).filter(Boolean);
 if(!description.includes('marbleformula.com'))paragraphs.splice(Math.min(1,paragraphs.length),0,WEBSITE_INVITATION);
 if(!/\blike\b[\s\S]*\bsubscrib/i.test(description))paragraphs.splice(Math.min(2,paragraphs.length),0,'👍 Enjoy the race? Give it a like, subscribe and tell us which country you support!');
 description=paragraphs.join('\n\n');
 if(Buffer.byteLength(description,'utf8')>5000)throw Error('Public description exceeds YouTube limit; edit copy before uploading');
 const tags=Array.isArray(metadata.tags)?metadata.tags.filter(tag=>!/(?:^|\s)(?:unlisted|review)(?:$|\s)/i.test(tag)):metadata.tags;
 return {...metadata,title,description,...(tags?{tags}:{})};
}
