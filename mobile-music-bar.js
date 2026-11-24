/* Phone-only persistent music bar: independent Pads, Metronome, Ensayar.
   Reuse existing WebAudio controls and mixing engine; do not recreate players. */
(function(){
 'use strict';
 const mq=window.matchMedia('(max-width:767px)');
 const $=id=>document.getElementById(id);
 const moved=[];
 let bar=null,sheet=null,title=null,content=null,active=null,observer=null;
 let bound=false;
 function move(node,to){
   if(!node||!to)return;
   moved.push({node,parent:node.parentNode,next:node.nextSibling});
   to.appendChild(node);
 }
 function restore(){
   for(const item of moved.reverse()){
     if(item.parent?.isConnected)item.parent.insertBefore(item.node,item.next?.parentNode===item.parent?item.next:null);
   }
   moved.length=0;
 }
 function readerVisible(){
   const reader=$('viewSong');
   return !!reader&&reader.style.display!=='none'&&getComputedStyle(reader).display!=='none';
 }
 function sync(){
   if(!bar)return;
   const shown=readerVisible();
   bar.hidden=!shown;
   if(!shown)close(false);
 }
 function close(restoreFocus=true){
   if(!sheet)return;
   active=null;sheet.hidden=true;
   bar?.querySelectorAll('[data-tool]').forEach(button=>{
     button.setAttribute('aria-expanded','false');button.removeAttribute('aria-pressed');
   });
   $('metroVolPopup')?.classList.remove('show');
   $('padVolPopup')?.classList.remove('show');
   // Deliberately do not stop the pad, metronome or rehearsal playback.
   if(restoreFocus && readerVisible())$('songContent')?.focus({preventScroll:true});
 }
 function open(kind){
   if(!readerVisible())return;
   if(active===kind){close(false);return;}
   close(false);
   if(kind==='ensayar'){
     $('rehearsalToggle')?.click();
     return;
   }
   active=kind;
   title.textContent=kind==='pads'?'Pads':'Metrónomo';
   content.querySelectorAll('[data-panel]').forEach(node=>node.hidden=node.dataset.panel!==kind);
   sheet.hidden=false;
   bar.querySelector('[data-tool="'+kind+'"]')?.setAttribute('aria-expanded','true');
   // Hide only the container; do not stop audio.
 }
 function button(kind,label,iconName){
   const b=document.createElement('button');
   b.type='button';b.dataset.tool=kind;b.setAttribute('aria-controls','phoneMusicSheet');
   b.setAttribute('aria-expanded','false');
   b.innerHTML='<i class="fas '+iconName+'" aria-hidden="true"></i><span>'+label+'</span>';
   b.addEventListener('click',()=>open(kind));
   return b;
 }
 function section(name){
   const node=document.createElement('section');
   node.dataset.panel=name;
   node.className='phone-music-controls';node.hidden=true;
   return node;
 }
 function volume(sectionNode,id,label){
   const slider=$(id);if(!slider)return;
   const row=document.createElement('div');row.className='phone-music-volume';
   const text=document.createElement('label');text.textContent=label;text.htmlFor=id;
   row.appendChild(text);move(slider,row);sectionNode.appendChild(row);
 }
 function initialize(){
   if(bar||!$('viewSong'))return;
   const rack=$('audioDock');
   const metro=rack?.querySelector('.bar-section.left');
   const pads=rack?.querySelector('.bar-section.right');
   if(!rack||!metro||!pads||!$('rehearsalToggle'))return;
   bar=document.createElement('nav');bar.id='phoneMusicBar';
   bar.setAttribute('aria-label','Herramientas musicales');
   bar.hidden=true;
   bar.append(button('pads','Pads','fa-wave-square'),button('metronomo','Metrónomo','fa-stopwatch'),button('ensayar','Ensayar','fa-sliders-h'));
   sheet=document.createElement('section');
   sheet.id='phoneMusicSheet';sheet.hidden=true;
   sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','false');
   sheet.setAttribute('aria-label','Herramientas musicales');
   const head=document.createElement('div');head.className='phone-music-sheet-head';
   title=document.createElement('h3');
   const dismiss=document.createElement('button');dismiss.type='button';
   dismiss.setAttribute('aria-label','Cerrar herramientas');
   dismiss.innerHTML='<i class="fas fa-times" aria-hidden="true"></i>';
   dismiss.addEventListener('click',()=>close(false));
   head.append(title,dismiss);
   content=document.createElement('div');content.className='phone-music-sheet-content';
   const padPanel=section('pads'),metroPanel=section('metronomo');
   const metroHelp=$('metronomeHelp');
   if(metroHelp)move(metroHelp,metroPanel);
   move(metro,metroPanel);
   volume(metroPanel,'metroVolumeSlider','Volumen del metrónomo');
   move(pads,padPanel);
   volume(padPanel,'padVolumeSlider','Volumen del pad');
   content.append(padPanel,metroPanel);
   sheet.append(head,content);
   document.body.append(bar,sheet);
   observer=new MutationObserver(sync);
   observer.observe($('viewSong'),{attributes:true,attributeFilter:['style','hidden','class']});
   document.addEventListener('keydown',onKey);
   bound=true;sync();
 }
 function onKey(event){if(event.key==='Escape'&&active){close(false);event.stopPropagation();}}
 function destroy(){
   close(false);
   observer?.disconnect();observer=null;
   if(bound)document.removeEventListener('keydown',onKey);
   bound=false;
   restore();
   bar?.remove();sheet?.remove();
   bar=null;sheet=null;active=null;
 }
 function apply(){if(mq.matches)initialize();else destroy();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);
 else apply();
 mq.addEventListener?.('change',apply);
})();
