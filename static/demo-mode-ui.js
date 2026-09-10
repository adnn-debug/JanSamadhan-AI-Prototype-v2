/* JanSamadhan AI v3 — demo-mode UI honesty patch.
   No external LLM/API calls are made in this mode. */
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
      t=t.replace(/JanSahayak AI is thinking…/g,"JanSahayak is analysing…");
      t=t.replace(/JanSahayak AI सोच रहा है…/g,"JanSahayak विश्लेषण कर रहा है…");
      t=t.replace(/AI unavailable\./g,"Optional AI analysis could not run.");
      node.nodeValue=t;
    }
  }

  function addDemoBadge(){
    var box=document.getElementById("chatbotPanel");
    if(!box || document.getElementById("jsDemoModeBadge")) return;
    var badge=document.createElement("div");
    badge.id="jsDemoModeBadge";
    badge.style.cssText="font-size:.68rem;opacity:.72;margin:6px 0 0;";
    badge.textContent="AI decision support · Demo mode · No external API billing";
    var note=document.getElementById("chatbotNote");
    if(note && note.parentNode) note.parentNode.insertBefore(badge,note);
  }

  function run(){rewriteText(document.body);addDemoBadge()}
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",run,{once:true});
  else run();

  var observer=new MutationObserver(function(){run()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
