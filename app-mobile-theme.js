/* Alabanza Android — único tema oscuro. Sin selector ni preferencias heredadas. */
(function(){
  'use strict';
  document.documentElement.dataset.appTheme='dark';
  document.documentElement.style.colorScheme='dark';
  try{localStorage.removeItem('alabanza-app-theme');}catch(_){}
  const sync=()=>{
    document.documentElement.dataset.appTheme='dark';
    document.getElementById('appThemeToggle')?.remove();
    const logo=document.querySelector('#viewList > header .logo-container img');
    if(logo && logo.getAttribute('src')!=='logo.png')logo.setAttribute('src','logo.png');
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);
  else sync();
})();
