/* Progressive navigation for Android-oriented mobile layout. Keeps existing tab logic. */
(function(){
  'use strict';
  function init(){
    if(document.getElementById('alabanzaBottomNav'))return;
    const list=document.getElementById('viewList');
    if(!list)return;
    const entries=[
      ['home','Inicio','fa-house'],
      ['all','Biblioteca','fa-music'],
      ['playlist','Servicios','fa-calendar-days'],
      ['pads','Pads','fa-wave-square'],
      ['settings','Ajustes','fa-gear']
    ];
    const nav=document.createElement('nav');
    nav.id='alabanzaBottomNav';
    nav.className='alabanza-bottom-nav';
    nav.setAttribute('aria-label','Navegación principal');
    const buttons=new Map();
    entries.forEach(([key,label,icon])=>{
      const button=document.createElement('button');
      button.type='button';button.dataset.destination=key;
      button.setAttribute('aria-label',label);
      const glyph=document.createElement('i');
      glyph.className='fas '+icon;glyph.setAttribute('aria-hidden','true');
      const caption=document.createElement('span');caption.textContent=label;
      button.append(glyph,caption);nav.appendChild(button);buttons.set(key,button);
      button.addEventListener('click',()=>{
        if(key==='pads'){
          const rack=document.getElementById('audioDock');
          if(rack && typeof window.toggleAudioRack==='function'){
            window.toggleAudioRack();
            rack.scrollIntoView({block:'nearest',behavior:'smooth'});
          }else{
            const native=document.getElementById('btnToggleAudio');
            if(native)native.click();
          }
        }else if(key==='settings'){
          document.getElementById('appThemeToggle')?.click();
        }else {
          const original=document.getElementById(({home:'tabHome',all:'tabAll',playlist:'tabPlaylist'})[key]);
          original?.click();
          window.scrollTo({top:0,behavior:'smooth'});
        }
        update();
      });
    });
    document.body.appendChild(nav);
    const update=()=>{
      const login=document.getElementById('loginModal');
      const reader=document.getElementById('viewSong');
      const visibleLogin=login && getComputedStyle(login).display!=='none' && getComputedStyle(login).visibility!=='hidden';
      const visibleReader=reader && getComputedStyle(reader).display!=='none' && !reader.hidden;
      const visibleList=getComputedStyle(list).display!=='none' && !list.hidden;
      nav.hidden=Boolean(visibleLogin||visibleReader||!visibleList);
      const active=entries.find(([key])=>key!=='pads'&&key!=='settings'&&
        document.getElementById(({home:'tabHome',all:'tabAll',playlist:'tabPlaylist'})[key])?.classList.contains('active'))?.[0]||'home';
      buttons.forEach((button,key)=>{
        if(key===active)button.setAttribute('aria-current','page');
        else button.removeAttribute('aria-current');
      });
    };
    nav.addEventListener('focusout',update);
    document.getElementById('viewList')?.addEventListener('click',()=>requestAnimationFrame(update));
    const observer=new MutationObserver(update);
    [document.getElementById('loginModal'),document.getElementById('viewSong'),list].filter(Boolean).forEach(node=>
      observer.observe(node,{attributes:true,attributeFilter:['style','class','hidden']}));
    update();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
