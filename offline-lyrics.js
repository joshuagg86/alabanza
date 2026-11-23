/* Preview-only offline lyrics library. No Firebase credentials, no audio URLs or auth tokens stored. */
(function(){
 'use strict';
 const DB='alabanza-offline-v1', STORE='lyrics';
 let current=null, dbPromise;
 function openDb(){
   if(dbPromise)return dbPromise;
   dbPromise=new Promise((resolve,reject)=>{
     const request=indexedDB.open(DB,1);
     request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'id'});};
     request.onsuccess=()=>resolve(request.result);
     request.onerror=()=>reject(request.error);
   });
   return dbPromise;
 }
 async function query(mode,fn){
   const db=await openDb();
   return new Promise((resolve,reject)=>{
     const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
     const req=fn(store);
     req.onsuccess=()=>resolve(req.result);
     req.onerror=()=>reject(req.error);
   });
 }
 const saved=id=>query('readonly',s=>s.get(id));
 const all=()=>query('readonly',s=>s.getAll());
 const remove=id=>query('readwrite',s=>s.delete(id));
 function notice(msg){
   const el=document.getElementById('offlineLyricsStatus');
   if(el)el.textContent=msg;
 }
 async function save(){
   if(!current)return;
   const user=window.firebase?.auth?.().currentUser;
   if(!user){notice('Inicia sesión para guardar canciones.');return;}
   const entry={
     id:String(current.id), uid:user.uid,
     titulo:String(current.titulo||'Sin título'),
     artista:String(current.artista||''),
     tonoOriginal:String(current.tonoOriginal||''),
     bpm:String(current.bpm||''),
     letraChordPro:String(current.letraChordPro||''),
     updatedAt:Date.now()
   };
   if(!entry.letraChordPro.trim()){notice('Esta canción no tiene letra para descargar.');return;}
   try{
     await query('readwrite',s=>s.put(entry));
     notice('Letra guardada en este dispositivo.');
     refreshBtn();renderList();
   }catch(e){notice('No se pudo guardar. Revisa el espacio disponible.');}
 }
 async function refreshBtn(){
   const btn=document.getElementById('saveOfflineLyrics');
   if(!btn||!current)return;
   try{
     const user=window.firebase?.auth?.().currentUser;
     const entry=await saved(String(current.id));
     const exists=Boolean(entry&&entry.uid===user?.uid);
     btn.innerHTML=exists?'<i class="fas fa-check-circle" aria-hidden="true"></i> Letra guardada':'<i class="fas fa-download" aria-hidden="true"></i> Guardar letra';
   }catch(_){btn.textContent='Guardar letra';}
 }
 function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function getPanel(){
   let p=document.getElementById('offlineLyricsPanel');
   if(p)return p;
   p=document.createElement('section');
   p.id='offlineLyricsPanel';p.className='offline-lyrics-panel';
   p.hidden=true;
   p.setAttribute('aria-label','Letras descargadas');
   p.innerHTML='<div class="offline-lyrics-head"><div><small>DISPONIBLE SIN CONEXIÓN</small><h2>Mis descargas</h2><p>Guarda las letras individualmente para leerlas sin internet.</p></div><button type="button" id="offlineLyricsClose" aria-label="Cerrar descargas">✕</button></div><div id="offlineLyricsStatus" role="status"></div><div id="offlineLyricsList"></div>';
   document.body.appendChild(p);
   document.getElementById('offlineLyricsClose').addEventListener('click',()=>p.hidden=true);
   p.addEventListener('click',async e=>{
     const button=e.target.closest('button[data-action]');
     if(!button)return;
     const id=button.dataset.id;
     if(button.dataset.action==='delete'){
       await remove(id);await renderList();notice('Descarga eliminada.');
     }
     if(button.dataset.action==='read'){
       const entry=await saved(id);
       if(entry){
         p.hidden=true;
         window.dispatchEvent(new CustomEvent('alabanza:open-saved-song',{detail:{song:entry}}));
       }
     }
   });
   return p;
 }
 async function renderList(){
   const list=document.getElementById('offlineLyricsList');if(!list)return;
   try{
     const user=window.firebase?.auth?.().currentUser;
     const rows=(await all()).filter(x=>x.uid===user?.uid).sort((a,b)=>b.updatedAt-a.updatedAt);
     if(!rows.length){list.innerHTML='<p class="offline-empty">Todavía no has guardado letras. Abre una canción y selecciona «Guardar letra».</p>';return;}
     list.replaceChildren();
     for(const x of rows){
       const item=document.createElement('div');item.className='offline-lyrics-item';
       const meta=document.createElement('div');
       const title=document.createElement('strong');title.textContent=x.titulo;
       const subtitle=document.createElement('small');subtitle.textContent=[x.artista,x.tonoOriginal].filter(Boolean).join(' · ');
       meta.append(title,subtitle);
       const read=document.createElement('button');read.type='button';read.dataset.action='read';read.dataset.id=x.id;read.textContent='Ver';
       const del=document.createElement('button');del.type='button';del.dataset.action='delete';del.dataset.id=x.id;del.textContent='Eliminar';del.setAttribute('aria-label','Eliminar '+x.titulo);
       item.append(meta,read,del);list.appendChild(item);
     }
   }catch(_){list.textContent='No se pudo abrir el almacenamiento local.';}
 }
 async function show(){
   const panel=getPanel();panel.hidden=false;
   document.getElementById('offlineLyricsList').hidden=false;
   document.getElementById('offlineLyricsReader')?.setAttribute('hidden','');
   await renderList();
   await window.AlabanzaAudioOfflineUI?.render();
 }
 function init(){
   const reader=document.getElementById('viewSong');
   const head=reader?.querySelector('.reader-heading');
   if(head && !document.getElementById('saveOfflineLyrics')){
     const btn=document.createElement('button');btn.type='button';btn.id='saveOfflineLyrics';btn.className='offline-save-button';
     btn.textContent='Guardar letra';btn.addEventListener('click',save);
     head.appendChild(btn);
   }
   window.addEventListener('alabanza:song-opened',e=>{current=e.detail?.song||null;refreshBtn();});
   window.AlabanzaOffline={showDownloads:show};
   getPanel();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
