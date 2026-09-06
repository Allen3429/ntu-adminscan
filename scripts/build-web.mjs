/** Build a vetted, static demo. Never publish the Python server or runtime files. */
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'dist');
const allowed = new Set(['.html','.css','.js','.json','.txt','.png','.pdf','.svg']);
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
async function walk(dir) {
  const rows=[];
  for (const d of await readdir(dir, {withFileTypes:true})) {
    const p=path.join(dir,d.name);
    if (d.isSymbolicLink()) throw new Error('Do not publish symlinks: '+p);
    if (d.isDirectory()) rows.push(...await walk(p)); else rows.push(p);
  }
  return rows;
}
await rm(out,{recursive:true,force:true}); await mkdir(out,{recursive:true});
for(const src of await walk(path.join(ROOT,'public'))) {
  const rel=path.relative(path.join(ROOT,'public'),src).split(path.sep).join('/');
  if(!allowed.has(path.extname(src))) throw new Error('Unexpected public file: '+rel);
  if(rel.includes('CP1739858279340')||/(^|\/)(uploads|runtime|private|reports)\//.test(rel)) throw new Error('Excluded file: '+rel);
  const dest=path.join(out,rel);await mkdir(path.dirname(dest),{recursive:true});
  await cp(src,dest);
}
const config = `/* Public demo: no backend, no identity provider, no authority to submit. */
window.ADMINSCAN_PUBLIC_DEMO=true;
window.ADMINSCAN_STANDALONE=true;
`;
await writeFile(path.join(out,'js/deployment-mode.js'),config);
for(const name of ['index.html','workbench.html']) {
  const p=path.join(out,name);let html=await readFile(p,'utf8');
  html=html.replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow">`);
  html=html.replace('<script src=', '<script src="js/deployment-mode.js"></script><script src=');
  if(name==='index.html'){
    html=html.replace('>文字預覽</span>','>網站文字試用版</span>');
    html=html.replace('也能拖曳到這裡 · 單檔 10 MB 內</small>','也能拖曳到這裡 · 單檔 10 MB 內</small><p class="micro">文字、TXT、範例可直接使用。照片／PDF 僅預覽，辨識尚未接通。</p>');
    html=html.replace('單一 HTML 可讀 TXT、貼文字或試合成範例。','這個網站可讀 TXT、貼文字或試合成範例。');
    html=html.replace('<footer><span>','<footer><a class="text-button" href="status.html">資料處理與服務狀態</a><span>');
  }
  await writeFile(p,html);
}
await writeFile(path.join(out,'.nojekyll'),'');
await writeFile(path.join(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
await writeFile(path.join(out,'capabilities.json'),JSON.stringify({
  version:'1.2.1',mode:'public-static-demo',ssoEnabled:false,
  identityProviderConfigured:false,officialSubmissionEnabled:false,
  acceptsCloudUploads:false,cloudCaseStorage:false,
  extraction:{text:true,txt:true,image:false,pdf:false},
  dataRetention:'page-memory-only',commit:process.env.GITHUB_SHA||null
},null,2)+'\n');
const entries=[];
for(const f of (await walk(out)).sort()) {
  const rel=path.relative(out,f).split(path.sep).join('/');
  // .nojekyll is a hosting/build marker, not a browser asset. The Pages artifact
  // action excludes hidden files, and a public GET for this marker can be 404.
  // Keep every actual HTML/CSS/JS/data asset subject to byte-for-byte verification.
  if(rel==='.nojekyll')continue;
  entries.push({path:rel,sha256:createHash('sha256').update(await readFile(f)).digest('hex')});
}
await writeFile(path.join(out,'build-manifest.json'),JSON.stringify({version:'1.2.1',buildOnlyFiles:['.nojekyll'],files:entries},null,2)+'\n');
console.log(`Static build ready: ${entries.length+1} browser assets. No website has been deployed by this script.`);
