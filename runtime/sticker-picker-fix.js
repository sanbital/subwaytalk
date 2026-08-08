(function(){
  'use strict';
  var stickers=['⭐','☕','🚇','☁️','💚','🐱','🌙','🍀'];
  function patch(){var el=document.querySelector('.sw-stickers');if(!el||el.dataset.ready)return;el.dataset.ready='1';el.innerHTML=stickers.map(function(s){return '<button type="button" style="border:1px solid #E1E5EB;background:#fff;border-radius:9px;padding:6px 8px;font-size:18px;margin-right:4px">'+s+'</button>';}).join('');}
  new MutationObserver(patch).observe(document.documentElement,{childList:true,subtree:true});patch();
})();