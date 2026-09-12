/* JanSamadhan AI — runtime status + additive workflow loader.
   Keeps the interface clean while preserving an accessible AI/privacy disclosure. */
(function(){
  "use strict";

  var modeLabel="AI decision support · Local fallback ready";
  var groqActive=false;

  function id(x){return document.getElementById(x)}
  function isHindi(){return document.documentElement.lang==="hi"}

  function disclosure(){
    if(groqActive){
      return isHindi()
        ?"शैक्षणिक प्रोटोटाइप: सामान्य चैट और AI विश्लेषण Groq-आधारित LLM सेवा द्वारा प्रोसेस किए जा सकते हैं। सेवा उपलब्ध न होने पर deterministic local fallback उपयोग होता है। अंतिम रूटिंग और सत्यापन मानव प्रशासक करता है।"
        :"Academic prototype: free-text chat and AI analysis may use the configured Groq-backed LLM service, with deterministic local fallback when unavailable. Final routing and verification remain human-controlled.";
    }
    return isHindi()
      ?"शैक्षणिक प्रोटोटाइप: AI निर्णय-सहायता अभी deterministic local fallback logic पर चल रही है। अंतिम रूटिंग और सत्यापन मानव प्रशासक करता है।"
      :"Academic prototype: AI decision support is currently using deterministic local fallback logic. Final routing and verification remain human-controlled.";
  }

  function cleanChatbot(){
    var note=id("chatbotNote");
    if(note)note.style.display="none";

    var badge=id("jsDemoModeBadge");
    if(badge)badge.remove();

    var voiceTools=document.querySelector(".voice-tools");
    if(voiceTools)voiceTools.style.display="none";

    var info=id("jsh-chat-info");
    if(info){
      info.title=disclosure();
      info.setAttribute("aria-label",isHindi()?"प्रोटोटाइप और AI जानकारी":"Prototype and AI information");
    }
  }

  function checkHealth(){
    fetch("/health",{cache:"no-store"})
      .then(function(r){if(!r.ok)throw new Error("health");return r.json()})
      .then(function(data){
        groqActive=!!(data&&data.ai_mode==="groq+local-fallback");
        modeLabel=groqActive?"LLM-assisted + local fallback":"Local fallback decision support";
        window.JanSamadhanRuntime=window.JanSamadhanRuntime||{};
        window.JanSamadhanRuntime.aiMode=groqActive?"groq":"local";
        window.JanSamadhanRuntime.modeLabel=modeLabel;
        cleanChatbot();
      })
      .catch(function(){
        groqActive=false;
        modeLabel="Local fallback decision support";
        window.JanSamadhanRuntime=window.JanSamadhanRuntime||{};
        window.JanSamadhanRuntime.aiMode="local";
        window.JanSamadhanRuntime.modeLabel=modeLabel;
        cleanChatbot();
      });
  }

  function loadScript(scriptId,src){
    if(id(scriptId))return;
    var s=document.createElement("script");
    s.id=scriptId;
    s.src=src;
    s.defer=true;
    document.body.appendChild(s);
  }

  function init(){
    cleanChatbot();
    checkHealth();

    loadScript("js-workflow-v4","/static/workflow-v4.js");
    loadScript("js-recurrence-v1","/static/recurrence-v1.js");
    loadScript("js-admin-profile-v1","/static/admin-profile-v1.js");
    loadScript("js-judge-hardening-v1","/static/judge-hardening-v1.js");
    loadScript("js-ui-simplification-v1","/static/ui-simplification-v1.js");
    loadScript("js-gis-map-v1","/static/gis-map-v1.js");

    new MutationObserver(function(){setTimeout(cleanChatbot,0)}).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
    new MutationObserver(function(){setTimeout(cleanChatbot,0)}).observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
