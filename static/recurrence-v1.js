/* JanSamadhan Recurrence Intelligence v2
   Hardens post-resolution recurrence detection without changing duplicate logic.
   - paraphrase-tolerant text comparison (stemming + issue concepts)
   - optional geo evidence with conservative thresholds
   - chronology checks and legacy-data safeguards
   - human decisions are sticky until recurrence-relevant report fields change
   - GIS proximity is labelled as evidence, not a confirmed recurrence
*/
(function(){
  "use strict";

  var DATA_KEYS=["jansamadhan_data_v3","jansamadhan_data_v2"];
  var processing=false,scanTimer=null,uiTimer=null;
  var announced=new Set();

  var STOP={
    the:1,a:1,an:1,and:1,or:1,of:1,to:1,in:1,on:1,at:1,is:1,are:1,was:1,were:1,
    for:1,from:1,with:1,this:1,that:1,near:1,again:1,has:1,have:1,had:1,been:1,
    it:1,its:1,our:1,very:1,still:1,once:1,more:1,issue:1,problem:1,reported:1
  };

  var CONCEPTS={
    water:["water","tap","drinking","supply","pipeline","pipe","jal","pani","पानी","जल"],
    contamination:["contaminat","dirty","unsafe","foul","smell","pollut","impure","quality","दूषित","गंदा","बदबू"],
    outage:["no water","no supply","dry","unavailable","shortage","not receiving","disrupt","बंद","आपूर्ति नहीं","सूखा"],
    pothole:["pothole","pit","crater","gaddha","गड्ढा"],
    road:["road","street","lane","highway","sadak","सड़क"],
    drainage:["drain","drainage","sewer","sewage","overflow","nali","नाली"],
    garbage:["garbage","waste","trash","rubbish","dump","कचरा"],
    electricity:["electric","wire","livewire","power","voltage","transformer","pole","बिजली","तार"],
    streetlight:["streetlight","streetlamp","lamp","light","लाइट"],
    flooding:["flood","waterlog","waterlogging","inundat","जलभराव","बाढ़"],
    landslide:["landslide","slope","debris","भूस्खलन"],
    sanitation:["sanitation","toilet","cleaning","hygiene","स्वच्छता"],
    healthcare:["hospital","clinic","doctor","medicine","health","स्वास्थ्य"],
    accessibility:["wheelchair","ramp","accessible","accessibility","दिव्यांग"]
  };

  function id(x){return document.getElementById(x)}
  function isHindi(){return document.documentElement.lang==="hi"}
  function tx(en,hi){return isHindi()?hi:en}
  function esc(x){return String(x==null?"":x).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function now(){return new Date().toISOString()}
  function norm(x){return String(x||"").toLowerCase().replace(/[^a-z0-9\u0900-\u097f ]+/g," ").replace(/\s+/g," ").trim()}
  function active(p){return !!p&&String(p.status||"").toLowerCase()!=="solved"&&String(p.stage||"").toLowerCase()!=="completed"}
  function resolved(p){return !!p&&!active(p)}
  function validNum(n){return typeof n==="number"&&isFinite(n)}
  function validGeo(g){return !!(g&&validNum(Number(g.lat))&&validNum(Number(g.lng))&&Math.abs(Number(g.lat))<=90&&Math.abs(Number(g.lng))<=180)}

  function stem(w){
    w=norm(w);
    if(!w)return "";
    if(w.length>6&&/ies$/.test(w))w=w.slice(0,-3)+"y";
    else if(w.length>6&&/ing$/.test(w))w=w.slice(0,-3);
    else if(w.length>5&&/ed$/.test(w))w=w.slice(0,-2);
    else if(w.length>5&&/es$/.test(w))w=w.slice(0,-2);
    else if(w.length>4&&/s$/.test(w))w=w.slice(0,-1);
    return w;
  }

  function words(x){
    return norm(x).split(" ").map(stem).filter(function(w){return w.length>2&&!STOP[w]})
  }

  function tokenSet(x){return new Set(words(x))}
  function setJaccard(A,B){
    if(!A.size||!B.size)return 0;
    var inter=0;A.forEach(function(x){if(B.has(x))inter++});
    return inter/(A.size+B.size-inter);
  }
  function jaccard(a,b){return setJaccard(tokenSet(a),tokenSet(b))}

  function conceptSet(x){
    var text=" "+norm(x)+" ",tokens=words(x),out=new Set();
    Object.keys(CONCEPTS).forEach(function(key){
      var aliases=CONCEPTS[key],hit=false;
      aliases.forEach(function(alias){
        if(hit)return;
        var a=norm(alias);
        if(!a)return;
        if(a.indexOf(" ")>=0){if(text.indexOf(" "+a+" ")>=0)hit=true;return}
        var sa=stem(a);
        if(tokens.some(function(t){return t===sa||(sa.length>=5&&t.indexOf(sa)===0)}))hit=true;
      });
      if(hit)out.add(key);
    });
    return out;
  }

  function conceptSimilarity(a,b){return setJaccard(conceptSet(a),conceptSet(b))}
  function issueConceptOverlap(a,b){
    var broad={water:1,road:1,electricity:1,healthcare:1,accessibility:1};
    var A=conceptSet(a),B=conceptSet(b),hit=false;
    A.forEach(function(x){if(!broad[x]&&B.has(x))hit=true});
    return hit;
  }

  function textSimilarity(a,b){
    var A=(a.title||"")+" "+(a.description||"");
    var B=(b.title||"")+" "+(b.description||"");
    var lexical=jaccard(A,B),concept=conceptSimilarity(A,B),issueOverlap=issueConceptOverlap(A,B);
    var broad={water:1,road:1,electricity:1,healthcare:1,accessibility:1};
    var CA=conceptSet(A),CB=conceptSet(B),issueA=false,issueB=false;
    CA.forEach(function(x){if(!broad[x])issueA=true});
    CB.forEach(function(x){if(!broad[x])issueB=true});
    var semantic=issueOverlap?concept*.82:concept*.45;
    return {score:Math.max(lexical,semantic),lexical:lexical,concept:concept,issueOverlap:issueOverlap,issueA:issueA,issueB:issueB};
  }

  function locationSimilarity(a,b){
    var A=norm(a),B=norm(b);
    if(!A||!B)return 0;
    if(A===B)return 1;
    if((A.length>5&&B.indexOf(A)>=0)||(B.length>5&&A.indexOf(B)>=0))return .9;
    return jaccard(A,B);
  }

  function geoDistanceKm(a,b){
    if(!validGeo(a)||!validGeo(b))return Infinity;
    var R=6371,lat1=Number(a.lat)*Math.PI/180,lat2=Number(b.lat)*Math.PI/180;
    var dLat=(Number(b.lat)-Number(a.lat))*Math.PI/180,dLon=(Number(b.lng)-Number(a.lng))*Math.PI/180;
    var x=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
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

  function firstTime(vals){
    for(var i=0;i<vals.length;i++){
      var t=Date.parse(vals[i]||"");
      if(!isNaN(t))return t;
    }
    return 0;
  }

  function problemTime(p){
    var vals=[p.createdAt,p.created_at,p.reportedAt,p.submittedAt];
    if(Array.isArray(p.statusHistory)){
      p.statusHistory.forEach(function(h){
        var s=String(h.stage||"").toLowerCase(),n=String(h.note||"").toLowerCase();
        if(s==="reported"||/report|submitted|दर्ज/.test(n))vals.push(h.at);
      });
    }
    return firstTime(vals);
  }

  function resolvedTime(p){
    var vals=[p.resolvedAt,p.completedAt];
    if(Array.isArray(p.statusHistory)){
      p.statusHistory.forEach(function(h){
        var s=String(h.stage||"").toLowerCase(),n=String(h.note||"").toLowerCase();
        if(s==="completed"||/resolved|solution approved|completion verified|समाधान/.test(n))vals.push(h.at);
      });
    }
    var t=0;
    vals.forEach(function(v){var x=Date.parse(v||"");if(!isNaN(x)&&x>t)t=x});
    if(!t&&resolved(p)){
      var fallback=Date.parse(p.updatedAt||"");
      if(!isNaN(fallback))t=fallback;
    }
    return t;
  }

  function recurrenceFingerprint(p){
    var g=validGeo(p.geo)?Number(p.geo.lat).toFixed(4)+","+Number(p.geo.lng).toFixed(4):"";
    return [norm(p.title),norm(p.description),norm(p.location),norm(p.category),norm(p.district),g].join("|");
  }

  function score(current,old){
    var loc=locationSimilarity(current.location,old.location);
    var textInfo=textSimilarity(current,old),text=textInfo.score;
    var category=norm(current.category)&&norm(current.category)===norm(old.category)?1:0;
    var district=norm(current.district)&&norm(current.district)===norm(old.district)?1:0;
    var distance=geoDistanceKm(current.geo,old.geo);
    var geo=distance<=.35?1:distance<=.75?.88:distance<=1.5?.68:distance<=2?.5:0;

    var total=loc*.30+text*.34+category*.14+district*.07+geo*.15;
    if(!validGeo(current.geo)||!validGeo(old.geo))total=loc*.40+text*.37+category*.15+district*.08;

    var reasons=[];
    if(geo>=.88)reasons.push("Very close map location");
    else if(geo>=.5)reasons.push("Nearby map location");
    if(loc>=.75)reasons.push("Same or highly similar locality");
    else if(loc>=.45)reasons.push("Similar locality");
    if(textInfo.concept>=.55&&textInfo.lexical<.28)reasons.push("Similar issue meaning despite different wording");
    else if(text>=.55)reasons.push("Highly similar problem description");
    else if(text>=.28)reasons.push("Similar problem description");
    if(category)reasons.push("Same category");
    if(district)reasons.push("Same district");

    return{score:total,loc:loc,text:text,lexical:textInfo.lexical,concept:textInfo.concept,issueOverlap:textInfo.issueOverlap,issueA:textInfo.issueA,issueB:textInfo.issueB,category:category,district:district,geo:geo,distance:distance,reasons:reasons};
  }

  function qualifies(s,ct,rt){
    if(ct&&rt&&rt>=ct)return false;

    var timingKnown=!!(ct&&rt);
    var strongPlace=s.loc>=.45||s.geo>=.68;
    var strongMeaning=s.lexical>=.45||(s.issueOverlap&&(s.text>=.28||s.concept>=.48));

    if(!s.category)return false;
    if(s.issueA&&s.issueB&&!s.issueOverlap&&s.lexical<.72)return false;
    if(!strongPlace||!strongMeaning)return false;

    if(timingKnown)return s.score>=.56;

    return (s.geo>=.88||s.loc>=.75)&&s.issueOverlap&&s.concept>=.55&&s.score>=.66;
  }

  function bestResolvedMatch(current,problems){
    var ct=problemTime(current),best=null;
    problems.forEach(function(old){
      if(!resolved(old)||String(old.id||"")===String(current.id||""))return;
      var rt=resolvedTime(old),s=score(current,old);
      if(!qualifies(s,ct,rt))return;
      if(!best||s.score>best.score){
        var reasons=s.reasons.slice();
        if(!(ct&&rt))reasons.push("Legacy timing incomplete — stronger evidence required");
        best={problem:old,score:s.score,loc:s.loc,text:s.text,concept:s.concept,geo:s.geo,distance:s.distance,reasons:reasons,resolvedAt:rt?new Date(rt).toISOString():null};
      }
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

        var fp=recurrenceFingerprint(p);
        if(p.recurrence&&(p.recurrence.status==="confirmed"||p.recurrence.status==="dismissed")&&p.recurrence.reviewFingerprint===fp)return;

        var match=bestResolvedMatch(p,problems);
        if(!match){
          if(p.recurrence&&p.recurrence.status==="candidate"){delete p.recurrence;changed=true;syncProblem(p)}
          return;
        }

        var prev=String(match.problem.id||"").toUpperCase();
        var currentSig=prev+"|"+Math.round(match.score*100)+"|"+fp;
        var oldSig=p.recurrence&&(String(p.recurrence.previousChallengeId||"").toUpperCase()+"|"+Math.round(Number(p.recurrence.score||0)*100)+"|"+String(p.recurrence.sourceFingerprint||""));

        if(currentSig!==oldSig||!p.recurrence||p.recurrence.status!=="candidate"){
          p.recurrence={
            status:"candidate",
            previousChallengeId:prev,
            score:Number(match.score.toFixed(2)),
            detectedAt:now(),
            previousResolvedAt:match.resolvedAt,
            distanceKm:isFinite(match.distance)?Number(match.distance.toFixed(2)):null,
            reasons:match.reasons,
            sourceFingerprint:fp,
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
      var p=recurrenceFor(cid),r=p&&p.recurrence,old=card.querySelector("[data-jsrec-card]");
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
    var m=String(clone.textContent||"").match(/\bJS(?:-[A-Z0-9]+)+\b/i),old=box.querySelector("[data-jsrec-track]");
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

  function patchGISLabels(){
    var store=loadData().data,problems=store.problems||[],activeIds=new Set();
    var solved=problems.filter(function(p){return resolved(p)&&validGeo(p.geo)});
    problems.filter(function(p){return active(p)&&validGeo(p.geo)}).forEach(function(a){
      solved.forEach(function(s){
        if(norm(a.category)!==norm(s.category))return;
        if(geoDistanceKm(a.geo,s.geo)<=2)activeIds.add(String(a.id||""));
      });
    });

    var metrics=id("jsgeo-metrics");
    if(metrics){
      Array.from(metrics.querySelectorAll(".jsgeo-metric")).forEach(function(el){
        if(/recurrence signals|पुनरावृत्ति संकेत/i.test(el.textContent||"")){
          el.textContent=(isHindi()?"नज़दीकी हल-केस समीक्षा ":"Nearby solved-case reviews ")+activeIds.size;
          el.title=isHindi()?"यह केवल स्थान-आधारित समीक्षा संकेत है; recurrence की पुष्टि मानव/मुख्य detector करता है।":"This is proximity evidence only; the main detector and human review determine recurrence.";
        }
      });
    }

    var intel=id("jsgeo-intel");
    if(intel&&/Possible recurrence signals|संभावित पुनरावृत्ति संकेत/i.test(intel.textContent||"")){
      intel.textContent=String(intel.textContent||"")
        .replace(/Possible recurrence signals:/i,"Nearby solved cases to review:")
        .replace(/संभावित पुनरावृत्ति संकेत:/i,"समीक्षा के लिए नज़दीकी हल मामले:");
    }
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
    p.recurrence.reviewFingerprint=recurrenceFingerprint(p);
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

  function scheduleUI(){
    clearTimeout(uiTimer);
    uiTimer=setTimeout(function(){injectCards();injectTracker();injectAdminSummary();patchGISLabels()},100);
  }
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
    new MutationObserver(function(muts){
      if(muts.some(function(m){return m.target&&m.target.closest&&m.target.closest("#jsgeo-metrics,#jsgeo-intel")}))setTimeout(patchGISLabels,0);
    }).observe(document.body,{childList:true,subtree:true,characterData:true});
  }

  function init(){
    ensureStyles();document.addEventListener("click",onClick);scan();observe();setTimeout(scan,900);setTimeout(patchGISLabels,1100);
    window.JanSamadhanRecurrence={version:"2.0",rescan:scan};
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
