/* JanSamadhan AI — lightweight runtime status + workflow loader.
   Keeps the page responsive and loads workflow-v4 exactly once. */
(function(){
  "use strict";

  var modeLabel="AI decision support · Local fallback ready";

  function id(x){return document.getElementById(x)}
  function setText(node,value){if(node&&node.textContent!==value)node.textContent=value}

  function ensureBadge(){
    var panel=id("chatbotPanel");
    if(!panel)return;
    var badge=id("jsDemoModeBadge");
    if(!badge){
      badge=document.createElement("div");
      badge.id="jsDemoModeBadge";
      badge.style.cssText="font-size:.68rem;opacity:.72;margin:6px 11px 0;";
      var note=id("chatbotNote");
      if(note&&note.parentNode)note.parentNode.insertBefore(badge,note);
      else panel.appendChild(badge);
    }
    setText(badge,modeLabel);
  }

  function checkHealth(){
    fetch("/health",{cache:"no-store"})
      .then(function(r){if(!r.ok)throw new Error("health");return r.json()})
      .then(function(data){
        modeLabel=data&&data.ai_mode==="groq+local-fallback"
          ?"Real LLM via Groq · Automatic local fallback"
          :"AI decision support · Local fallback mode";
        ensureBadge();
      })
      .catch(function(){modeLabel="AI decision support · Local fallback ready";ensureBadge()});
  }

  function loadWorkflow(){
    if(id("js-workflow-v4"))return;
    var s=document.createElement("script");
    s.id="js-workflow-v4";
    s.src="/static/workflow-v4.js";
    s.defer=true;
    document.body.appendChild(s);
  }

  function init(){ensureBadge();checkHealth();loadWorkflow()}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
