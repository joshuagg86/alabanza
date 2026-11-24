/* Mobile navigation: separate pages for Pads, dedicated service switcher. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const TONES=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
let currentTab='home',padKey='C',padSource=null,padGain=null,padContext=null,padPlaying=false;
const padDecoded=new Map();const padPending=new Map();let padSequence=0;
function showPads(){
  let panel=$('mobilePadsScreen');
  if(panel)return panel;
  panel=document.createElement('section');panel.id='mobilePadsScreen';panel.className='mobile-pads-screen';
  panel.hidden=true;
  panel.innerHTML='<div class="mobile-pads-head"><span class="mobile-eyebrow">AMBIENTE DE ALABANZA</span><h1>Pads</h1><p>Selecciona un tono, reproduce y descarga tus pads para usarlos sin conexión.</p></div><div class="mobile-pad-main"><div class="mobile-pad-note" id="mobilePadNote">C</div><div id="mobilePadState" role="status">Selecciona un tono para comenzar.</div><button type="button" id="mobilePadPlay" class="mobile-pad-primary"><i class="fas fa-play" aria-hidden="true"></i> Reproducir pad</button><button type="button" id="mobilePadDownload" class="mobile-pad-secondary"><i class="fas fa-download" aria-hidden="true"></i> Descargar este tono</button></div><div class="mobile-pad-grid" id="mobilePadGrid" role="group" aria-label="Tonos disponibles"></div>';
  document.getElementById('viewList')?.appendChild(panel);
  for(const key of TONES){
    const button=document.createElement('button');
    button.type='button';button.dataset.tone=key;button.textContent=key;
    button.addEventListener('click',()=>{padKey=key;updatePad();void warmPad(key).catch(()=>{});if(padPlaying)startPad().catch(e=>message(e.message));});
    $('mobilePadGrid').appendChild(button);
  }
  $('mobilePadPlay').addEventListener('click',async()=>{
    if(padPlaying){stopPad();return;}
    try{await startPad();}catch(e){message(e.message);}
  });
  $('mobilePadDownload').addEventListener('click',async()=>{
    const button=$('mobilePadDownload');
    button.disabled=true;
    try{
      await window.AlabanzaAudioOffline.downloadPad(padKey,message);
      message('Pad '+padKey+' guardado en este dispositivo.');
      await updatePad();
      void warmPad(padKey,true).catch(()=>{});
    }catch(e){message(e.message||'No se pudo descargar.');}
    finally{button.disabled=false;}
  });
  updatePad();void warmPad(padKey).catch(()=>{});return panel;
}
function message(text){const p=$('mobilePadState');if(p)p.textContent=text;}
function stopPad(cancel=true){
  if(cancel)padSequence++;
  if(padSource){try{padSource.stop();}catch(_){}padSource.disconnect();padSource=null;}
  if(padGain){padGain.disconnect();padGain=null;}
  padPlaying=false;updatePad();
}
async function warmPad(key,refresh=false){
  if(refresh)padDecoded.delete(key);
  if(padDecoded.has(key))return padDecoded.get(key);
  if(padPending.has(key))return padPending.get(key);
  const promise=(async()=>{
    const saved=await window.AlabanzaAudioOffline?.getPad(key);
    let bytes;
    if(saved?.blob)bytes=await saved.blob.arrayBuffer();
    else {
      if(!navigator.onLine)throw new Error('Descarga este pad para usarlo sin internet.');
      const response=await fetch('https://joshuagg86.github.io/alabanza/pads/'+encodeURIComponent(key)+'.mp3');
      if(!response.ok)throw new Error('No se pudo abrir el pad.');
      bytes=await response.arrayBuffer();
    }
    padContext ||=new (window.AudioContext||window.webkitAudioContext)();
    const buffer=await padContext.decodeAudioData(bytes);
    // Keep no more than two decoded pads in RAM; compressed files remain on disk.
    padDecoded.delete(key);padDecoded.set(key,buffer);
    while(padDecoded.size>2)padDecoded.delete(padDecoded.keys().next().value);
    return buffer;
  })();
  padPending.set(key,promise);
  try{return await promise;}finally{padPending.delete(key)}
}
async function startPad(){
  const request=++padSequence;
  const key=padKey;
  const ready=padDecoded.has(key);
  if(!ready)message('Preparando pad '+key+' por primera vez…');
  const buffer=await warmPad(key);
  if(request!==padSequence||key!==padKey)return;
  padContext ||=new (window.AudioContext||window.webkitAudioContext)();
  await padContext.resume();
  if(request!==padSequence)return;
  stopPad(false);
  const source=padContext.createBufferSource(),gain=padContext.createGain();
  source.buffer=buffer;source.loop=true;gain.gain.value=.55;
  source.connect(gain);gain.connect(padContext.destination);source.start();
  padSource=source;padGain=gain;padPlaying=true;
  updatePad();message('Reproduciendo pad '+key);
}
async function updatePad(){
  if(!$('mobilePadNote'))return;
  $('mobilePadNote').textContent=padKey;
  $('mobilePadPlay').innerHTML=padPlaying?'<i class="fas fa-stop"></i> Detener pad':'<i class="fas fa-play"></i> Reproducir pad';
  for(const button of document.querySelectorAll('#mobilePadGrid button'))button.setAttribute('aria-pressed',String(button.dataset.tone===padKey));
  const chosen=padKey;
  try{
    const saved=await window.AlabanzaAudioOffline?.getPad(chosen);
    if(chosen===padKey)$('mobilePadDownload').textContent=saved?'✓ Descargado':'↓ Descargar este tono';
  }catch(_){}
}
function init(){
  const list=$('viewList');if(!list)return;
  const parent=list.parentElement;
  const service=document.createElement('div');service.id='mobileServiceSwitch';service.className='mobile-service-switch';service.hidden=true;
  service.innerHTML='<h2>Servicios</h2><div class="mobile-service-options"><button type="button" data-service="playlist">Domingo</button><button type="button" data-service="wednesday">Miércoles</button><button type="button" data-service="rol">Rol</button></div>';
  const existing=$('serviceRoleSummary');
  if(existing)existing.before(service);else $('viewDashboard')?.before(service);
  for(const button of service.querySelectorAll('button'))button.addEventListener('click',()=>selectTab(button.dataset.service));
  const pads=showPads();
  const nav=document.createElement('nav');nav.id='alabanzaBottomNav';nav.className='alabanza-bottom-nav';
  nav.setAttribute('aria-label','Navegación principal');
  const entries=[['home','Inicio','fa-house'],['all','Biblioteca','fa-music'],['services','Servicios','fa-calendar-days'],['pads','Pads','fa-wave-square'],['downloads','Descargas','fa-download']];
  const buttons=new Map();
  for(const [key,label,icon] of entries){
    const button=document.createElement('button');
    button.type='button';button.dataset.destination=key;button.setAttribute('aria-label',label);
    button.innerHTML='<i class="fas '+icon+'" aria-hidden="true"></i><span>'+label+'</span>';
    nav.appendChild(button);buttons.set(key,button);
    button.addEventListener('click',()=>{
      if(key==='downloads'){window.AlabanzaOffline?.showDownloads();return;}
      if(key==='pads'){selectTab('pads');return;}
      if(key==='services'){selectTab(['playlist','wednesday','rol'].includes(currentTab)?currentTab:'playlist');return;}
      selectTab(key);
    });
  }
  document.body.appendChild(nav);
  function selectTab(tab){
    const isPads=tab==='pads';
    if(!isPads){
      $('mobilePadsScreen').hidden=true;
      list.classList.remove('mobile-show-pads');
      list.hidden=false;list.style.display='block';
      const id={home:'tabHome',all:'tabAll',playlist:'tabPlaylist',wednesday:'tabWednesday',rol:'tabRol'}[tab];
      $(id)?.click();
    }else{
      list.style.display='block';
      list.classList.add('mobile-show-pads');
      $('mobilePadsScreen').hidden=false;
    }
    if(!isPads)stopPad();
    else void warmPad(padKey).catch(()=>{});
    currentTab=tab;sync();window.scrollTo({top:0,behavior:'instant'});
  }
  const sync=()=>{
    const login=$('loginModal'),reader=$('viewSong');
    const authenticated=login&&getComputedStyle(login).display==='none';
    const viewingSong=reader&&getComputedStyle(reader).display!=='none'&&!reader.hidden;
    nav.hidden=!(authenticated&&!viewingSong);
    service.hidden=!(['playlist','wednesday','rol'].includes(currentTab)&&!viewingSong);
    for(const button of service.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.service===currentTab));
    for(const [key,button] of buttons){
      const active=(key==='services'?['playlist','wednesday','rol'].includes(currentTab):key===currentTab);
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    }
  };
  list.addEventListener('click',e=>{
    const tabs={tabHome:'home',tabAll:'all',tabPlaylist:'playlist',tabWednesday:'wednesday',tabRol:'rol'};
    if(e.target.closest('[id]')?.id in tabs){currentTab=tabs[e.target.closest('[id]').id];}
    requestAnimationFrame(sync);
  });
  new MutationObserver(sync).observe($('viewSong'),{attributes:true,attributeFilter:['style','hidden']});
  new MutationObserver(sync).observe($('loginModal'),{attributes:true,attributeFilter:['style','hidden']});
  sync();
  window.AlabanzaMobile={selectTab,stopPad};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
})();
