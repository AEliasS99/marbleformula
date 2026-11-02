"""Technical UHD checks and contact sheets; never records visual approval."""
import json, pathlib, sys, hashlib
import numpy as np
from PIL import Image, ImageDraw
b=pathlib.Path(sys.argv[1])
r=json.loads((b/'ready.json').read_text());d=json.loads((b/'race.json').read_text())
finish=min(m['finishFrame'] for m in d['marbles'] if m['finishFrame'] is not None)
required=set(json.loads((b/'native-frame-index.json').read_text()))
required.update(f'finish-neighbour-{finish+x}.png' for x in [-15,-2,-1,1,2,3,4,5,15,30])
required.update(['tracking-lead.png','tracking-chase.png'])
rows=[]
for name in sorted(required):
 p=b/name;assert p.exists(),name
 im=Image.open(p).convert('RGB');assert im.size==(3840,2160),name
 a=np.asarray(im.resize((320,180)))[36:144,64:288]
 assert np.all(a<=12,axis=2).mean()<.985,name
 # Authored white replay transitions are sampled explicitly, not mistaken for missing scenery.
 transition=name in ['replay-sweep-0.png',f"replay-sweep-{d['timeline']['results']['at']-d['timeline']['replay']['at']-1}.png"]
 assert transition or np.all(a>=242,axis=2).mean()<.94,name
 rows.append({'file':name,'size':list(im.size),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'authoredTransition':transition})
groups={'showcase':[],'checkpoints':[],'cockpit':[],'finish':[],'replay':[],'track':[]}
for row in rows:
 n=row['file'];group='showcase' if n.startswith('car-') or n=='pick.png' else 'checkpoints' if n.startswith('checkpoint-') else 'cockpit' if n.startswith('cockpit-') else 'finish' if n.startswith('finish') else 'replay' if n.startswith('replay') else 'track'
 groups[group].append(n)
for group,names in groups.items():
 out=Image.new('RGB',(1600,250*((len(names)+3)//4)),(16,18,22));draw=ImageDraw.Draw(out)
 for i,n in enumerate(names):
  im=Image.open(b/n).convert('RGB');im.thumbnail((400,225));x=i%4*400;y=i//4*250;out.paste(im,(x,y));draw.text((x+8,y+230),n,fill='white')
 out.save(b/f'{group}-contact.jpg',quality=92)
(b/'native-still-checks.json').write_text(json.dumps({'passed':True,'images':rows,'editorialReview':'pending actual image inspection','host':r.get('hostCountry'),'introSeconds':r['presentationFrames']/60},indent=2)+'\n')
print(json.dumps({'passed':True,'images':len(rows),'visualApproval':'pending'}))
