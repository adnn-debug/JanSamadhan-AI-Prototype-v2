/* JanSamadhan Workflow v4 — final governance alignment + notifications.
   Non-destructive compatibility layer: keeps the existing index.html workflow,
   but enforces confirmed resolution-path visibility and adds one universal tracker. */
(function(){
  "use strict";

  var DATA_KEYS=["jansamadhan_data_v3","jansamadhan_data_v2"];
  var ROUTING_KEY="jansamadhan_ai_routing_v1";
  var SESSION_KEY="jansamadhan_session_v2";
  var NOTIFY_SEEN_KEY="jansamadhan_notifications_seen_v1";
  var processing=false;
  var dashboardTimer=null;
  var trackerTimer=null;
  var notificationTimer=null;
  var announcedKeys=new Set();

  var UNIVERSAL=[
    {id:"reported",en:"Reported",hi:"रिपोर्ट दर्ज"},
    {id:"analysed",en:"AI Analysed",hi:"AI विश्लेषण"},
    {id:"verified",en:"Government Verified",hi:"सरकारी सत्यापन"},
    {id:"routed",en:"Routed",hi:"रूट किया गया"},
    {id:"action",en:"Action In Progress",hi:"कार्य प्रगति पर"},
    {id:"verification",en:"Verification",hi:"सत्यापन"},
    {id:"resolved",en:"Resolved",hi:"समाधान पूर्ण"}
  ];

  function id(x){return document.getElementById(x)}
  function isHindi(){return document.documentElement.lang==="hi"}
  function tx(en,hi){return isHindi()?hi:en}
  function esc(x){return String(x==null?"":x).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function now(){return new Date().toISOString()}
  function loadData(){
    for(var i=0;i<DATA_KEYS.length;i++){
      try{var d=JSON.parse(localStorage.getItem(DATA_KEYS[i])||"null");if(d&&Array.isArray(d.problems))return d}catch(e){}
    }
    return{problems:[],accounts:[]};
  }
  function saveData(d){try{localStorage.setItem(DATA_KEYS[0],JSON.stringify(d))}catch(e){}}
  function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||"null")}catch(e){return null}}
  function routes(){
    var out={},d=loadData();
    (d.problems||[]).forEach(function(p){if(p&&p.id&&p.routing)out[String(p.id).toUpperCase()]=p.routing});
    try{var l=JSON.parse(localStorage.getItem(ROUTING_KEY)||"{}");Object.keys(l||{}).forEach(function(k){out[String(k).toUpperCase()]=l[k]})}catch(e){}
    return out;
  }
  function saveRoute(cid,meta){
    cid=String(cid||"").toUpperCase();
    var all=routes();all[cid]=meta;
    try{localStorage.setItem(ROUTING_KEY,JSON.stringify(all))}catch(e){}
    var d=loadData(),p=(d.problems||[]).find(function(x){return String(x.id||"").toUpperCase()===cid});
    if(p){p.routing=meta;p.updatedAt=now();saveData(d)}
    try{
      if(window.JSCloud){
        window.JSCloud.set("problems",cid,{routing:meta,updatedAt:now()},true).catch(function(e){console.warn("Routing sync unavailable",e)});
      }
    }catch(e){}
  }
  function problem(cid){var t=String(cid||"").toUpperCase();return(loadData().problems||[]).find(function(p){return String(p.id||"").toUpperCase()===t})||null}
  function cardId(card){var el=card&&card.querySelector(".pid"),m=String(el?el.textContent:"").match(/\bJS(?:-[A-Z0-9]+)+\b/i);return m?m[0].toUpperCase():""}
  function active(p){return !!p&&p.status!=="solved"&&p.stage!=="completed"}
  function supportedBy(p,role,name){
    var key=role==="university"?"universities":"industries";
    return !!p&&(p[key]||[]).some(function(o){return String(o.provider||"").toLowerCase()===String(name||"").toLowerCase()});
  }
  function collaboratorAllowed(meta,role){
    if(!meta||meta.resolution_path==="Direct Government Action")return false;
    var map={student:"Students",university:"University",industry:"Industry"};
    return (meta.recommended_collaborators||[]).indexOf(map[role])>=0;
  }
  function shouldShowCard(p,meta,role,name){
    if(!p||role==="admin")return true;
    if(role==="student"){
      if(p.claimedBy&&String(p.claimedBy).toLowerCase()===String(name||"").toLowerCase())return true;
      return !!meta&&collaboratorAllowed(meta,"student")&&active(p);
    }
    if(role==="university"||role==="industry"){
      if(supportedBy(p,role,name))return true;
      return !!meta&&collaboratorAllowed(meta,role)&&active(p);
    }
    return true;
  }

  function ensureStyles(){
    if(id("jswf-style"))return;
    var s=document.createElement("style");s.id="jswf-style";
    s.textContent=".jswf-path-note{margin:10px 0;padding:9px 11px;border:1px solid var(--line,#cbd9d0);border-radius:8px;background:#f6faf7;font-size:.72rem}.jswf-universal{margin:14px 0;padding:14px;border:1px solid var(--line,#cbd9d0);border-left:4px solid var(--forest,#075b3a);border-radius:9px;background:#fff}.jswf-steps{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-top:12px}.jswf-step{position:relative;text-align:center;padding:22px 4px 4px;font-size:.62rem;color:var(--muted,#5c6d64)}.jswf-step:before{content:'';position:absolute;top:5px;left:50%;transform:translateX(-50%);width:10px;height:10px;border-radius:50%;background:#c6d3cc;border:2px solid #fff;box-shadow:0 0 0 1px #b9c9c0}.jswf-step.done,.jswf-step.current{color:var(--forest,#075b3a);font-weight:800}.jswf-step.done:before{background:var(--leaf,#18875a);box-shadow:0 0 0 1px var(--leaf,#18875a)}.jswf-step.current:before{background:#c58b25;box-shadow:0 0 0 2px #efd9ad}.jswf-notify{position:relative}.jswf-count{position:absolute;right:-5px;top:-7px;min-width:18px;height:18px;padding:0 4px;display:grid;place-items:center;border-radius:999px;background:#b4232f;color:#fff;font-size:.62rem;font-weight:900;border:2px solid #fff}.jswf-panel{position:fixed;right:20px;top:88px;z-index:130;width:min(390px,calc(100vw - 24px));max-height:70vh;overflow:auto;background:#fff;border:1px solid #9bb4a7;border-radius:12px;box-shadow:0 18px 55px rgba(0,0,0,.2);padding:12px}.jswf-panel.hidden{display:none!important}.jswf-note{padding:10px;border-bottom:1px solid #e0e7e3;font-size:.74rem}.jswf-note:last-child{border-bottom:0}.jswf-note strong{display:block;margin-bottom:3px}.jswf-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.jswf-actions button{font-size:.68rem}.jswf-toast{position:fixed;left:18px;bottom:18px;z-index:160;max-width:390px;padding:11px 13px;border-radius:8px;background:#023522;color:#fff;box-shadow:0 10px 28px rgba(0,0,0,.22);font-size:.76rem}.jswf-toast.warn{background:#8a570b}.jswf-toast.critical{background:#8f1f2b}.jswf-homeflow{margin-top:10px;padding:10px;border:1px solid var(--line,#cbd9d0);border-radius:8px;background:#fbfdfb;font-size:.74rem;line-height:1.55}@media(max-width:700px){.jswf-steps{grid-template-columns:repeat(4,1fr)}.jswf-panel{right:10px;top:78px}}body.high-contrast .jswf-panel,body.high-contrast .jswf-universal,body.high-contrast .jswf-path-note,body.high-contrast .jswf-homeflow{background:#000!important;color:#fff!important;border-color:#fff!important}";
    document.head.appendChild(s);
  }

  function universalIndex(p,meta){
    if(!p)return 0;
    if(p.status==="solved"||p.stage==="completed")return 6;
    if(p.solution&&p.solution.status!=="approved")return 5;
    if(p.stage==="pilot")return 5;
    var actionStages=["team_formed","proposal","prototype","testing"];
    if(actionStages.indexOf(p.stage)>=0)return 4;
    if(meta)return 3;
    if(["validated","assigned"].indexOf(p.stage)>=0)return 2;
    if(p.stage==="admin_review")return 2;
    if(p.stage==="ai_review")return 1;
    return 0;
  }
  function pathWorker(meta){
    if(!meta)return tx("Awaiting government routing","सरकारी रूटिंग की प्रतीक्षा");
    if(meta.resolution_path==="Direct Government Action")return meta.responsible_authority||"Responsible public authority";
    var c=(meta.recommended_collaborators||[]).join(", ");
    if(meta.resolution_path==="Hybrid")return(meta.responsible_authority||"Responsible public authority")+(c?" + "+c:"");
    return c||"Approved innovation partners";
  }

  function alignDashboard(){
    if(processing)return;processing=true;
    try{
      var s=session(),role=id("sessionRole")?String(id("sessionRole").textContent||"").toLowerCase():(s&&s.role)||"";
      if(!role||role==="admin")return;
      var name=id("sessionName")?id("sessionName").textContent:(s&&s.name)||"",rs=routes(),content=id("content");
      if(!content)return;
      var opportunities=0;
      content.querySelectorAll(".card").forEach(function(card){
        var cid=cardId(card);if(!cid)return;
        var p=problem(cid),show=shouldShowCard(p,rs[cid],role,name);
        card.style.display=show?"":"none";
        if(show){
          if(role==="student"&&!p.claimedBy)opportunities++;
          if((role==="university"||role==="industry")&&!supportedBy(p,role,name))opportunities++;
        }
      });
      var note=id("jswf-role-note");
      if(!note){note=document.createElement("div");note.id="jswf-role-note";note.className="jswf-path-note";var title=content.querySelector(".title");if(title)title.insertAdjacentElement("afterend",note);else content.insertBefore(note,content.firstChild)}
      note.innerHTML=isHindi()
        ? '<strong>सरकार-नियंत्रित अवसर:</strong> इस डैशबोर्ड में केवल वही चुनौतियाँ दिखती हैं जिनके पुष्टि किए गए समाधान मार्ग में '+esc(role==="student"?"Students":role==="university"?"University":"Industry")+' शामिल है। Direct Government Action वाले केस जिम्मेदार सार्वजनिक प्राधिकरण के पास रहते हैं।'
        : '<strong>Government-governed opportunities:</strong> This dashboard shows only challenges whose confirmed resolution path includes '+esc(role==="student"?"Students":role==="university"?"University":"Industry")+'. Direct Government Action cases stay with the responsible public authority.';
      var stats=content.querySelectorAll(".stat strong");if(stats.length>1)stats[1].textContent=opportunities;
    }finally{processing=false}
  }

  function alignTracker(){
    if(processing)return;processing=true;
    try{
      var r=id("trackResult");if(!r)return;
      var clone=r.cloneNode(true);clone.querySelectorAll("[data-jswf-universal]").forEach(function(x){x.remove()});
      var m=String(clone.textContent||"").match(/\bJS(?:-[A-Z0-9]+)+\b/i);if(!m)return;
      var cid=m[0].toUpperCase(),p=problem(cid);if(!p)return;
      var meta=routes()[cid],idx=universalIndex(p,meta),old=r.querySelector("[data-jswf-universal]");
      var sig=[cid,p.stage,p.status,meta&&meta.resolution_path,meta&&meta.responsible_authority,(meta&&meta.recommended_collaborators||[]).join(","),(meta&&meta.accountability_events||[]).length,isHindi()].join("|");
      if(old&&old.dataset.sig===sig)return;
      if(!old){old=document.createElement("div");old.dataset.jswfUniversal="1";old.className="jswf-universal";r.appendChild(old)}
      old.dataset.sig=sig;
      var events=(meta&&Array.isArray(meta.accountability_events)?meta.accountability_events:[]).slice(-4).reverse();
      old.innerHTML='<strong>'+tx("One governed lifecycle","एक ही सरकारी जीवनचक्र")+'</strong><div style="font-size:.7rem;margin-top:3px">'+tx("Case owner","केस मालिक")+': <b>Government / Nodal Administrator</b> · '+tx("Working party","कार्यरत पक्ष")+': <b>'+esc(pathWorker(meta))+'</b></div><div class="jswf-steps">'+UNIVERSAL.map(function(x,i){return'<div class="jswf-step '+(i<idx?'done':i===idx?'current':'')+'">'+esc(isHindi()?x.hi:x.en)+'</div>'}).join("")+'</div>'+(events.length?'<div style="margin-top:10px;font-size:.69rem"><strong>'+tx("Accountability updates","जवाबदेही अपडेट")+'</strong><br>'+events.map(function(e){return esc(new Date(e.at).toLocaleString("en-IN"))+" — "+esc(e.action)+(e.note?": "+esc(e.note):"")}).join("<br>")+'</div>':'');
      Array.from(r.children).forEach(function(ch){if(ch===old)return;if(ch.classList&&ch.classList.contains("progress"))ch.style.display="none";if(ch.classList&&ch.classList.contains("progresslabel"))ch.style.display="none";if(ch.classList&&ch.classList.contains("timeline"))ch.style.display="none"});
    }finally{processing=false}
  }

  function updateHomepage(){
    var lead=id("homeLead");
    if(lead)lead.textContent=tx(
      "JanSamadhan AI analyses citizen reports, groups duplicates, flags urgency, and recommends the responsible public authority and the right resolution path while government remains the case owner.",
      "जनसमाधान AI नागरिक रिपोर्ट का विश्लेषण करता है, डुप्लिकेट रिपोर्ट जोड़ता है, तात्कालिकता पहचानता है और जिम्मेदार सार्वजनिक प्राधिकरण तथा सही समाधान मार्ग सुझाता है; केस का स्वामित्व सरकार के पास रहता है।"
    );
    var about=id("aboutHeading");
    if(about){
      var section=about.closest(".services"),flow=section&&section.querySelector(".flow");
      if(flow)flow.innerHTML=isHindi()
        ? '<div><strong>1 · नागरिक रिपोर्ट</strong><span>एक रिपोर्ट से एक Challenge ID और एक सरकारी केस बनता है।</span></div><div><strong>2 · AI विश्लेषण</strong><span>श्रेणी, तात्कालिकता, डुप्लिकेट संकेत, जिम्मेदार प्राधिकरण और रूटिंग सुझाव।</span></div><div><strong>3 · सरकारी सत्यापन</strong><span>Government / Nodal Administrator केस सत्यापित करके रूटिंग की पुष्टि करता है।</span></div><div><strong>4 · कार्य मार्ग</strong><span>Direct Government Action, Collaborative Innovation या Hybrid — केवल उपयोगी भागीदार जोड़े जाते हैं।</span></div><div><strong>5 · सत्यापन और समाधान</strong><span>एक ही सार्वजनिक ट्रैकर कार्य, जवाबदेही, सत्यापन और अंतिम परिणाम दर्ज करता है।</span></div>'
        : '<div><strong>1 · Citizen report</strong><span>One report creates one Challenge ID and one governed case.</span></div><div><strong>2 · AI analysis</strong><span>Category, urgency, duplicate signals, responsible authority and routing recommendation.</span></div><div><strong>3 · Government verification</strong><span>The Government / Nodal Administrator validates the case and confirms routing.</span></div><div><strong>4 · Action path</strong><span>Direct Government Action, Collaborative Innovation or Hybrid — only useful partners are involved.</span></div><div><strong>5 · Verification & resolution</strong><span>One public tracker records action, accountability, verification and final outcome.</span></div>';
    }
    document.querySelectorAll(".architecture article").forEach(function(a){
      var b=a.querySelector("b");if(!b)return;
      if(/AI decision support|AI निर्णय सहायता/.test(b.textContent.trim())){
        var p=a.querySelector("p");if(p)p.textContent=tx(
          "Groq LLM decision support with deterministic local fallback for category, urgency, routing and admin briefs; human validation remains final.",
          "श्रेणी, तात्कालिकता, रूटिंग और एडमिन ब्रीफ के लिए Groq LLM, साथ में deterministic local fallback; अंतिम सत्यापन मानव प्रशासक करता है।"
        );
      }
    });
    document.querySelectorAll(".serviceitem").forEach(function(si){
      var b=si.querySelector("b"),span=si.querySelector("span");if(!b||!span)return;
      if(/Institution matching|Government-first routing|संस्थान मिलान|सरकार-प्रथम/.test(b.textContent)){
        b.textContent=tx("Government-first routing","सरकार-प्रथम रूटिंग");
        span.textContent=tx(
          "The system recommends a responsible public authority first, then adds students, universities or industry only when useful.",
          "सिस्टम पहले जिम्मेदार सार्वजनिक प्राधिकरण सुझाता है, फिर जरूरत होने पर ही छात्र, विश्वविद्यालय या उद्योग को जोड़ता है।"
        );
      }
    });
  }

  function routeDue(meta){var t=new Date(meta&&meta.confirmed_at||Date.now()).getTime()+Number(meta&&meta.target_days||7)*86400000;return new Date(t)}
  function overdue(p,meta){return !!(p&&meta&&active(p)&&Date.now()>routeDue(meta).getTime())}
  function dangerText(p){var t=((p&&p.title)||"")+" "+((p&&p.description)||"");return /live wire|exposed wire|electric shock|electrocution|gas leak|fire|building collapse|bridge collapse|landslide|open manhole|fallen electric pole|contaminated drinking water|unsafe drinking water/i.test(t)}

  function notificationItems(){
    var s=session(),role=(id("sessionRole")&&id("sessionRole").textContent||s&&s.role||"").toLowerCase(),name=id("sessionName")?id("sessionName").textContent:(s&&s.name)||"",d=loadData(),rs=routes(),items=[];
    if(!role)return items;
    if(role==="admin"){
      (d.accounts||[]).filter(function(a){return a.status==="pending"}).forEach(function(a){items.push({key:"acct:"+a.id,level:"normal",title:tx("Partner approval pending","भागीदार स्वीकृति लंबित"),text:a.name+" · "+a.role})});
      (d.problems||[]).filter(function(p){return active(p)&&!rs[String(p.id||"").toUpperCase()]&&["ai_review","admin_review","validated"].indexOf(p.stage)>=0}).forEach(function(p){items.push({key:"route-needed:"+p.id,level:"normal",title:tx("Government routing required","सरकारी रूटिंग आवश्यक"),text:p.id+" · "+p.title})});
      (d.problems||[]).filter(function(p){return active(p)&&dangerText(p)&&!p.criticalAcknowledged}).forEach(function(p){items.push({key:"critical:"+p.id,level:"critical",title:tx("Critical safety alert","गंभीर सुरक्षा अलर्ट"),text:p.id+" · "+p.title})});
      (d.problems||[]).forEach(function(p){var m=rs[String(p.id||"").toUpperCase()];if(overdue(p,m))items.push({key:"overdue:"+p.id+":"+(m.escalation_level||0),level:"warn",title:tx("Overdue — escalation required","विलंब — एस्केलेशन आवश्यक"),text:p.id+" · "+(m.responsible_authority||"Responsible authority")})});
    }else{
      (d.problems||[]).forEach(function(p){var m=rs[String(p.id||"").toUpperCase()];if(!active(p)||!m)return;if(role==="student"&&p.claimedBy&&String(p.claimedBy).toLowerCase()===String(name).toLowerCase())return;if((role==="university"||role==="industry")&&supportedBy(p,role,name))return;if(collaboratorAllowed(m,role))items.push({key:"route:"+role+":"+p.id+":"+m.resolution_path,level:"normal",title:tx("New governed opportunity","नया सरकारी-मान्य अवसर"),text:p.id+" · "+p.title+" · "+m.resolution_path})});
    }
    return items;
  }
  function seen(){try{return JSON.parse(localStorage.getItem(NOTIFY_SEEN_KEY)||"[]")}catch(e){return[]}}
  function markSeen(items){try{localStorage.setItem(NOTIFY_SEEN_KEY,JSON.stringify(items.map(function(x){return x.key}).slice(-100)))}catch(e){}}
  function toast(text,level){var old=id("jswf-toast");if(old)old.remove();var t=document.createElement("div");t.id="jswf-toast";t.className="jswf-toast "+(level||"");t.textContent=text;document.body.appendChild(t);setTimeout(function(){if(t.parentNode)t.remove()},5200)}
  function maybeBrowserNotify(item){try{if(window.Notification&&Notification.permission==="granted"&&document.visibilityState!=="visible")new Notification("JanSamadhan AI",{body:item.title+" — "+item.text})}catch(e){}}
  function notificationPanel(items){
    var p=id("jswf-notification-panel");if(!p){p=document.createElement("div");p.id="jswf-notification-panel";p.className="jswf-panel hidden";document.body.appendChild(p)}
    p.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><strong>'+tx("Notifications","सूचनाएँ")+'</strong><button class="btn small secondary" id="jswf-enable-browser" type="button">'+tx("Enable browser alerts","ब्राउज़र अलर्ट चालू करें")+'</button></div><div style="font-size:.66rem;color:var(--muted,#5c6d64);margin:4px 0 8px">'+tx("Browser alerts work while this prototype is open. In-app alerts always work.","यह प्रोटोटाइप खुला रहने पर ब्राउज़र अलर्ट काम करते हैं। इन-ऐप अलर्ट हमेशा काम करते हैं।")+'</div>'+(items.length?items.map(function(x){return'<div class="jswf-note"><strong>'+esc(x.title)+'</strong>'+esc(x.text)+'</div>'}).join(""):'<div class="jswf-note">'+tx("No current alerts.","अभी कोई अलर्ट नहीं है।")+'</div>');
    var b=id("jswf-enable-browser");if(b)b.onclick=function(){if(!window.Notification){toast(tx("Browser notifications are not supported here.","इस ब्राउज़र में नोटिफिकेशन समर्थित नहीं हैं।"),"warn");return}Notification.requestPermission().then(function(x){toast(x==="granted"?tx("Browser alerts enabled.","ब्राउज़र अलर्ट चालू हो गए।"):tx("Browser alerts were not enabled.","ब्राउज़र अलर्ट चालू नहीं हुए।"),x==="granted"?"":"warn")})};
    return p;
  }
  function ensureNotificationBell(items){
    var actions=document.querySelector("#dashView .actions");if(!actions)return;
    var b=id("jswf-notify-btn");if(!b){b=document.createElement("button");b.id="jswf-notify-btn";b.type="button";b.className="btn secondary small jswf-notify";b.innerHTML=tx("Notifications","सूचनाएँ")+' <span class="jswf-count" id="jswf-notify-count">0</span>';actions.insertBefore(b,actions.firstChild);b.onclick=function(){var p=notificationPanel(notificationItems());p.classList.toggle("hidden");markSeen(notificationItems());refreshNotifications(false)}}
    var seenKeys=new Set(seen()),unread=items.filter(function(x){return!seenKeys.has(x.key)}).length,c=id("jswf-notify-count");if(c){c.textContent=unread;c.style.display=unread?"grid":"none"}
  }
  function refreshNotifications(announce){
    var items=notificationItems();ensureNotificationBell(items);notificationPanel(items);
    if(announce){var seenKeys=new Set(seen()),fresh=items.filter(function(x){return!seenKeys.has(x.key)&&!announcedKeys.has(x.key)});if(fresh.length){announcedKeys.add(fresh[0].key);toast(fresh[0].title+": "+fresh[0].text,fresh[0].level);maybeBrowserNotify(fresh[0])}}
  }

  function addAccountabilityEvent(cid,action,note,mutator){
    var rs=routes(),meta=rs[cid];if(!meta)return;
    meta.accountability_events=Array.isArray(meta.accountability_events)?meta.accountability_events:[];
    if(mutator)mutator(meta);
    meta.accountability_events.push({action:action,note:note||"",at:now(),by:"Government / Nodal Administrator"});
    if(meta.accountability_events.length>30)meta.accountability_events=meta.accountability_events.slice(-30);
    saveRoute(cid,meta);
    var d=loadData(),p=(d.problems||[]).find(function(x){return String(x.id||"").toUpperCase()===cid});
    if(p){
      p.statusHistory=Array.isArray(p.statusHistory)?p.statusHistory:[];
      p.statusHistory.push({stage:p.stage,by:"Government / Nodal Administrator",note:"Accountability: "+action+(note?" — "+note:""),at:now()});
      if(p.statusHistory.length>30)p.statusHistory=p.statusHistory.slice(-30);
      saveData(d);
      try{if(window.JSCloud)window.JSCloud.set("problems",cid,{routing:meta,statusHistory:p.statusHistory,updatedAt:now()},true)}catch(e){}
    }
    toast(action+" recorded for "+cid,"warn");scheduleAll();
  }
  function accountabilityAction(e){
    var stageButton=e.target.closest("[data-stage]");if(stageButton)setTimeout(function(){restrictAdminStageDialog(stageButton.dataset.stage)},0);
    var b=e.target.closest("[data-jswf-action]");if(!b)return;
    var cid=b.dataset.cid,action=b.dataset.jswfAction,meta=routes()[cid];if(!meta)return;
    if(action==="update")addAccountabilityEvent(cid,"Update requested","Responsible authority asked to provide a progress update.");
    if(action==="escalate")addAccountabilityEvent(cid,"Escalated","Escalation level increased for government review.",function(m){m.escalation_level=Number(m.escalation_level||0)+1});
    if(action==="reassign"){
      var v=prompt("Enter the new responsible authority:",meta.responsible_authority||"");
      if(v&&v.trim())addAccountabilityEvent(cid,"Reassigned","Responsible authority changed to "+v.trim()+".",function(m){m.responsible_authority=v.trim()});
    }
    if(action==="collab"){
      var v2=prompt("Add collaborators (Students, University, Industry). Separate multiple values with commas:",(meta.recommended_collaborators||[]).join(", "));
      if(v2!=null){
        var allow={students:"Students",student:"Students",university:"University",industry:"Industry"},arr=v2.split(",").map(function(x){return allow[x.trim().toLowerCase()]}).filter(Boolean);
        arr=Array.from(new Set(arr));
        addAccountabilityEvent(cid,"Collaboration updated",arr.length?"Added: "+arr.join(", "):"Collaboration cleared.",function(m){m.recommended_collaborators=arr;if(arr.length&&m.resolution_path==="Direct Government Action")m.resolution_path="Hybrid"});
      }
    }
  }

  function injectOverdueActions(){
    var content=id("content");if(!content)return;
    var s=session(),role=(id("sessionRole")&&id("sessionRole").textContent||s&&s.role||"").toLowerCase();if(role!=="admin")return;
    var rs=routes();
    content.querySelectorAll(".card").forEach(function(card){
      var cid=cardId(card),p=problem(cid),m=rs[cid];if(!cid||!overdue(p,m))return;
      var a=card.querySelector("[data-jswf-accountability]");
      if(!a){a=document.createElement("div");a.dataset.jswfAccountability="1";a.className="jswf-path-note";card.appendChild(a)}
      a.innerHTML='<strong>'+tx("OVERDUE — escalation required","विलंब — एस्केलेशन आवश्यक")+'</strong><div class="jswf-actions"><button class="btn small secondary" data-jswf-action="update" data-cid="'+esc(cid)+'">'+tx("Request update","अपडेट माँगें")+'</button><button class="btn small secondary" data-jswf-action="reassign" data-cid="'+esc(cid)+'">'+tx("Reassign","पुनः सौंपें")+'</button><button class="btn small danger" data-jswf-action="escalate" data-cid="'+esc(cid)+'">'+tx("Escalate","एस्केलेट करें")+'</button><button class="btn small amber" data-jswf-action="collab" data-cid="'+esc(cid)+'">'+tx("Add collaboration","सहयोग जोड़ें")+'</button></div>';
    });
  }

  function alignAdminUI(){
    var s=session(),role=(id("sessionRole")&&id("sessionRole").textContent||s&&s.role||"").toLowerCase();
    if(role!=="admin")return;
    var content=id("content");if(!content)return;
    var walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT),n;
    while((n=walker.nextNode())){
      if(n.nodeValue&&n.nodeValue.trim()==="Assigned institution")n.nodeValue=n.nodeValue.replace("Assigned institution",tx("Collaborating institution (optional)","सहयोगी संस्थान (वैकल्पिक)"));
      if(n.nodeValue&&n.nodeValue.indexOf("Validate, assign institutions and request support from one place")>=0)n.nodeValue=n.nodeValue.replace("Validate, assign institutions and request support from one place",tx("Validate, confirm responsible authority and choose the correct resolution path from one place","एक ही स्थान से सत्यापित करें, जिम्मेदार प्राधिकरण तय करें और सही समाधान मार्ग चुनें"));
    }
  }

  function restrictAdminStageDialog(cid){
    var meta=routes()[cid],select=id("stageSelect");if(!meta||!select)return;
    var uni=id("stageUniversity"),field=uni&&uni.closest?uni.closest(".field"):null;
    if(field)field.style.display="";
    Array.from(select.options).forEach(function(o){o.hidden=false});
    if(meta.resolution_path==="Direct Government Action"){
      var labels={admin_review:tx("Government Verified","सरकारी सत्यापन"),assigned:tx("Routed to Authority","प्राधिकरण को रूट किया"),testing:tx("Action In Progress","कार्य प्रगति पर"),pilot:tx("Verification","सत्यापन"),completed:tx("Resolved","समाधान पूर्ण")};
      Array.from(select.options).forEach(function(o){o.hidden=!labels[o.value];if(labels[o.value])o.textContent=labels[o.value]});
      if(uni){uni.value="";if(field)field.style.display="none"}
    }
  }

  function scheduleDashboard(){clearTimeout(dashboardTimer);dashboardTimer=setTimeout(function(){alignDashboard();alignAdminUI();injectOverdueActions();refreshNotifications(true)},90)}
  function scheduleTracker(){clearTimeout(trackerTimer);trackerTimer=setTimeout(alignTracker,90)}
  function scheduleNotifications(){clearTimeout(notificationTimer);notificationTimer=setTimeout(function(){refreshNotifications(true)},160)}
  function scheduleAll(){scheduleDashboard();scheduleTracker();scheduleNotifications()}

  function observe(){
    var c=id("content");if(c&&!c.dataset.jswfObserved){c.dataset.jswfObserved="1";new MutationObserver(function(){scheduleDashboard()}).observe(c,{childList:true,subtree:true})}
    var t=id("trackResult");if(t&&!t.dataset.jswfObserved){t.dataset.jswfObserved="1";new MutationObserver(function(){scheduleTracker()}).observe(t,{childList:true,subtree:true})}
    var role=id("sessionRole");if(role&&!role.dataset.jswfObserved){role.dataset.jswfObserved="1";new MutationObserver(function(){scheduleAll()}).observe(role,{childList:true,characterData:true,subtree:true})}
    if(!document.documentElement.dataset.jswfLangObserved){document.documentElement.dataset.jswfLangObserved="1";new MutationObserver(function(){updateHomepage();scheduleAll()}).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]})}
  }

  function init(){ensureStyles();updateHomepage();alignDashboard();alignAdminUI();alignTracker();injectOverdueActions();refreshNotifications(true);observe();document.addEventListener("click",accountabilityAction);setTimeout(scheduleAll,700)}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
