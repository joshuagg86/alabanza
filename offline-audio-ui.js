/* Audio-only downloads. Lyrics are synced automatically and are never listed here. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 function panel(){
   let p=$('offlineAudioPanel');if(p)return p;
   p=document.createElement('section');p.id='offlineAudioPanel';
   p.className='offline-lyrics-panel';p.hidden=true;p.setAttribute('aria-label','Descargas de audio');
   p.innerHTML='<div class="offline-lyrics-head"><div><small>DISPONIBLE SIN CONEXIÓN</small><h2>Mis descargas</h2><p>Gestiona tus pads y pistas de ensayo guardados en este celular.</p></div><button type="button" id="offlineAudioClose" aria-label="Cerrar descargas">✕</button></div><div id="offlineAudioStatus" role="status"></div><section id="offlineAudioLibrary"><h3>Pads y canciones</h3><div id="offlineAudioItems"></div></section>';
   document.body.appendChild(p);
   $('offlineAudioClose').addEventListener('click',()=>p.hidden=true);
   return p;
 }
 function notify(text){const el=$('offlineAudioStatus');if(el)el.textContent=text;}
 async function render(){
   panel();
   const container=$('offlineAudioItems');container.textContent='Cargando descargas…';
   try{
     const uid=window.firebase?.auth?.().currentUser?.uid;
     const entries=await window.AlabanzaAudioOffline.entries(uid);
     container.replaceChildren();
     if(!entries.length){
       const empty=document.createElement('p');empty.className='offline-empty';
       empty.textContent='Todavía no tienes pistas ni pads descargados.';container.appendChild(empty);return;
     }
     for(const entry of entries){
       const item=document.createElement('div');item.className='offline-lyrics-item';
       const meta=document.createElement('div');
       const title=document.createElement('strong');
       title.textContent=entry.kind==='pad'?'Pad · '+entry.tone:entry.title;
       const detail=document.createElement('small');
       detail.textContent=(entry.kind==='song'?entry.stems.length+' instrumentos · ':'')+Math.round(entry.bytes/1048576)+' MB';
       meta.append(title,detail);
       const remove=document.createElement('button');remove.type='button';remove.textContent='Eliminar';
       remove.setAttribute('aria-label','Eliminar '+title.textContent);
       remove.addEventListener('click',async()=>{
         remove.disabled=true;
         try{
           if(entry.kind==='pad')await window.AlabanzaAudioOffline.deletePad(entry.tone);
           else if(uid)await window.AlabanzaAudioOffline.deleteSong(uid,entry.id);
           notify('Audio eliminado del dispositivo.');await render();
         }catch(_){notify('No se pudo eliminar el archivo.');remove.disabled=false;}
       });
       item.append(meta,remove);container.appendChild(item);
     }
   }catch(_){container.textContent='No fue posible consultar las descargas.';}
 }
 async function showDownloads(){panel().hidden=false;await render();}
 function init(){
   const pad=$('padCapsule');
   if(pad&&!$('downloadSelectedPad')){
     const button=document.createElement('button');button.type='button';
     button.id='downloadSelectedPad';button.className='offline-save-button';
     button.textContent='Descargar pad';
     button.addEventListener('click',async()=>{
       const tone=$('padKeySelect')?.value;if(!tone)return;
       button.disabled=true;
       try{
         if(!navigator.onLine)throw new Error('Sin conexión');
         button.textContent='Descargando '+tone+'…';
         await window.AlabanzaAudioOffline.downloadPad(tone,text=>{button.textContent=text;});
         button.textContent='✓ Pad '+tone+' guardado';
       }catch(error){button.textContent=!navigator.onLine?'Sin conexión':String(error.message||'Error al descargar');}
       finally{button.disabled=false;}
     });
     pad.parentElement?.appendChild(button);
   }
   window.AlabanzaAudioOfflineUI={render,showDownloads};
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
