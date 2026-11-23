/* Generate an entirely local app shell; never ship unprocessed recordings or backend folders. */
import {mkdir,copyFile,readFile,writeFile,cp,readdir,rm} from 'node:fs/promises';
import {join,extname} from 'node:path';
const root=process.cwd(),out=join(root,'www');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
const allow=new Set(['.html','.js','.css','.json','.png','.svg','.webp','.ico']);
for(const entry of await readdir(root,{withFileTypes:true})){
 if(!entry.isFile()||!allow.has(extname(entry.name))||entry.name==='package.json'||entry.name==='package-lock.json')continue;
 await copyFile(join(root,entry.name),join(out,entry.name));
}
await mkdir(join(out,'vendor'),{recursive:true});
await mkdir(join(out,'vendor/fontawesome/css'),{recursive:true});
await copyFile(join(root,'node_modules/@fortawesome/fontawesome-free/css/all.min.css'),join(out,'vendor/fontawesome/css/all.min.css'));
await cp(join(root,'node_modules/@fortawesome/fontawesome-free/webfonts'),join(out,'vendor/fontawesome/webfonts'),{recursive:true});
await copyFile(join(root,'node_modules/sortablejs/Sortable.min.js'),join(out,'vendor/sortable.min.js'));
const firebaseFiles=['firebase-app-compat.js','firebase-firestore-compat.js','firebase-auth-compat.js'];
for(const filename of firebaseFiles){
 const url='https://www.gstatic.com/firebasejs/10.7.0/'+filename;
 let ok=false,error;
 for(let n=0;n<3&&!ok;n++){
  try{
   const response=await fetch(url);
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=Buffer.from(await response.arrayBuffer());
   if(data.byteLength<1000)throw Error('Unexpected Firebase file size');
   await writeFile(join(out,'vendor',filename),data);
   ok=true;
  }catch(e){error=e;}
 }
 if(!ok)throw Error('Could not vendor '+filename+': '+error?.message);
}
let html=await readFile(join(out,'index.html'),'utf8');
html=html.replace('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css','vendor/fontawesome/css/all.min.css');
html=html.replace('https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js','vendor/sortable.min.js');
for(const filename of firebaseFiles)html=html.replace('https://www.gstatic.com/firebasejs/10.7.0/'+filename,'vendor/'+filename);
html=html.replace(/<link href="https:\/\/fonts.googleapis.com\/css2\?[^"]+" rel="stylesheet">/,'');
html=html.replace('<meta name="viewport" content="width=device-width, initial-scale=1.0">','<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">');
html=html.replace('<meta name="theme-color" content="#1b355b">','<meta name="theme-color" content="#081525">');
await writeFile(join(out,'index.html'),html);
let app=await readFile(join(out,'index-app.js'),'utf8');
app=app.replace("if ('serviceWorker' in navigator) {","if (!window.Capacitor?.isNativePlatform?.() && 'serviceWorker' in navigator) {");
await writeFile(join(out,'index-app.js'),app);
console.log('Built offline-capable Android web shell with bundled Firebase, SortableJS and icons. Pads and song stems remain individual downloads.');
