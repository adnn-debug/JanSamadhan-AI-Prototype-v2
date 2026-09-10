/* JanSamadhan AI v3 — runtime AI mode indicator.
   Groq LLM is used when GROQ_API_KEY is configured.
   Local deterministic fallback keeps the prototype functional otherwise. */
(function(){
  "use strict";

  function rewriteText(root){
    if(!root) return;
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    var node;
    while((node=walker.nextNode())){
      var t=node.nodeValue;
      if(!t) continue;
      t=t.replace(/LLM routing recommendation/g,"AI routing recommendation");
      t=t.replace(/AI unavailable\./g,"AI analysis is using the local fallback.");
      node.nodeValue=t;
    }
  }

  function addModeBadge(){
    var box=document.getElementById("chatbotPanel");
    if(!box) return;

    var badge=document.getElementById("jsDemoModeBadge");
    if(!badge){
      badge=document.createElement("div");
      badge.id="jsDemoModeBadge";
      badge.style.cssText="font-size:.68rem;opacity:.72;margin:6px 0 0;";
      var note=document.getElementById("chatbotNote");
      if(note&&note.parentNode) note.parentNode.insertBefore(badge,note);
    }

    badge.textContent="AI decision support · Local fallback ready";

    fetch("/health",{cache:"no-store"})
      .then(function(r){return r.json()})
      .then(function(data){
        if(data&&data.ai_mode==="groq+local-fallback"){
          badge.textContent="Real LLM via Groq · Automatic local fallback";
        }else{
          badge.textContent="AI decision support · Local fallback mode";
        }
      })
      .catch(function(){
        badge.textContent="AI decision support · Local fallback ready";
      });
  }

  function run(){rewriteText(document.body);addModeBadge()}

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",run,{once:true});
  }else{
    run();
  }

  var observer=new MutationObserver(function(){rewriteText(document.body);addModeBadge()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
