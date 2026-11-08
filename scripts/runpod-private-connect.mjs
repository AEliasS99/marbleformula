// Temporary credential handoff through the owner's existing private Tailscale.
// Loopback only. Serve supplies authenticated identity; no public Funnel.
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdirSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';

const same=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function privateRunpodConnection({host,login,keyPath,fetcher=fetch,ttlMs=30*60*1000,onState=()=>{}}){
 if(!host?.endsWith('.ts.net')||!login||!keyPath)throw Error('Private connection configuration required');
 if(existsSync(keyPath))throw Error('Existing Runpod credential preserved');
 const nonce=randomBytes(32).toString('hex'),session=randomBytes(32).toString('hex');
 let used=false,busy=false;const deadline=Date.now()+ttlMs;
 const server=createServer(async(req,res)=>{
  const send=(code,text,type='text/plain; charset=utf-8')=>{res.writeHead(code,{'Content-Type':type});res.end(text);};
  res.setHeader('Cache-Control','no-store');res.setHeader('Pragma','no-cache');
  // Basic HTML POSTs can send Origin:null with no-referrer. Keep the
  // same-origin form working while withholding referrers from other sites.
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if(!local||!same(req.headers['tailscale-user-login'],login)||![host,host+':443'].includes(req.headers.host))return send(403,'Acceso exclusivo del propietario por Tailscale.');
  if(Date.now()>deadline)return send(410,'El enlace ha caducado. Vuelve a Codex.');
  if(!['/','/runpod-connect','/runpod-connect/'].includes(req.url))return send(404,'No encontrado.');
  if(used)return send(410,'Runpod ya está conectado. Vuelve a Codex.');
  if(req.method==='GET'){
   res.setHeader('Set-Cookie',`__Host-RacecraftRunpod=${session}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=1800`);
   return send(200,`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar Runpod · Racecraft</title><style>body{background:#101820;color:#edf2f5;font:18px system-ui;max-width:640px;margin:9vh auto;padding:24px}a{color:#76d9b3}input,button{box-sizing:border-box;width:100%;padding:15px;margin:12px 0;border-radius:10px;font:inherit}button{background:#76d9b3;border:0;font-weight:700}small{color:#b8c6ce}label{display:block}</style><h1>Conectar Runpod</h1><p>La clave se enviará por HTTPS a tu Mac de desarrollo, dentro de tu red privada Tailscale. Se guardará fuera del repositorio y no aparecerá en el chat.</p><p>Prueba autorizada: una GPU, hasta US$10. Conectar la cuenta todavía no alquila una máquina.</p><p>En <a href="https://console.runpod.io/user/credentials" target="_blank" rel="noopener noreferrer">Runpod → Credentials → API Keys</a>, crea <b>Racecraft-quality-pilot</b> con permiso para listar y gestionar Pods. No necesitamos acceso a tus endpoints de inferencia.</p><form method="post" autocomplete="off"><input type="hidden" name="csrf" value="${nonce}"><label for="key">Clave API de Runpod</label><input id="key" name="key" type="password" autocomplete="off" spellcheck="false" required minlength="20" maxlength="512"><button>Conectar Runpod</button></form><small>El formulario caduca en 30 minutos y admite una sola conexión. Tu contraseña de Runpod permanece en Runpod.</small></html>`,'text/html; charset=utf-8');
  }
  if(req.method!=='POST')return send(405,'Método no permitido.');
  if(req.headers.origin!==`https://${host}`)return send(403,'Origen no autorizado. Abre de nuevo el enlace privado.');
  if(req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded')return send(415,'Formato no permitido.');
  const cookies=Object.fromEntries((req.headers.cookie??'').split(';').map(c=>c.trim().split('=')));
  if(!same(cookies['__Host-RacecraftRunpod'],session))return send(403,'Sesión no válida. Abre de nuevo el enlace privado.');
  if(busy)return send(409,'Hay una conexión en curso.');
  busy=true;
  try{
   let body='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>8192){send(413,'Formulario demasiado grande.');return;}body+=chunk.toString('utf8');}
   const fields=new URLSearchParams(body);
   if(!same(fields.get('csrf'),nonce))return send(403,'Formulario caducado. Abre de nuevo el enlace privado.');
   const key=fields.get('key')?.trim();
   if(!/^rpa_[A-Za-z0-9_-]{16,508}$/.test(key??''))return send(400,'Introduce una clave API de Runpod válida, sin comillas.');
   let check;
   try{check=await fetcher('https://api.runpod.io/v2/pods',{method:'GET',headers:{Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(12000)});}
   catch{return send(502,'No se pudo verificar Runpod. La clave no se ha guardado.');}
   await check.body?.cancel();
   if(!check.ok)return send(400,'Runpod no ha aceptado la clave para consultar Pods. Revisa sus permisos. La clave no se ha guardado.');
   mkdirSync(dirname(keyPath),{recursive:true});
   writeFileSync(keyPath,key+'\n',{mode:0o600,flag:'wx'});chmodSync(keyPath,0o600);
   used=true;onState({status:'credential-connected-not-rented',connectedAt:new Date().toISOString(),credentialPresent:true,podCreated:false,spendUSD:0});
   send(200,'<!doctype html><html lang="es"><meta charset="utf-8"><title>Runpod conectado</title><h1>Runpod conectado correctamente</h1><p>La clave se ha guardado en tu Mac de desarrollo. Todavía no se ha alquilado ninguna GPU.</p><p>Vuelve a Codex y escribe «Runpod conectado» para continuar con la prueba de alta calidad.</p></html>','text/html; charset=utf-8');
  }catch{if(!res.headersSent)send(500,'No se pudo completar la conexión. La clave no aparece en los registros.');}
  finally{busy=false;}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 return {server,get consumed(){return used;}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const cli='/Users/user/.local/bin/tailscale';
 const ts=JSON.parse(execFileSync(cli,['status','--json'],{encoding:'utf8'}));
 const host=ts.Self.DNSName.replace(/\.$/,''),login=ts.User[String(ts.Self.UserID)]?.LoginName;
 const stateFile=resolve('out/runpod-quality-pilot-20261104/private-connection-status.json');
 const save=s=>{mkdirSync(dirname(stateFile),{recursive:true});writeFileSync(stateFile,JSON.stringify({...s,checkedAt:new Date().toISOString()},null,2)+'\n');};
 const {server}=privateRunpodConnection({host,login,keyPath:'/Users/user/marmot/Races/config/.runpod-api-key',onState:save});
 const cleanup=()=>{spawnSync(cli,['serve','--https=443','--set-path=/runpod-connect','off'],{stdio:'ignore'});};
 server.listen(8904,'127.0.0.1',()=>save({status:'awaiting-private-credential',url:`https://${host}/runpod-connect`,pid:process.pid,expiresAt:new Date(Date.now()+30*60*1000).toISOString(),podCreated:false}));
 const end=()=>server.close(()=>{cleanup();process.exit(0);});
 setTimeout(end,30*60*1000).unref();
 for(const sig of ['SIGTERM','SIGINT','SIGHUP'])process.on(sig,end);
}
