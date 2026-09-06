/** Local static preview only. This is not a public deployment or OCR service. */
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const PORT=Number(process.env.PORT||4173);
if(!Number.isInteger(PORT)||PORT<1024||PORT>65535)throw new Error('Invalid PORT');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.png':'image/png','.pdf':'application/pdf','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
  try {
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});return res.end();}
    const raw=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const url=raw==='/ntu-adminscan'?'/':raw.replace(/^\/ntu-adminscan\//,'/');
    let p=path.resolve(ROOT,'.'+url);
    if(!p.startsWith(ROOT+path.sep)&&p!==ROOT){res.writeHead(403);return res.end();}
    if((await stat(p)).isDirectory())p=path.join(p,'index.html');
    const data=await readFile(p);
    res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
}).listen(PORT,'127.0.0.1',()=>console.log(`Local preview only: http://127.0.0.1:${PORT}/ntu-adminscan/`));
