/* JanSamadhan Recurrence Intelligence v1
   Distinguishes active duplicates from post-resolution recurrence.
   Existing duplicate logic remains unchanged: this layer only compares
   active/new cases against previously resolved cases. */
(function(){
  "use strict";

  var DATA_KEYS=["jansamadhan_data_v3","jansamadhan_data_v2"];
  var processing=false;
  var scanTimer=null;
  var uiTimer=null;
  var announced=new Set();

  function id(x){return document.getElementById(x)}
  function isHindi(){return document.documentElement.lang==="hi"}
  function tx(en,hi){return isHindi()?hi:en}
  function esc(x){return String(x==null?"":x).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function now(){return new Date().toISOString()}
  function active(p){return !!p&&p.status!=="solved"&&p.stage!=="completed"}
  function resolved(p){return !!p&&!active(p)}
  function norm(x){return String(x||"").toLowerCase().replace(/[^a-z0-9\u0900-\u097f ]+/g," ").replace(/\s+/g," ").trim()}
  function words(x){
    var stop={the:1,a:1,an:1,and:1,or:1,of:1,to:1,in:1,on:1,at:1,is:1,are:1,was:1,were:1,for:1,from:1,with:1,this:1,that:1,near:1};
    return norm(x).split(" ").filter(function(w){return w.length>2&&!stop[w]})
  }
  function jaccard(a,b){
    var A=new Set(words(a)),B=new Set(words(b));
    if(!A.size||!B.size)return 0;
    var inter=0;A.forEach(function(x){if(B.has(x))inter++});
    return inter/(A.size+B.size-inter);
  }
  function locationSimilarity(a,b){
    var A=norm(a),B=norm(b);
    if(!A||!B)return 0;
    if(A===B)return 1;
    if((A.length>5&&B.indexOf(A)>=0)||(B.length>5&&A.indexOf(B)>=0))return .9;
    return jaccard(A,B);
  }
  function textSimilarity(a,b){
    return jaccard((a.title||"")+" "+(a.description||""),(b.title||"")+" "+(b.description||""));
  }
  function loadData(){
    for(var i=0;i<DATA_KEYS.length;i++){
      try{
        var d=JSON.parse(localStorage.getItem(DATA_KEYS[i])||"null");
        if(d&&Array.isArray(d.problems))return{data:d,key:DATA_KEYS[i]};
      }catch(e){}
    }
    return{data:{problems:[],accounts:[]},key:DATA_KEYS[0]};
  }
  function saveData(pack){
    try{localStorage.setItem(pack.key||DATA_KEYS[0],JSON.stringify(pack.data))}catch(e){}
    if(pack.key!==DATA_KEYS[0])try{localStorage.setItem(DATA_KEYS[0],JSON.stringify(pack.data))}catch(e){}
  }
  function session(){try{return JSON.parse(localStorage.getItem("jansamadhan_session_v2")||"null")}catch(e){return null}}
  function problemTime(p){
    var vals=[p.createdAt,p.created_at,p.reportedAt,p.submittedAt,p.updatedAt];
    if(Array.isArray(p.statusHistory)&&p.statusHistory.length)vals.push(p.statusHistory[0].at);
    for(var i=0;i<vals.length;i++){
      var t=Date.parse(vals[i]||"");
      if(!isNaN(t))return t;
    }
    return 0;
  }
  function resolvedTime(p){
    var times=[];
    if(Array.isArray(p.statusHistory)){
      p.statusHistory.forEach(function(h){
        var s=String(h.stage||"").toLowerCase(),n=String(h.note||"").toLowerCase();
        if(s==="completed"||/resolved|solution approved|completion verified|समाधान/.test(n)){
          var t=Date.parse(h.at||"");if(!isNaN(t))times.push(t);
        }
      });
    }
    [p.resolvedAt,p.completedAt,p.updatedAt].forEach(function(v){var t=Date.parse(v||"");if(!isNaN(t))times.push(t)});
    return times.length?Math.max.apply(Math,times):0;
  }
  function score(current,old){
    var loc=locationSimilarity(current.location,old.location);
    var text=textSimilarity(current,old);
    var category=norm(current.category)&&norm(current.category)===norm(old.category)?1:0;
    var district=norm(current.district)&&norm(current.district)===norm(old.district)?1:0;
    var total=loc*.42+text*.36+category*.14+district*.08;
    var reasons=[];
    if(loc>=.75)reasons.push("Same or highly similar location");
    else if(loc>=.45)reasons.push("Similar location");
    if(text>=.55)reasons.push("Highly similar problem description");
    else if(text>=.32)reasons.push("Similar problem description");
    if(category)reasons.push("Same category");
    if(district)reasons.push("Same district");
    return{score:total,loc:loc,text:text,reasons:reasons};
  }
  function bestResolvedMatch(current,problems){
    var ct=problemTime(current),best=null;
    problems.forEach(function(old){
      if(!resolved(old)||String(old.id||"")===String(current.id||""))return;
      var rt=resolvedTime(old);
      if(ct&&rt&&rt>=ct)return;
      var s=score(current,old);
      if(s.loc<.45||s.text<.28||s.score<.58)return;
      if(!best||s.score>best.score)best={problem:old,score:s.score,loc:s.loc,text:s.text,reasons:s.reasons,resolvedAt:rt?new Date(rt).toISOString():null};
    });
    return best;
  }
  function syncProblem(p){
    try{
      if(window.firebase&&firebase.apps&&firebase.apps.length&&firebase.firestore){
        firebase.firestore().collection("problems").doc(String(p.id)).set({recurrence:p.recurrence||null,updatedAt:now()},{merge:true}).catch(function(e){console.warn("Recurrence sync unavailable",e)});
      }
    }catch(e){}
  }
  function scan(){
    if(processing)return;
    processing=true;
    try{
      var pack=loadData(),problems=pack.data.problems||[],changed=false;
      problems.forEach(function(p){
        if(!active(p)||!p.id)return;
        if(p.recurrence&&(p.recurrence.status==="confirmed"||p.recurrence.status==="dismissed"))return;
        var match=bestResolvedMatch(p,problems);
        if(!match){
          if(p.recurrence&&p.recurrence.status==="candidate"){delete p.recurrence;changed=true;syncProblem(p)}
          return;
        }
        var prev=String(match.problem.id||"").toUpperCase();
        var currentSig=prev+"|"+Math.round(match.score*100);
        var oldSig=p.recurrence&&(String(p.recurrence.previousChallengeId||"").toUpperCase()+"|"+Math.round(Number(p.recurrence.score||0)*100));
        if(currentSig!==oldSig||!p.recurrence){
          p.recurrence={
            status:"candidate",
            previousChallengeId:prev,
            score:Number(match.score.toFixed(2)),
            detectedAt:now(),
            previousResolvedAt:match.resolvedAt,
            reasons:match.reasons,
            distinction:"New Challenge ID retained because the earlier matching case was already resolved."
          };
          changed=true;syncProblem(p);
        }
      });
      if(changed)saveData(pack);
    }finally{processing=false;scheduleUI()}
  }
  function recurrenceFor(cid){
    var pack=loadData(),t=String(cid||"").toUpperCase();
    return(pack.data.problems||[]).find(function(p){return String(p.id||"").toUpperCase()===t})||null;
  }
  function cardId(card){
    var el=card&&card.querySelector(".pid"),m=String(el?el.textContent:"").match(/\bJS(?:-[A-Z0-9]+)+\b/i);
    return m?m[0].toUpperCase():"";
  }
  function role(){
    var r=id("sessionRole");
    if(r&&r.textContent)return String(r.textContent).trim().toLowerCase();
    var s=session();return String(s&&s.role||"").toLowerCase();
  }
  function ensureStyles(){
    if(id("jsrec-style"))return;
    var s=document.createElement("style");s.id="jsrec-style";
    s.textContent=".jsrec-box{margin:10px 0;padding:10px 11px;border:1px solid #e0b45a;border-left:4px solid #a96100;border-radius:8px;background:#fff8e9;font-size:.72rem;line-height:1.5}.jsrec-box.confirmed{border-color:#ca8f96;border-left-color:#b4232f;background:#fff1f2}.jsrec-tag{display:inline-flex;padding:3px 7px;margin-bottom:5px;border-radius:999px;background:#fff0cb;color:#774c00;font-size:.62rem;font-weight:900;letter-spacing:.03em}.jsrec-box.confirmed .jsrec-tag{background:#f8dadd;color:#8f1f2b}.jsrec-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.jsrec-help{color:var(--muted,#5c6d64);font-size:.67rem;margin-top:4px}body.high-contrast .jsrec-box{background:#000!important;color:#fff!important;border-color:#fff!important}";
    document.head.appendChild(s);
  }
  function candidateMarkup(p,admin){
    var r=p.recurrence;if(!r)return"";
    var confirmed=r.status==="confirmed";
    var title=confirmed?tx("RECURRING ISSUE CONFIRMED","दोबारा हुई समस्या की पुष्टि"):tx("POSSIBLE RECURRENCE","संभावित दोबारा समस्या");
    var confidence=Math.round(Number(r.score||0)*100);
    var reasons=(r.reasons||[]).map(esc).join(" · ");
    var html='<div class="jsrec-tag">'+title+'</div><div><strong>'+esc(p.id)+'</strong> '+tx("may be a new occurrence of previously resolved","पहले हल की गई समस्या की नई घटना हो सकती है")+' <strong>'+esc(r.previousChallengeId)+'</strong>.</div>';
    html+='<div class="jsrec-help">'+tx("Why flagged","क्यों चिन्हित")+': '+esc(reasons||"Similar location and problem pattern")+' · '+tx("match","मिलान")+' '+confidence+'%</div>';
    html+='<div class="jsrec-help"><strong>'+tx("Duplicate vs recurrence","डुप्लिकेट बनाम दोबारा समस्या")+':</strong> '+tx("Duplicates refer to the same active issue and can be merged. A recurrence happens after an earlier case was resolved, so this report keeps its own Challenge ID and links back to the old case.","डुप्लिकेट एक ही सक्रिय समस्या की रिपोर्टें हैं और उन्हें जोड़ा जा सकता है। दोबारा समस्या तब होती है जब पुराना केस हल हो चुका हो, इसलिए नई रिपोर्ट अपना अलग Challenge ID रखती है और पुराने केस से जुड़ती है।")+'</div>';
    if(admin&&!confirmed)html+='<div class="jsrec-actions"><button class="btn small danger" type="button" data-jsrec="confirm" data-cid="'+esc(p.id)+'">'+tx("Confirm recurrence","दोबारा समस्या की पुष्टि")+'</button><button class="btn small secondary" type="button" data-jsrec="dismiss" data-cid="'+esc(p.id)+'">'+tx("Dismiss match","मिलान हटाएँ")+'</button></div>';
    if(admin&&confirmed)html+='<div class="jsrec-actions"><button class="btn small secondary" type="button" data-jsrec="review" data-cid="'+esc(p.id)+'">'+tx("Mark for root-cause review","रूट-कॉज़ समीक्षा के लिए चिन्हित करें")+'</button></div>';
    return html;
  }
  function injectCards(){
    var content=id("content");if(!content)return;
    var admin=role()==="admin";
    content.querySelectorAll(".card").forEach(function(card){
      var cid=cardId(card);if(!cid)return;
      var p=recurrenceFor(cid),r=p&&p.recurrence;
      var old=card.querySelector("[data-jsrec-card]");
      if(!r||(r.status!=="candidate"&&r.status!=="confirmed")){if(old)old.remove();return}
      if(!admin&&r.status!=="confirmed"){if(old)old.remove();return}
      if(!old){old=document.createElement("div");old.dataset.jsrecCard="1";old.className="jsrec-box";card.appendChild(old)}
      old.className="jsrec-box"+(r.status==="confirmed"?" confirmed":"");
      old.innerHTML=candidateMarkup(p,admin);
    });
  }
  function injectTracker(){
    var box=id("trackResult");if(!box)return;
    var clone=box.cloneNode(true);clone.querySelectorAll("[data-jsrec-track]").forEach(function(x){x.remove()});
    var m=String(clone.textContent||"").match(/\bJS(?:-[A-Z0-9]+)+\b/i);
    var old=box.querySelector("[data-jsrec-track]");
    if(!m){if(old)old.remove();return}
    var p=recurrenceFor(m[0]),r=p&&p.recurrence;
    if(!r||r.status!=="confirmed"){if(old)old.remove();return}
    if(!old){old=document.createElement("div");old.dataset.jsrecTrack="1";old.className="jsrec-box confirmed";box.appendChild(old)}
    old.innerHTML=candidateMarkup(p,false);
  }
  function injectAdminSummary(){
    var content=id("content"),admin=role()==="admin";
    if(!content||!admin)return;
    var pack=loadData(),items=(pack.data.problems||[]).filter(function(p){return active(p)&&p.recurrence&&p.recurrence.status==="candidate"});
    var panel=id("jsrec-summary");
    if(!items.length){if(panel)panel.remove();return}
    if(!panel){
      panel=document.createElement("div");panel.id="jsrec-summary";panel.className="panel alert";
      var title=content.querySelector(".title");if(title)title.insertAdjacentElement("afterend",panel);else content.insertBefore(panel,content.firstChild);
    }
    panel.innerHTML='<div class="panelhead"><div><h2>'+tx("Recurrence intelligence","दोबारा समस्या बुद्धिमत्ता")+'</h2><p>'+tx("Resolved problems that appear to have returned. Human confirmation required.","हल की गई समस्याएँ जो फिर से लौटती दिख रही हैं। मानव पुष्टि आवश्यक है।")+'</p></div><span class="count">'+items.length+'</span></div><div class="panelbody">'+items.slice(0,5).map(function(p){return'<div class="jsrec-box">'+candidateMarkup(p,true)+'</div>'}).join("")+'</div>';
    var seenKey="jsrec-announced-"+items.map(function(p){return p.id}).join(",");
    if(!announced.has(seenKey)){announced.add(seenKey);toast(tx("Possible recurrence detected","संभावित दोबारा समस्या मिली")+": "+items[0].id,"warn")}
  }
  function toast(text,kind){
    var t=id("jsrec-toast");if(t)t.remove();
    t=document.createElement("div");t.id="jsrec-toast";t.className="jswf-toast "+(kind||"");t.textContent=text;document.body.appendChild(t);
    setTimeout(function(){if(t.parentNode)t.remove()},5200);
  }
  function saveDecision(cid,status){
    var pack=loadData(),p=(pack.data.problems||[]).find(function(x){return String(x.id||"").toUpperCase()===String(cid||"").toUpperCase()});
    if(!p||!p.recurrence)return;
    if(status==="dismissed"){
      p.recurrence.status="dismissed";p.recurrence.reviewedAt=now();p.recurrence.reviewedBy="Government / Nodal Administrator";
    }else{
      p.recurrence.status="confirmed";p.recurrence.confirmedAt=now();p.recurrence.confirmedBy="Government / Nodal Administrator";
    }
    p.statusHistory=Array.isArray(p.statusHistory)?p.statusHistory:[];
    p.statusHistory.push({stage:p.stage,by:"Government / Nodal Administrator",note:status==="dismissed"?"Recurrence suggestion dismissed after human review.":"Recurrence confirmed and linked to previously resolved challenge "+p.recurrence.previousChallengeId+".",at:now()});
    if(p.statusHistory.length>30)p.statusHistory=p.statusHistory.slice(-30);
    saveData(pack);syncProblem(p);
    toast(status==="dismissed"?tx("Recurrence match dismissed.","दोबारा समस्या का मिलान हटाया गया।"):tx("Recurrence confirmed. New Challenge ID retained and linked to the previous case.","दोबारा समस्या की पुष्टि हुई। नया Challenge ID रखा गया और पुराने केस से जोड़ा गया।"),status==="dismissed"?"":"warn");
    scheduleUI();
  }
  function rootCauseReview(cid){
    var pack=loadData(),p=(pack.data.problems||[]).find(function(x){return String(x.id||"").toUpperCase()===String(cid||"").toUpperCase()});
    if(!p||!p.recurrence)return;
    p.recurrence.rootCauseReview=true;p.recurrence.rootCauseReviewAt=now();
    p.statusHistory=Array.isArray(p.statusHistory)?p.statusHistory:[];
    p.statusHistory.push({stage:p.stage,by:"Government / Nodal Administrator",note:"Confirmed recurring issue marked for root-cause review.",at:now()});
    saveData(pack);syncProblem(p);toast(tx("Root-cause review recorded.","रूट-कॉज़ समीक्षा दर्ज की गई।"),"warn");scheduleUI();
  }
  function onClick(e){
    var b=e.target.closest("[data-jsrec]");if(!b)return;
    var action=b.dataset.jsrec,cid=b.dataset.cid;
    if(action==="confirm")saveDecision(cid,"confirmed");
    if(action==="dismiss")saveDecision(cid,"dismissed");
    if(action==="review")rootCauseReview(cid);
  }
  function scheduleUI(){clearTimeout(uiTimer);uiTimer=setTimeout(function(){injectCards();injectTracker();injectAdminSummary()},100)}
  function scheduleScan(){clearTimeout(scanTimer);scanTimer=setTimeout(scan,180)}
  function observe(){
    var c=id("content");
    if(c&&!c.dataset.jsrecObserved){c.dataset.jsrecObserved="1";new MutationObserver(function(){scheduleUI();scheduleScan()}).observe(c,{childList:true,subtree:true})}
    var t=id("trackResult");
    if(t&&!t.dataset.jsrecObserved){t.dataset.jsrecObserved="1";new MutationObserver(scheduleUI).observe(t,{childList:true,subtree:true})}
    if(!document.documentElement.dataset.jsrecLangObserved){
      document.documentElement.dataset.jsrecLangObserved="1";
      new MutationObserver(scheduleUI).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
    }
  }
  function init(){
    ensureStyles();document.addEventListener("click",onClick);scan();observe();setTimeout(scan,900);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
