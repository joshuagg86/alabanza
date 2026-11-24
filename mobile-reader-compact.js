/* Compact phone reader; tablet and desktop keep every original control. */
(function(){
 'use strict';
 const mq=window.matchMedia('(max-width: 767px)');
 let placements=[],menu=null,toggle=null,body=null;
 const $=id=>document.getElementById(id);
 function closeMenu(){
   if(!menu)return;
   menu.hidden=true;
   toggle?.setAttribute('aria-expanded','false');
 }
 function move(element,parent){
   if(!element||!parent)return;
   placements.push({element,parent:element.parentNode,next:element.nextSibling});
   parent.appendChild(element);
 }
 function enable(){
   if(menu)return;
   const viewer=$('viewSong'),toolbar=viewer?.querySelector('.reader-toolbar');
   if(!toolbar)return;
   viewer.classList.add('reader-phone-compact');
   menu=document.createElement('div');
   menu.id='readerMoreMenu';menu.className='reader-more-menu';menu.hidden=true;
   menu.setAttribute('aria-label','Opciones adicionales');
   toggle=document.createElement('button');
   toggle.type='button';toggle.id='readerMoreButton';toggle.className='reader-more-button';
   toggle.setAttribute('aria-controls','readerMoreMenu');toggle.setAttribute('aria-expanded','false');
   toggle.innerHTML='<i class="fas fa-ellipsis-h" aria-hidden="true"></i><span>Más</span>';
   toggle.addEventListener('click',()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden));});
   toolbar.append(toggle,menu);
   const add=(node,label)=>{
     if(!node)return;
     const item=document.createElement('div');item.className='reader-more-item';
     if(label){const text=document.createElement('small');text.textContent=label;item.appendChild(text);}
     menu.appendChild(item);move(node,item);
   };
   add($('readerChords'),'Acordes');
   add(viewer.querySelector('.reader-size'),'Tamaño de letra');
   add($('btnToggleAudio'),'Metrónomo y pads');
   add($('btnDirectEdit'),'Editar');
   add($('readerScrollSpeed'),'Velocidad de desplazamiento');
   add($('readerLayout'),'Distribución');
   // The phone does not offer fullscreen rehearsal or multi-track mixing.
   const rehearsing=$('readerRehearsal');
   rehearsing?.setAttribute('aria-hidden','true');
   if(viewer.classList.contains('rehearsal-mode')){
     viewer.classList.remove('rehearsal-mode');
     if(document.fullscreenElement===viewer)document.exitFullscreen?.().catch(()=>{});
   }
   document.addEventListener('click',outside);
   document.addEventListener('keydown',escape);
 }
 function outside(e){
   if(menu && !menu.hidden && !menu.contains(e.target) && !toggle.contains(e.target))closeMenu();
 }
 function escape(e){if(e.key==='Escape' && menu && !menu.hidden)closeMenu();}
 function disable(){
   const viewer=$('viewSong');
   viewer?.classList.remove('reader-phone-compact');
   closeMenu();
   placements.reverse().forEach(({element,parent,next})=>{
     if(parent?.isConnected)parent.insertBefore(element,next?.parentNode===parent?next:null);
   });
   placements=[];
   toggle?.remove();menu?.remove();toggle=null;menu=null;
   $('readerRehearsal')?.removeAttribute('aria-hidden');
   document.removeEventListener('click',outside);
   document.removeEventListener('keydown',escape);
 }
 function apply(){if(mq.matches)enable();else disable();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);
 else apply();
 mq.addEventListener?.('change',apply);
})();
