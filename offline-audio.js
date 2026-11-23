/* Private offline audio storage for preview. No credentials or signed URLs are persisted.
   IndexedDB is browser-managed: the native APK will replace this adapter with Filesystem. */
(function(global){
 'use strict';
 const DB='alabanza-audio-offline-v1',STORE='media';
 let dbPromise;
 function db(){
   if(dbPromise)return dbPromise;
   dbPromise=new Promise((resolve,reject)=>{
     const req=indexedDB.open(DB,1);
     req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'key'});};
     req.onsuccess=()=>resolve(req.result);
     req.onerror=()=>reject(req.error);
   }).catch(err=>{dbPromise=null;throw err;});
   return dbPromise;
 }
 async function op(mode, callback){
   const conn=await db();
   return new Promise((resolve,reject)=>{
     const tx=conn.transaction(STORE,mode);
     const req=callback(tx.objectStore(STORE));
     tx.oncomplete=()=>resolve(req?.result);
     tx.onerror=()=>reject(tx.error);
     tx.onabort=()=>reject(tx.error||new Error('No se pudo guardar el archivo.'));
   });
 }
 const songKey=(uid,id)=>'song:'+uid+':'+id;
 const padKey=key=>'pad:'+key;
 const getSong=(uid,id)=>op('readonly',s=>s.get(songKey(uid,id)));
 const getPad=key=>op('readonly',s=>s.get(padKey(key)));
 const deleteSong=(uid,id)=>op('readwrite',s=>s.delete(songKey(uid,id)));
 const deletePad=key=>op('readwrite',s=>s.delete(padKey(key)));
 async function entries(uid){
   return (await op('readonly',s=>s.getAll())).filter(x=>x.kind==='pad'||(x.kind==='song'&&x.uid===uid));
 }
 const ensureStemUrl=(value,origin)=>{
   const url=new URL(value);
   if(url.origin!==origin||!url.pathname.startsWith('/storage/v1/object/sign/'))
      throw new Error('La ruta de una pista no es válida.');
   return url.href;
 };
 async function downloadSong(song,status,cloud,report){
   const user=global.firebase?.auth?.().currentUser;
   if(!user)throw new Error('Inicia sesión para descargar canciones.');
   if(!navigator.onLine)throw new Error('Conéctate a internet para descargar.');
   if(!status?.ready||!status.cloud||!status.files)throw new Error('Esta canción todavía no tiene pistas disponibles en la nube.');
   const names=Array.isArray(status.stems)?status.stems:['vocals','drums','bass','other'];
   if(![4,6].includes(names.length)||!names.every(x=>['vocals','guitar','bass','piano','drums','other'].includes(x))||new Set(names).size!==names.length)
     throw new Error('El paquete de audio no tiene una lista válida de instrumentos.');
   const tracks={};let bytes=0;
   for(let i=0;i<names.length;i++){
     const name=names[i];
     report?.('Descargando '+(i+1)+' de '+names.length+': '+name);
     const response=await fetch(ensureStemUrl(status.files[name],cloud.url),{cache:'no-store'});
     if(!response.ok)throw new Error('Falló la descarga de '+name+'. Inténtalo de nuevo.');
     const blob=await response.blob();
     if(blob.size===0)throw new Error('La pista '+name+' llegó vacía.');
     tracks[name]=blob;
     bytes+=blob.size;
   }
   // One atomic transaction. Partial downloads never appear as saved.
   const entry={
     key:songKey(user.uid,String(song.id)),kind:'song',uid:user.uid,id:String(song.id),
     title:String(song.titulo||'Sin título'),artist:String(song.artista||''),
     version:String(status.version||''),stems:names,frames:status.frames,sampleRate:status.sampleRate,
     tracks,bytes,savedAt:Date.now()
   };
   await op('readwrite',s=>s.put(entry));
   report?.('Canción descargada · '+Math.round(bytes/1048576)+' MB');
   return entry;
 }
 async function downloadPad(key,report){
   if(!['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'].includes(key))
     throw new Error('Tono inválido.');
   if(!navigator.onLine)throw new Error('Conéctate a internet para descargar.');
   report?.('Descargando pad '+key+'…');
   // Dedicated public source; path stays stable across preview and production sites.
   const source='https://joshuagg86.github.io/alabanza/pads/'+encodeURIComponent(key)+'.mp3';
   const response=await fetch(source,{cache:'no-store'});
   if(!response.ok)throw new Error('No se pudo descargar el pad '+key+'.');
   const blob=await response.blob();
   if(!blob.size||blob.size>30000000)throw new Error('El archivo del pad no es válido.');
   const record={key:padKey(key),kind:'pad',tone:key,blob,bytes:blob.size,savedAt:Date.now()};
   await op('readwrite',s=>s.put(record));
   report?.('Pad '+key+' guardado · '+Math.round(blob.size/1048576)+' MB');
   return record;
 }
 global.AlabanzaAudioOffline={getSong,getPad,deleteSong,deletePad,downloadSong,downloadPad,entries};
})(window);
