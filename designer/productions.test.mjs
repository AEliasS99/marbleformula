import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,unlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {productionLibrary} from './productions.mjs';
test('marble review appears with its real series through preparation, rendering and review',()=>{
 const dir=mkdtempSync(join(tmpdir(),'racecraft-marble-library-')),root=join(dir,'repo'),videoRoot=join(dir,'videos');
 const base=join(root,'out/tcr/marble-review/italy-seed67');mkdirSync(base,{recursive:true});mkdirSync(videoRoot,{recursive:true});
 const output=join(realpathSync(videoRoot),'italy-marbles-seed67-4k.mp4'),ready={variant:'marble-production',vehicle:'marble',reviewTitle:'Canicas · Italia · 20 países',location:'italy',seed:67,frames:12000,output,status:'prepared'};
 const library=productionLibrary({root,videoRoot,repositories:[root]});
 const save=()=>writeFileSync(join(base,'ready.json'),JSON.stringify(ready));
 try{
  save();let item=library.snapshot().items.find(e=>e.mode==='marbles');assert.equal(item.status,'prepared');assert.equal(item.title,ready.reviewTitle);
  ready.status='rendering';ready.renderedFrames=180;save();item=library.snapshot().items.find(e=>e.mode==='marbles');assert.equal(item.status,'rendering');
  ready.status='rendered';ready.videoBytes=4;writeFileSync(output,'TEST');save();item=library.snapshot().items.find(e=>e.mode==='marbles');assert.equal(item.status,'review');assert.equal(item.title,ready.reviewTitle);assert.ok(item.playback);assert.ok(item.notes.some(n=>n.includes('20 países')));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('production evidence stays distinct; local playback supports ranges without exposing secrets or symlinks',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'racecraft-productions-')),root=join(dir,'repo'),videoRoot=join(dir,'videos'),inventory=join(dir,'inventory.json');
 const write=(path,value)=>{mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,typeof value==='object'?JSON.stringify(value):value);};
 write(inventory,[{path:'tcr-alps-heat1-4k.mp4',bytes:10},{path:'versions/master.mp4',bytes:11},{path:'.youtube-auth/.youtube-token.json',bytes:99},{path:'bench/test.mp4',bytes:5}]);
 write(join(videoRoot,'tcr-alps-heat1-4k.mp4'),'0123456789');write(join(videoRoot,'versions/master.mp4'),'different');write(join(videoRoot,'setup-test.mp4'),'TEST');write(join(videoRoot,'unfinished.partial.mp4'),'TEST');
 write(join(dir,'secret.txt'),'secret');symlinkSync(join(dir,'secret.txt'),join(videoRoot,'escape.mp4'));symlinkSync(dir,join(videoRoot,'loop'));
 write(join(root,'HANDOFF.md'),'1. **Recorded release** — `https://youtu.be/AG_H16LbVyU` (`13:24` · `HD`)');
 write(join(root,'out/tcr/alps/heat-1-verified.json'),{bytes:10,format:'4K',durationSeconds:1,editorialIssues:['Review titles']});
 write(join(root,'out/tcr/alps/ready.json'),{status:'prepared',location:'alps',heat:'2',output:join(videoRoot,'heat2.mp4')});
 write(join(root,'out/gp/new-uploaded.json'),{video:{id:'WD_sAvtTwoc',title:'New upload',url:'javascript:bad'},accessToken:'must-never-appear'});
 const library=productionLibrary({root,videoRoot,inventory,repositories:[root]});let server;
 try{
  const data=library.snapshot();assert.equal(data.cloudCount,3);assert.equal(data.localCount,4);assert.equal(data.items.filter(e=>e.status==='published').length,1);assert.equal(data.items.filter(e=>e.status==='uploaded').length,1);
  const master=data.items.find(e=>e.status==='review');assert.equal(master.locations.length,2);assert.equal(data.items.filter(e=>e.title==='master.mp4').length,2,'different sizes remain separate versions');
  assert.equal(data.items.filter(e=>e.status==='prepared').length,1);assert.equal(data.items.filter(e=>e.status==='ready').length,0);
  assert.equal(data.items.find(e=>e.title.includes('partial')).playback,undefined);assert.equal(data.items.find(e=>e.title==='New upload').youtube.url,'https://youtu.be/WD_sAvtTwoc');
  assert.doesNotMatch(JSON.stringify(data),/must-never-appear|youtube-token|escape.mp4|secret.txt|javascript:/);
  server=createServer((req,res)=>{if(!library.stream(req,res,req.url.slice(1))){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/${master.id}`;
  let response=await fetch(url,{headers:{Range:'bytes=2-5'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 2-5/10');assert.equal(await response.text(),'2345');
  response=await fetch(url,{headers:{Range:'bytes=-3'}});assert.equal(await response.text(),'789');
  response=await fetch(url,{method:'HEAD'});assert.equal(response.headers.get('content-length'),'10');assert.equal(await response.text(),'');
  for(const range of ['bytes=20-','bytes=5-2','bytes=-0','bytes=0-1,3-4','bytes=-'])assert.equal((await fetch(url,{headers:{Range:range}})).status,416);
  unlinkSync(join(videoRoot,'tcr-alps-heat1-4k.mp4'));symlinkSync(join(dir,'secret.txt'),join(videoRoot,'tcr-alps-heat1-4k.mp4'));assert.equal((await fetch(url)).status,404);
  unlinkSync(inventory);assert.ok(library.snapshot().warnings.some(x=>x.includes('inventario')));
  const preview=join(realpathSync(videoRoot),'racecraft-cars-fresh-4k-preview.mp4'),manifest=join(root,'out/racecraft/fresh/manifest.json');write(preview,'PREVIEW');
  const rendered={status:'rendered',output:preview,videoBytes:7,frames:1240,engine:'racecraft-rapier-3',snapshotHash:'snapshot',technicalChecks:'decode passed'};
  write(manifest,rendered);let entry=library.snapshot().items.find(e=>e.locations.some(l=>l.path===preview));assert.equal(entry.status,'review');assert.equal(entry.mode,'cars');assert.equal(entry.duration,1240/60);assert.ok(entry.playback);assert.equal(entry.youtube,undefined);
  write(manifest,{...rendered,videoBytes:8});entry=library.snapshot().items.find(e=>e.locations.some(l=>l.path===preview));assert.equal(entry.status,'test','changed file is not covered by render evidence');
  write(manifest,{...rendered,status:'rendering'});entry=library.snapshot().items.find(e=>e.locations.some(l=>l.path===preview));assert.equal(entry.status,'test','unfinished manifest is not technical approval');
 }finally{if(server)await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});
