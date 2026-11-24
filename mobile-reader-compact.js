/* Single-row phone reader toolbar. Controls and menu are restored for tablets/PC. */
(function(){
 'use strict';
 const mq=window.matchMedia('(max-width: 767px)');
 const $=id=>document.getElementById(id);
 let slots=[],panel=null,trigger=null,closeButton=null,previousFocus=null;
 function move(element,destination){
   if(!element||!destination)return;
   slots.push({element,parent:element.parentNode,next:element.nextSibling});
   destination.appendChild(element);
 }
 function restore(){
   slots.reverse().forEach(({element,parent,next})=>{
     if(parent?.isConnected)parent.insertBefore(element,next?.parentNode===parent?next:null);
   });
   slots=[];
 }
 function close(){
   if(!panel)return;
   panel.hidden=true;trigger?.setAttribute('aria-expanded','false');
 }
 function position(){
   if(!panel||panel.hidden||!trigger)return;
   const rectangle=trigger.getBoundingClientRect();
   const margin=12, width=Math.min(296,window.innerWidth-24);
   panel.style.width=width+'px';
   panel.style.left=Math.max(margin,Math.min(window.innerWidth-width-margin,rectangle.right-width))+'px';
   const availableBelow=window.innerHeight-rectangle.bottom-15;
   if(availableBelow>=230){
     panel.style.top=Math.max(margin,rectangle.bottom+8)+'px';
     panel.style.bottom='auto';
     panel.style.maxHeight=Math.max(130,availableBelow-8)+'px';
   }else{
     panel.style.top='auto';
     panel.style.bottom=Math.max(margin,window.innerHeight-rectangle.top+8)+'px';
     panel.style.maxHeight=Math.max(130,rectangle.top-24)+'px';
   }
 }
 function onDocumentPointer(event){
   if(panel&&!panel.hidden&&!panel.contains(event.target)&&!trigger?.contains(event.target))close();
 }
 function onKey(event){
   if(event.key==='Escape'&&panel&&!panel.hidden){
     close();trigger?.focus();event.stopPropagation();
   }
 }
 function enable(){
   if(panel)return;
   const reader=$('viewSong');
   const controls=reader?.querySelector('.header-row-bottom .controls-group');
   if(!reader||!controls)return;
   reader.classList.add('reader-phone-compact');
   // Keep the original DOM elements and their event handlers.
   move($('readerSections'),controls);
   move(reader.querySelector('.reader-autoscroll'),controls);
   panel=document.createElement('div');
   panel.id='readerMoreMenu';panel.className='reader-more-menu';
   panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Ajustes de lectura');
   panel.hidden=true;
   document.body.appendChild(panel); // portal bypasses reader clipping, scroll and stacking contexts
   trigger=document.createElement('button');
   trigger.type='button';trigger.id='readerMoreButton';trigger.className='reader-more-button';
   trigger.setAttribute('aria-label','Ajustes de lectura');
   trigger.setAttribute('title','Ajustes de lectura');
   trigger.setAttribute('aria-controls','readerMoreMenu');trigger.setAttribute('aria-expanded','false');
   trigger.innerHTML='<i class="fas fa-sliders-h" aria-hidden="true"></i>';
   controls.appendChild(trigger);
   trigger.addEventListener('click',event=>{
     event.preventDefault();event.stopPropagation();
     panel.hidden=!panel.hidden;
     trigger.setAttribute('aria-expanded',String(!panel.hidden));
     if(!panel.hidden)position();
   });
   function add(element,label){
     if(!element)return;
     const row=document.createElement('div');row.className='reader-more-item';
     const heading=document.createElement('span');heading.className='reader-more-label';
     heading.textContent=label;
     row.appendChild(heading);panel.appendChild(row);move(element,row);
   }
   add($('readerChords'),'Mostrar acordes');
   add(reader.querySelector('.reader-size'),'Tamaño de letra');
   add($('btnDirectEdit'),'Editar canción');
   add($('readerScrollSpeed'),'Velocidad de lectura');
   const rehearsal=$('readerRehearsal');
   rehearsal?.setAttribute('aria-hidden','true');
   if(reader.classList.contains('rehearsal-mode')){
     reader.classList.remove('rehearsal-mode');
     if(document.fullscreenElement===reader)document.exitFullscreen?.().catch(()=>{});
   }
   document.addEventListener('pointerdown',onDocumentPointer,true);
   document.addEventListener('keydown',onKey,true);
   window.addEventListener('resize',position);
   reader.addEventListener('scroll',close,true);
 }
 function disable(){
   $('viewSong')?.classList.remove('reader-phone-compact');
   close();restore();
   trigger?.remove();panel?.remove();trigger=null;panel=null;
   $('readerRehearsal')?.removeAttribute('aria-hidden');
   document.removeEventListener('pointerdown',onDocumentPointer,true);
   document.removeEventListener('keydown',onKey,true);
   window.removeEventListener('resize',position);
 }
 function apply(){if(mq.matches)enable();else disable();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);
 else apply();
 mq.addEventListener?.('change',apply);
})();
