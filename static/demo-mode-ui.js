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
    s.async=false;
    document.body.appendChild(s);
  }

  function init(){
    cleanChatbot();
    checkHealth();

    loadScript("js-workflow-v4","/static/workflow-v4.js");
    loadScript("js-citizen-feedback-v1","/static/citizen-feedback-v1.js");
    loadScript("js-recurrence-v1","/static/recurrence-v1.js");
    loadScript("js-admin-profile-v1","/static/admin-profile-v1.js");
    loadScript("js-judge-hardening-v1","/static/judge-hardening-v1.js");
    loadScript("js-ui-simplification-v1","/static/ui-simplification-v1.js");
    loadScript("js-jharkhand-map-bounds-v1","/static/jharkhand-map-bounds-v1.js");
    loadScript("js-gis-map-v1","/static/gis-map-v1.js");
    loadScript("js-gis-receipt-fix-v1","/static/gis-receipt-fix-v1.js");
    loadScript("js-demo-resilience-v1","/static/demo-resilience-v1.js");
    loadScript("js-jharkhand-jurisdiction-v1","/static/jharkhand-jurisdiction-v1.js");
    loadScript("js-demo-flow-guard-v1","/static/demo-flow-guard-v1.js");

    new MutationObserver(function(){setTimeout(cleanChatbot,0)}).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
    new MutationObserver(function(){setTimeout(cleanChatbot,0)}).observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();

/* Leaflet report-map resize hotfix.
   The report map is created while its modal can still be hidden. Leaflet then
   measures a tiny/zero container and only paints tiles in part of the visible
   area. When the modal/map becomes visible, trigger the resize event Leaflet
   already listens for so it recalculates the map size and fills the container. */
(function(){
  "use strict";

  var observedMap=null;
  var resizeObserver=null;
  var attachTimer=null;

  function mapBox(){return document.getElementById("jsgeo-report-map")}

  function refreshMapLayout(){
    var box=mapBox();
    if(!box||box.offsetWidth<40||box.offsetHeight<40)return;
    try{window.dispatchEvent(new Event("resize"))}catch(e){}
  }

  function scheduleRefresh(){
    [0,60,160,320].forEach(function(delay){setTimeout(refreshMapLayout,delay)});
  }

  function attachResizeWatch(){
    var box=mapBox();
    if(!box||box===observedMap)return;
    observedMap=box;

    if(resizeObserver){try{resizeObserver.disconnect()}catch(e){}}
    if("ResizeObserver" in window){
      resizeObserver=new ResizeObserver(function(entries){
        var rect=entries&&entries[0]&&entries[0].contentRect;
        if(rect&&rect.width>40&&rect.height>40)scheduleRefresh();
      });
      resizeObserver.observe(box);
    }
    scheduleRefresh();
  }

  function queueAttach(){
    clearTimeout(attachTimer);
    attachTimer=setTimeout(attachResizeWatch,0);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",queueAttach,{once:true});
  else queueAttach();

  new MutationObserver(function(){queueAttach()}).observe(document.body,{
    childList:true,
    subtree:true,
    attributes:true,
    attributeFilter:["class","style","open","aria-hidden"]
  });

  document.addEventListener("click",function(){
    if(mapBox())scheduleRefresh();
  },true);

  window.addEventListener("orientationchange",scheduleRefresh);
})();

/* Live date + time clock.
   Uses the visitor's device/browser local time and updates on every real second.
   Shows date plus 12-hour HH:MM:SS AM/PM and follows the visible app header. */
(function(){
  "use strict";

  var CLOCK_ID="js-live-clock";
  var STYLE_ID="js-live-clock-style";
  var timer=null;

  function pad(n){return String(n).padStart(2,"0")}

  function visible(el){
    if(!el)return false;
    if(el.closest&&el.closest(".hidden"))return false;
    try{
      var s=window.getComputedStyle(el);
      return s.display!=="none"&&s.visibility!=="hidden";
    }catch(e){return true}
  }

  function clockTarget(){
    var appActions=document.querySelector(".apphead .actions");
    if(visible(appActions))return appActions;
    var utility=document.querySelector(".utility-right");
    if(visible(utility))return utility;
    var masthead=document.querySelector(".masthead .masthead-inner");
    return masthead||document.body;
  }

  function ensureStyle(){
    if(document.getElementById(STYLE_ID))return;
    var style=document.createElement("style");
    style.id=STYLE_ID;
    style.textContent=".js-live-clock{display:inline-flex;align-items:center;gap:9px;min-height:32px;padding:5px 9px;border:1px solid var(--line,#cbd9d0);border-radius:8px;background:#fff;color:var(--forest-deep,#023522);white-space:nowrap;font-variant-numeric:tabular-nums;box-shadow:0 2px 8px rgba(2,53,34,.05)}.js-live-clock-date{font-size:.68rem;color:var(--muted,#5c6d64);font-weight:700}.js-live-clock-time{font-size:.82rem;letter-spacing:.025em;color:var(--forest-deep,#023522);font-weight:900}.js-live-clock-live{display:inline-flex;align-items:center;gap:4px;font-size:.58rem;font-weight:900;color:var(--leaf,#18875a);letter-spacing:.06em}.js-live-clock-live:before{content:\"\";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px rgba(24,135,90,.12)}.apphead .js-live-clock{background:#f8fbf9}.utility-right .js-live-clock{border-color:#bfd0c6;background:#f9fcfa}@media(max-width:720px){.js-live-clock{gap:6px;padding:5px 7px}.js-live-clock-date{font-size:.61rem}.js-live-clock-time{font-size:.73rem}.js-live-clock-live{display:none}}@media(max-width:480px){.apphead .js-live-clock-date{display:none}.apphead .js-live-clock{min-height:30px}}";
    document.head.appendChild(style);
  }

  function ensureClock(){
    ensureStyle();
    var clock=document.getElementById(CLOCK_ID);
    if(!clock){
      clock=document.createElement("div");
      clock.id=CLOCK_ID;
      clock.className="js-live-clock";
      clock.setAttribute("role","timer");
      clock.setAttribute("aria-live","off");
      clock.innerHTML='<span class="js-live-clock-live">LIVE</span><span class="js-live-clock-date"></span><strong class="js-live-clock-time"></strong>';
    }
    var target=clockTarget();
    if(target&&clock.parentNode!==target){
      target.insertBefore(clock,target.firstChild||null);
    }
    return clock;
  }

  function formatDate(now){
    var locale=document.documentElement.lang==="hi"?"hi-IN":"en-IN";
    try{
      return new Intl.DateTimeFormat(locale,{weekday:"short",day:"2-digit",month:"short",year:"numeric"}).format(now);
    }catch(e){
      return pad(now.getDate())+"/"+pad(now.getMonth()+1)+"/"+now.getFullYear();
    }
  }

  function updateClock(){
    var clock=ensureClock();
    if(!clock)return;
    var now=new Date();
    var h24=now.getHours();
    var ampm=h24>=12?"PM":"AM";
    var h12=h24%12||12;
    var dateEl=clock.querySelector(".js-live-clock-date");
    var timeEl=clock.querySelector(".js-live-clock-time");
    if(dateEl)dateEl.textContent=formatDate(now);
    if(timeEl)timeEl.textContent=pad(h12)+":"+pad(now.getMinutes())+":"+pad(now.getSeconds())+" "+ampm;
    try{
      var zone=Intl.DateTimeFormat().resolvedOptions().timeZone||"Local time";
      clock.title="Current device time · "+zone;
      clock.setAttribute("aria-label",formatDate(now)+", "+(timeEl?timeEl.textContent:"")+", "+zone);
    }catch(e){}
  }

  function scheduleTick(){
    updateClock();
    clearTimeout(timer);
    var delay=1000-(Date.now()%1000)+20;
    timer=setTimeout(scheduleTick,delay);
  }

  function initClock(){
    scheduleTick();
    document.addEventListener("visibilitychange",function(){if(!document.hidden)updateClock()});
    window.addEventListener("focus",updateClock);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initClock,{once:true});
  else initClock();
})();