/* Persist theme locally, without requiring a Firebase session. */
(function(){
  'use strict';
  const KEY='alabanza-app-theme';
  const media=window.matchMedia('(prefers-color-scheme: dark)');
  const valid=new Set(['light','dark','system']);
  function preference(){
    try{const v=localStorage.getItem(KEY);return valid.has(v)?v:'system'}catch(_){return 'system'}
  }
  function apply(){
    const pref=preference();
    const actual=pref==='system'?(media.matches?'dark':'light'):pref;
    document.documentElement.dataset.appTheme=actual;
    const logo=document.getElementById('alabanzaHeaderLogo');
    if(logo){
      const hasLightLogo=logo.dataset.lightAvailable==='yes';
      const target=actual==='light' && hasLightLogo ? 'logo_claro.png' : 'logo.png';
      if(logo.getAttribute('src')!==target)logo.setAttribute('src',target);
    }
    const btn=document.getElementById('appThemeToggle');
    if(btn){
      btn.textContent=({light:'☀ Claro',dark:'☾ Oscuro',system:'◐ Sistema'})[pref];
      btn.setAttribute('aria-label','Tema actual: '+pref+'. Cambiar tema');
      btn.title='Cambiar tema: claro, oscuro o sistema';
    }
  }
  function cycle(){
    const choices=['system','light','dark'];
    const next=choices[(choices.indexOf(preference())+1)%choices.length];
    try{localStorage.setItem(KEY,next)}catch(_){}
    apply();
  }
  apply();
  if(media.addEventListener)media.addEventListener('change',apply);
  else if(media.addListener)media.addListener(apply);
  document.addEventListener('DOMContentLoaded',()=>{
    if(document.getElementById('appThemeToggle'))return;
    const button=document.createElement('button');
    button.type='button';button.id='appThemeToggle';button.className='app-theme-toggle';
    button.addEventListener('click',cycle);
    const header=document.querySelector('#viewList > header');
    const logoWrap=header?.querySelector('.logo-container');
    const logo=logoWrap?.querySelector('img');
    if(logo){
      logo.id='alabanzaHeaderLogo';
      logo.dataset.lightAvailable='unknown';
      // Check whether logo_claro.png exists before changing the current working logo.
      const probe=new Image();
      probe.onload=()=>{logo.dataset.lightAvailable='yes';apply();};
      probe.onerror=()=>{logo.dataset.lightAvailable='no';apply();};
      probe.src='logo_claro.png';
    }
    if(logoWrap){
      logoWrap.appendChild(button);
    }else{
      document.body.appendChild(button);
    }
    apply();
  });
})();
