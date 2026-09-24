/* JanSamadhan Citizen Feedback & Rework v1
   Restores the post-resolution citizen verification loop without changing the
   existing complaint, duplicate, recurrence, GIS, or routing logic.
   - Resolved cases can be confirmed by the citizen from the public tracker.
   - Citizens can request rework under the SAME Challenge ID.
   - Rework moves the case back to admin review and preserves an audit trail.
   - Admin dashboard surfaces rework requests prominently.
*/
(function(){
  "use strict";

  var DATA_KEYS=["jansamadhan_data_v3","jansamadhan_data_v2"];
  var renderTimer=null;
  var processing=false;

  function id(x){return document.getElementById(x)}
  function isHindi(){return document.documentElement.lang==="hi"}
  function tx(en,hi){return isHindi()?hi:en}
  function esc(x){return String(x==null?"":x).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function now(){return new Date().toISOString()}
  function parseTime(x){var t=Date.parse(x||"");return isNaN(t)?0:t}

  function loadPack(){
    for(var i=0;i<DATA_KEYS.length;i++){
      try{
        var d=JSON.parse(localStorage.getItem(DATA_KEYS[i])||"null");
        if(d&&Array.isArray(d.problems))return{key:DATA_KEYS[i],data:d};
      }catch(e){}
    }
    return{key:DATA_KEYS[0],data:{accounts:[],problems:[]}};
  }

  function savePack(pack){
    try{localStorage.setItem(pack.key||DATA_KEYS[0],JSON.stringify(pack.data))}catch(e){}
    if(pack.key!==DATA_KEYS[0])try{localStorage.setItem(DATA_KEYS[0],JSON.stringify(pack.data))}catch(e){}
  }

  function getProblem(cid){
    var pack=loadPack(),key=String(cid||"").toUpperCase();
    return(pack.data.problems||[]).find(function(p){return String(p.id||"").toUpperCase()===key})||null;
  }

  function isSolved(p){return !!p&&(String(p.status||"").toLowerCase()==="solved"||String(p.stage||"").toLowerCase()==="completed")}

  function lastCompletionTime(p){
    var best=0;
    (p.statusHistory||[]).forEach(function(h){
      if(String(h.stage||"").toLowerCase()!=="completed")return;
      best=Math.max(best,parseTime(h.at));
    });
    return best;
  }

  function hasNewResolutionAfterFeedback(p,fb){
    if(!fb)return false;
    return lastCompletionTime(p)>parseTime(fb.submittedAt)+500;
  }

  function addHistory(p,stage,by,note){
    p.statusHistory=Array.isArray(p.statusHistory)?p.statusHistory:[];
    p.statusHistory.push({stage:stage,by:by,note:note,at:now()});
    if(p.statusHistory.length>40)p.statusHistory=p.statusHistory.slice(-40);
  }

  function syncProblem(p){
    try{
      if(window.JSCloud){
        var payload={
          citizenFeedback:p.citizenFeedback||null,
          citizenFeedbackHistory:p.citizenFeedbackHistory||[],
          status:p.status,
          stage:p.stage,
          impact:p.impact||null,
          impactHistory:p.impactHistory||[],
          solution:p.solution||null,
          statusHistory:p.statusHistory||[],
          routing:p.routing||null,
          updatedAt:p.updatedAt||now()
        };
        window.JSCloud.set("problems",String(p.id),payload,true).catch(function(e){console.warn("Citizen feedback cloud sync unavailable",e)});
      }
    }catch(e){}
  }

  function ensureStyles(){
    if(id("jsfb-style"))return;
    var s=document.createElement("style");s.id="jsfb-style";
    s.textContent=".jsfb-box{margin:12px 0;padding:12px;border:1px solid #b8d7c5;border-left:4px solid #18875a;border-radius:8px;background:#f4fbf7;font-size:.74rem;line-height:1.5}.jsfb-box.warn{border-color:#e4b3b8;border-left-color:#b4232f;background:#fff4f5}.jsfb-box.pending{border-color:#e4c47f;border-left-color:#a96100;background:#fff9eb}.jsfb-box strong{color:var(--forest-deep,#023522)}.jsfb-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.jsfb-note{width:100%;min-height:62px;margin-top:8px;border:1px solid #b8c9bf;border-radius:7px;padding:8px;background:#fff;color:var(--ink,#17231d);resize:vertical;font:inherit}.jsfb-meta{margin-top:6px;color:var(--muted,#5c6d64);font-size:.68rem}.jsfb-admin-summary{border-left:5px solid #b4232f!important}.jsfb-admin-tag{display:inline-flex;padding:3px 7px;border-radius:999px;background:#f8dadd;color:#8f1f2b;font-size:.62rem;font-weight:900;margin-bottom:5px}body.high-contrast .jsfb-box{background:#000!important;color:#fff!important;border-color:#fff!important}body.high-contrast .jsfb-box strong{color:#fff!important}";
    document.head.appendChild(s);
  }

  function challengeIdFromTracker(){
    var box=id("trackResult");if(!box)return"";
    var clone=box.cloneNode(true);
    clone.querySelectorAll("[data-jsfb]").forEach(function(x){x.remove()});
    var m=String(clone.textContent||"").match(/\bJS(?:-[A-Z0-9]+)+\b/i);
    return m?m[0].toUpperCase():"";
  }

  function feedbackStatusMarkup(p){
    var fb=p.citizenFeedback;
    if(!fb)return"";
    var note=fb.note?'<div class="jsfb-meta">'+tx("Citizen note","नागरिक टिप्पणी")+': '+esc(fb.note)+'</div>':"";
    if(fb.status==="verified_resolved"&&!hasNewResolutionAfterFeedback(p,fb)){
      return '<div class="jsfb-box" data-jsfb="state"><strong>✓ '+tx("Citizen verified the resolution","नागरिक ने समाधान की पुष्टि की")+'</strong><div>'+tx("The citizen confirmed that the issue is actually resolved.","नागरिक ने पुष्टि की कि समस्या वास्तव में हल हो गई है।")+'</div>'+note+'</div>';
    }
    if(fb.status==="rework_requested"&&!hasNewResolutionAfterFeedback(p,fb)){
      return '<div class="jsfb-box warn" data-jsfb="state"><strong>↻ '+tx("Citizen requested rework","नागरिक ने पुनः कार्य का अनुरोध किया")+'</strong><div>'+tx("This challenge has been reopened under the same Challenge ID and returned to administrator review.","उसी चैलेंज आईडी के अंतर्गत केस दोबारा खोला गया है और प्रशासक समीक्षा में भेजा गया है।")+'</div>'+note+'</div>';
    }
    return"";
  }

  function promptMarkup(p){
    var cid=esc(p.id);
    return '<div class="jsfb-box" data-jsfb="prompt"><strong>'+tx("Citizen resolution check","नागरिक समाधान जाँच")+'</strong><div>'+tx("The authority has marked this challenge resolved. Was the problem actually fixed?","प्राधिकरण ने इस चुनौती को हल बताया है। क्या समस्या वास्तव में ठीक हुई?")+'</div><textarea class="jsfb-note" data-jsfb-note="'+cid+'" maxlength="280" placeholder="'+tx("Optional: add a short note about the result","वैकल्पिक: परिणाम के बारे में छोटी टिप्पणी लिखें")+'"></textarea><div class="jsfb-actions"><button class="btn small teal" type="button" data-jsfb-action="confirm" data-cid="'+cid+'">✓ '+tx("Yes, resolved","हाँ, हल हो गया")+'</button><button class="btn small danger" type="button" data-jsfb-action="rework" data-cid="'+cid+'">↻ '+tx("No, request rework","नहीं, पुनः कार्य चाहिए")+'</button></div><div class="jsfb-meta">'+tx("A rework request keeps the same Challenge ID and sends the case back to administrator review.","पुनः कार्य अनुरोध में वही चैलेंज आईडी रहती है और केस प्रशासक समीक्षा में वापस जाता है।")+'</div></div>';
  }

  function injectTracker(){
    var box=id("trackResult");if(!box)return;
    var cid=challengeIdFromTracker();
    var old=box.querySelector("[data-jsfb-container]");
    if(!cid){if(old)old.remove();return}
    var p=getProblem(cid);if(!p){if(old)old.remove();return}
    var fb=p.citizenFeedback||null;
    var allowPrompt=isSolved(p)&&(!fb||hasNewResolutionAfterFeedback(p,fb));
    var html=allowPrompt?promptMarkup(p):feedbackStatusMarkup(p);
    var sig=[cid,p.status,p.stage,fb&&fb.status,fb&&fb.submittedAt,lastCompletionTime(p),isHindi()].join("|");
    if(!html){if(old)old.remove();return}
    if(!old){old=document.createElement("div");old.dataset.jsfbContainer="1";box.appendChild(old)}
    if(old.dataset.sig===sig)return;
    old.dataset.sig=sig;old.innerHTML=html;
  }

  function cardId(card){
    var el=card&&card.querySelector(".pid"),m=String(el?el.textContent:"").match(/\bJS(?:-[A-Z0-9]+)+\b/i);
    return m?m[0].toUpperCase():"";
  }

  function injectAdminCards(){
    var role=id("sessionRole")?String(id("sessionRole").textContent||"").trim().toLowerCase():"";
    if(role!=="admin")return;
    var content=id("content");if(!content)return;
    content.querySelectorAll(".card").forEach(function(card){
      var cid=cardId(card);if(!cid)return;
      var p=getProblem(cid),fb=p&&p.citizenFeedback,old=card.querySelector("[data-jsfb-admin-card]");
      var show=!!(p&&fb&&fb.status==="rework_requested"&&!hasNewResolutionAfterFeedback(p,fb));
      if(!show){if(old)old.remove();return}
      if(!old){old=document.createElement("div");old.dataset.jsfbAdminCard="1";old.className="jsfb-box warn";var actions=card.querySelector(".cardactions");if(actions)actions.insertAdjacentElement("beforebegin",old);else card.appendChild(old)}
      var sig=[fb.submittedAt,fb.note,p.stage,p.status,isHindi()].join("|");if(old.dataset.sig===sig)return;old.dataset.sig=sig;
      old.innerHTML='<span class="jsfb-admin-tag">'+tx("CITIZEN REWORK REQUEST","नागरिक पुनः कार्य अनुरोध")+'</span><div><strong>'+tx("Resolution disputed by citizen","नागरिक ने समाधान पर आपत्ति की")+'</strong></div><div>'+tx("Case automatically returned to Administrator Review under the same Challenge ID.","उसी चैलेंज आईडी के अंतर्गत केस स्वतः प्रशासक समीक्षा में वापस आया।")+'</div>'+(fb.note?'<div class="jsfb-meta">'+tx("Citizen note","नागरिक टिप्पणी")+': '+esc(fb.note)+'</div>':'');
    });
  }

  function injectAdminSummary(){
    var role=id("sessionRole")?String(id("sessionRole").textContent||"").trim().toLowerCase():"";
    var content=id("content"),panel=id("jsfb-admin-summary");
    if(role!=="admin"||!content){if(panel)panel.remove();return}
    var items=(loadPack().data.problems||[]).filter(function(p){var fb=p.citizenFeedback;return fb&&fb.status==="rework_requested"&&!hasNewResolutionAfterFeedback(p,fb)});
    if(!items.length){if(panel)panel.remove();return}
    if(!panel){panel=document.createElement("section");panel.id="jsfb-admin-summary";panel.className="panel alert jsfb-admin-summary";var title=content.querySelector(".title");if(title)title.insertAdjacentElement("afterend",panel);else content.insertBefore(panel,content.firstChild)}
    var sig=items.map(function(p){return p.id+":"+(p.citizenFeedback&&p.citizenFeedback.submittedAt)}).join("|")+"|"+isHindi();if(panel.dataset.sig===sig)return;panel.dataset.sig=sig;
    panel.innerHTML='<div class="panelhead"><div><h2>'+tx("Citizen rework requests","नागरिक पुनः कार्य अनुरोध")+'</h2><p>'+tx("Resolved cases that citizens say still need work. These cases are back in administrator review.","वे हल बताए गए केस जिनमें नागरिक ने कहा कि अभी काम बाकी है। ये केस प्रशासक समीक्षा में वापस हैं।")+'</p></div><span class="count red">'+items.length+'</span></div><div class="panelbody">'+items.slice(0,6).map(function(p){return'<div class="jsfb-box warn"><strong>'+esc(p.id)+' · '+esc(p.title||"Challenge")+'</strong>'+(p.citizenFeedback.note?'<div class="jsfb-meta">'+esc(p.citizenFeedback.note)+'</div>':'')+'</div>'}).join("")+'</div>';
  }

  function submitFeedback(cid,status){
    var pack=loadPack(),key=String(cid||"").toUpperCase(),p=(pack.data.problems||[]).find(function(x){return String(x.id||"").toUpperCase()===key});
    if(!p)return;
    if(!isSolved(p)&&status!=="rework_requested")return;
    var noteEl=document.querySelector('[data-jsfb-note="'+CSS.escape(key)+'"]');
    var note=String(noteEl&&noteEl.value||"").trim().slice(0,280);
    var fb={status:status,note:note,submittedAt:now(),source:"public_tracker",challengeId:p.id};
    p.citizenFeedbackHistory=Array.isArray(p.citizenFeedbackHistory)?p.citizenFeedbackHistory:[];
    p.citizenFeedbackHistory.push(fb);
    if(p.citizenFeedbackHistory.length>20)p.citizenFeedbackHistory=p.citizenFeedbackHistory.slice(-20);
    p.citizenFeedback=fb;

    if(status==="verified_resolved"){
      addHistory(p,"completed","Citizen feedback","Citizen confirmed that the reported issue is resolved."+(note?" Note: "+note:""));
    }else{
      if(p.impact){p.impactHistory=Array.isArray(p.impactHistory)?p.impactHistory:[];p.impactHistory.push(Object.assign({supersededAt:now(),reason:"Citizen requested rework"},p.impact));p.impact=null}
      if(p.solution)p.solution.status="pending";
      p.status="active";
      p.stage="admin_review";
      p.help=true;
      if(p.routing){
        p.routing.accountability_events=Array.isArray(p.routing.accountability_events)?p.routing.accountability_events:[];
        p.routing.accountability_events.push({at:now(),action:"Citizen requested rework",note:note||"Citizen reported that the issue is not fully resolved."});
        if(p.routing.accountability_events.length>20)p.routing.accountability_events=p.routing.accountability_events.slice(-20);
      }
      addHistory(p,"admin_review","Citizen feedback","Citizen requested rework after resolution; case reopened under the same Challenge ID."+(note?" Note: "+note:""));
    }
    p.updatedAt=now();
    savePack(pack);syncProblem(p);
    toast(status==="verified_resolved"?tx("Thank you. Resolution verified by citizen.","धन्यवाद। नागरिक द्वारा समाधान सत्यापित किया गया।"):tx("Rework requested. The same Challenge ID is now back in administrator review.","पुनः कार्य अनुरोध दर्ज हुआ। वही चैलेंज आईडी अब प्रशासक समीक्षा में वापस है।"),status==="rework_requested"?"warn":"good");
    scheduleRender();
  }

  function toast(text,kind){
    var old=id("jsfb-toast");if(old)old.remove();
    var t=document.createElement("div");t.id="jsfb-toast";t.className="toast "+(kind||"");t.textContent=text;document.getElementById("toasts")?document.getElementById("toasts").appendChild(t):document.body.appendChild(t);setTimeout(function(){if(t.parentNode)t.remove()},4800);
  }

  function onClick(e){
    var b=e.target.closest("[data-jsfb-action]");if(!b)return;
    var action=b.dataset.jsfbAction,cid=b.dataset.cid;
    if(action==="confirm")submitFeedback(cid,"verified_resolved");
    if(action==="rework")submitFeedback(cid,"rework_requested");
  }

  function render(){
    if(processing)return;processing=true;
    try{ensureStyles();injectTracker();injectAdminSummary();injectAdminCards()}finally{processing=false}
  }

  function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(render,80)}

  function init(){
    ensureStyles();scheduleRender();
    document.addEventListener("click",onClick,true);
    new MutationObserver(scheduleRender).observe(document.body,{childList:true,subtree:true});
    window.addEventListener("storage",scheduleRender);
    setInterval(scheduleRender,1800);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
