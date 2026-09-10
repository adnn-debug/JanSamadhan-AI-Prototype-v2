/* JanSamadhan AI — lightweight runtime status + workflow loader.
   Keeps the page responsive, reports the active AI mode honestly,
   and loads workflow-v4 exactly once. */
(function(){
  "use strict";

  var modeLabel="AI decision support · Local fallback ready";
  var groqActive=false;
  var noteObserver=null;
  var updatingNote=false;

  function id(x){return document.getElementById(x)}
  function setText(node,value){if(node&&node.textContent!==value)node.textContent=value}
  function isHindi(){return document.documentElement.lang==="hi"}

  function privacyText(){
    if(groqActive){
      return isHindi()
        ? "शैक्षणिक प्रोटोटाइप · कुछ सामान्य चैट प्रश्न और AI विश्लेषण कॉन्फ़िगर की गई Groq AI सेवा द्वारा प्रोसेस किए जा सकते हैं। चैलेंज ट्रैकिंग, लॉगिन और सत्यापित कार्यवाही जनसमाधान द्वारा ही संभाली जाती है। पासवर्ड, OTP, आधार नंबर या बैंकिंग जानकारी दर्ज न करें। आवाज़ पहचान आपके ब्राउज़र की स्पीच सेवा का उपयोग करती है, इसलिए माइक्रोफोन ऑडियो ब्राउज़र/प्रदाता द्वारा प्रोसेस हो सकता है। जनसमाधान कच्चा ऑडियो संग्रहीत नहीं करता।"
        : "Academic prototype · Some free-text chat questions and AI analysis may be processed by the configured Groq AI service. Challenge tracking, login and verified workflow actions remain handled by JanSamadhan. Do not enter passwords, OTPs, Aadhaar numbers or banking information. Voice recognition uses your browser speech service, so microphone audio may be processed by the browser/provider. JanSamadhan does not store raw audio.";
    }
    return isHindi()
      ? "शैक्षणिक प्रोटोटाइप · चैट और AI निर्णय सहायता अभी स्थानीय fallback logic से प्रोसेस होती है; कोई टेक्स्ट Groq को नहीं भेजा जाता। पासवर्ड, OTP, आधार नंबर या बैंकिंग जानकारी फिर भी दर्ज न करें। आवाज़ पहचान आपके ब्राउज़र की स्पीच सेवा का उपयोग करती है, इसलिए माइक्रोफोन ऑडियो ब्राउज़र/प्रदाता द्वारा प्रोसेस हो सकता है। जनसमाधान कच्चा ऑडियो संग्रहीत नहीं करता।"
      : "Academic prototype · Chat and AI decision support are currently processed by the local fallback logic; no text is sent to Groq. Still, do not enter passwords, OTPs, Aadhaar numbers or banking information. Voice recognition uses your browser speech service, so microphone audio may be processed by the browser/provider. JanSamadhan does not store raw audio.";
  }

  function updatePrivacyNote(){
    var note=id("chatbotNote");
    if(!note)return;
    var next=privacyText();
    if(note.textContent===next)return;
    updatingNote=true;
    note.textContent=next;
    updatingNote=false;
  }

  function ensureNoteObserver(){
    var note=id("chatbotNote");
    if(!note||noteObserver)return;
    noteObserver=new MutationObserver(function(){
      if(updatingNote)return;
      setTimeout(updatePrivacyNote,0);
    });
    noteObserver.observe(note,{childList:true,characterData:true,subtree:true});
  }

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
    ensureNoteObserver();
    updatePrivacyNote();
  }

  function checkHealth(){
    fetch("/health",{cache:"no-store"})
      .then(function(r){if(!r.ok)throw new Error("health");return r.json()})
      .then(function(data){
        groqActive=!!(data&&data.ai_mode==="groq+local-fallback");
        modeLabel=groqActive
          ?"Real LLM via Groq · Automatic local fallback"
          :"AI decision support · Local fallback mode";
        ensureBadge();
      })
      .catch(function(){
        groqActive=false;
        modeLabel="AI decision support · Local fallback ready";
        ensureBadge();
      });
  }

  function loadWorkflow(){
    if(id("js-workflow-v4"))return;
    var s=document.createElement("script");
    s.id="js-workflow-v4";
    s.src="/static/workflow-v4.js";
    s.defer=true;
    document.body.appendChild(s);
  }

  function init(){
    ensureBadge();
    checkHealth();
    loadWorkflow();
    new MutationObserver(function(){
      setTimeout(function(){ensureBadge();updatePrivacyNote()},0);
    }).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
