/* Automatic lyrics sync. No manual downloads, no UI in the Downloads screen.
 * Android: one JSON file per authenticated user in Capacitor Directory.Data.
 * Web preview: IndexedDB fallback. No auth tokens or signed audio URLs stored.
 */
(function(){
  'use strict';
  const DB='alabanza-song-library-v1',STORE='catalogs';
  const pending=new Map();
  function nativeFilesystem(){
    if(!window.Capacitor?.isNativePlatform?.())return null;
    const fs=window.Capacitor?.Plugins?.Filesystem;
    if(!fs)throw new Error('Almacenamiento nativo no disponible. Instala la APK actualizada.');
    return fs;
  }
  function filename(uid){return 'lyrics/catalog-'+encodeURIComponent(uid)+'.json';}
  function openDatabase(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB,1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'uid'});};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  async function browserGet(uid){
    const db=await openDatabase();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(uid);
      req.onsuccess=()=>{resolve(req.result?.songs||[]);db.close();};
      req.onerror=()=>{reject(req.error);db.close();};
    });
  }
  async function browserSave(uid,songs){
    const db=await openDatabase();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put({uid,songs,updatedAt:Date.now()});
      tx.oncomplete=()=>{resolve();db.close();};
      tx.onerror=()=>{reject(tx.error);db.close();};
    });
  }
  async function restore(uid){
    if(!uid)return [];
    const fs=nativeFilesystem();
    if(!fs)return browserGet(uid);
    try{
      const result=await fs.readFile({path:filename(uid),directory:'DATA',encoding:'utf8'});
      const content=typeof result.data==='string'?result.data:'';
      const data=JSON.parse(content);
      return data.uid===uid&&Array.isArray(data.songs)?data.songs:[];
    }catch(err){
      if(/not found|does not exist|ENOENT/i.test(String(err.message||err)))return [];
      console.warn('Error al recuperar letras almacenadas:',err);
      return [];
    }
  }
  function serialize(songs){
    // Remove Firestore class instances and avoid persisting credentials or media URLs.
    return songs.filter(s=>s?.id).map(s=>({
      id:String(s.id),titulo:String(s.titulo||''),artista:String(s.artista||''),
      letraChordPro:String(s.letraChordPro||''),
      tonoOriginal:String(s.tonoOriginal||''),bpm:s.bpm??null,
      compas:s.compas??null,estructura:s.estructura??null,
      tono:s.tono??null, notas:s.notas??null
    }));
  }
  async function save(uid,songs){
    if(!uid||!Array.isArray(songs)||!songs.length)return;
    const previous=pending.get(uid)||Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{
      const clean=serialize(songs);
      const fs=nativeFilesystem();
      if(fs){
        await fs.mkdir({path:'lyrics',directory:'DATA',recursive:true});
        await fs.writeFile({path:filename(uid),directory:'DATA',encoding:'utf8',
          data:JSON.stringify({version:1,uid,updatedAt:Date.now(),songs:clean}),recursive:true});
      }else await browserSave(uid,clean);
      window.dispatchEvent(new CustomEvent('alabanza:lyrics-synced',{detail:{count:clean.length}}));
    });
    pending.set(uid,task);
    try{await task;}finally{if(pending.get(uid)===task)pending.delete(uid);}
  }
  window.AlabanzaLyricsStore={restore,save};
})();
