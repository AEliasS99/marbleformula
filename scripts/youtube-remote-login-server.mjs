// Temporary bootstrap service for the user-authorized private Tailscale link.
// Serves code/public client metadata only; existing uploader owns tokens/callback.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const host=process.argv[2];
if(!/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(host??''))throw Error('Expected private Tailscale IPv4');
const raw=JSON.parse(readFileSync(resolve('.youtube-client.json'),'utf8')),client=raw.installed??raw.web??raw;
if(!/^[a-zA-Z0-9.-]+\.apps\.googleusercontent\.com$/.test(client.client_id??''))throw Error('Invalid Google client ID');
const helper=readFileSync(resolve('scripts/youtube-remote-login.py'),'utf8').replace('__RACECRAFT_TAILSCALE_IP__',host).replace('__RACECRAFT_GOOGLE_CLIENT_ID__',client.client_id);
const server=createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 if(req.url==='/connect.py'){
  res.writeHead(200,{'Content-Type':'text/x-python; charset=utf-8','Content-Disposition':'attachment; filename="racecraft-youtube-login.py"'}).end(helper);return;
 }
 if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({service:'Racecraft private YouTube login',host,ready:true}));return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<h1>Racecraft private connection is working</h1><p>Return to Codex for the Google sign-in steps.</p>');
});
server.listen(8898,'127.0.0.1',()=>console.log('Private login bootstrap ready on loopback port8898'));
setTimeout(()=>server.close(),6*3600000).unref();
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>process.exit(0)));
