/* Download controls for individual pads and stored multitrack songs. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
function notify(text){
 const target=$('offlineLyricsStatus');
 if(target)target.textContent=text;
}
async function render(){
 const panel=$('offlineLyricsPanel');if(!panel)return;
 let section=$('offlineAudioLibrary');
 if(!section){
   section=document.createElement('section');section.id='offlineAudioLibrary';
   section.innerHTML='<h3>Pads y pistas guardados</h3><div id="offlineAudioItems"></div>';
   panel.appendChild(section);
 }
 const list=$('offlineAudioItems');list.textContent='Cargando descargas…';
 try {
   const user=window.firebase?.auth?.().currentUser;
   if(!user){list.textContent='Inicia sesión para consultar tus descargas.';return;}
   const items=await window.AlabanzaAudioOffline.entries(user.uid);
   list.replaceChildren();
   if(!items.length){list.textContent='Todavía no hay pads ni pistas descargados.';return;}
   for(const item of items){
     const row=document.createElement('div');row.className='offline-lyrics-item';
     const info=document.createElement('div');
     const title=document.createElement('strong');title.textContent=item.kind==='pad'?'Pad · '+item.tone:item.title;
     const description=document.createElement('small');
     description.textContent=(item.kind==='song'?item.stems.length+' instrumentos · ':'')+Math.round(item.bytes/1048576)+' MB';
     info.append(title,description);
     const remove=document.createElement('button');remove.type='button';remove.textContent='Eliminar';
     remove.addEventListener('click',async()=>{
       try{
         if(item.kind==='pad')await window.AlabanzaAudioOffline.deletePad(item.tone);
         else await window.AlabanzaAudioOffline.deleteSong(user.uid,item.id);
         await render();notify('Archivo eliminado del dispositivo.');
       }catch(_){notify('No se pudo eliminar el archivo.');}
     });
     row.append(info,remove);list.appendChild(row);
   }
 }catch(_){list.textContent='No fue posible consultar los archivos descargados.';}
}
function init(){
 const pad=$('padCapsule');
 if(pad && !$('downloadSelectedPad')){
   const button=document.createElement('button');
   button.type='button';button.id='downloadSelectedPad';button.className='offline-save-button';
   button.textContent='Descargar pad';button.setAttribute('aria-label','Descargar pad seleccionado');
   button.addEventListener('click',async()=>{
     const tone=$('padKeySelect')?.value;
     if(!tone)return;
     button.disabled=true;
     const previous=button.textContent;
     try{
       button.textContent='Descargando '+tone+'…';
       await window.AlabanzaAudioOffline.downloadPad(tone,txt=>{button.textContent=txt;});
       button.textContent='Pad '+tone+' guardado';
     }catch(error){button.textContent='Error · reintentar';console.warn('Descarga de pad no disponible',error.name);}
     finally{button.disabled=false;setTimeout(()=>{if(button.textContent!=='Descargando '+tone+'…')button.textContent=previous;},3500);}
   });
   pad.parentElement?.appendChild(button);
 }
 window.AlabanzaAudioOfflineUI={render};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
