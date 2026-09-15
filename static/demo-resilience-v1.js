/* JanSamadhan demo resilience v1
   Keeps citizen reporting usable if the external Leaflet/CDN map fails to load.
   Normal mode still requires a real Jharkhand map pin. In map-outage mode only,
   the jurisdiction guard may validate the selected Jharkhand district using its
   approximate district centre, while the report remains without exact geo data.
   This fallback is visibly labelled and still requires district + locality text.
*/
(function(){
  "use strict";

  var DISTRICT_CENTERS={
    "Bokaro":[23.6693,86.1511],"Chatra":[24.2065,84.8713],"Deoghar":[24.4852,86.6948],
    "Dhanbad":[23.7957,86.4304],"Dumka":[24.2681,87.2486],"East Singhbhum":[22.8046,86.2029],
    "Garhwa":[24.1600,83.8070],"Giridih":[24.1856,86.2996],"Godda":[24.8270,87.2120],
    "Gumla":[23.0441,84.5370],"Hazaribagh":[23.9966,85.3691],"Jamtara":[23.9638,86.8028],
    "Khunti":[23.0760,85.2780],"Koderma":[24.4675,85.5934],"Latehar":[23.7442,84.4990],
    "Lohardaga":[23.4330,84.6799],"Pakur":[24.6337,87.8494],"Palamu":[24.0398,84.0907],
    "Ramgarh":[23.6341,85.5211],"Ranchi":[23.3441,85.3096],"Sahibganj":[25.2445,87.6348],
    "Saraikela Kharsawan":[22.7047,85.9310],"Simdega":[22.6152,84.5020],"West Singhbhum":[22.5524,85.8025]
  };

  var wrapped=false,scanTimer=null,fallbackUsed=false;

  function id(x){return document.getElementById(x)}
  function isHindi(){return document.documentElement.lang==="hi"}
  function mapFailed(){var box=id("jsgeo-report-map");return !!(box&&box.querySelector(".jsgeo-fallback"))}
  function district(){var el=id("rDistrict");return el?String(el.value||""):""}
  function locality(){var el=id("rLocation");return el?String(el.value||"").trim():""}

  function fallbackGeo(){
    if(!mapFailed())return null;
    var d=district(),c=DISTRICT_CENTERS[d];
    if(!c||!locality())return null;
    return {lat:c[0],lng:c[1],source:"district-centre-demo-fallback",approximate:true};
  }

  function wrapGIS(){
    if(wrapped||!(window.JanSamadhanGIS&&typeof window.JanSamadhanGIS.getPendingGeo==="function"))return;
    var original=window.JanSamadhanGIS.getPendingGeo.bind(window.JanSamadhanGIS);
    window.JanSamadhanGIS.getPendingGeo=function(){
      var real=null;
      try{real=original()}catch(e){}
      if(real)return real;
      return fallbackGeo();
    };
    wrapped=true;
  }

  function ensureRequirementStyles(){
    if(id("jsdemo-map-requirement-style"))return;
    var s=document.createElement("style");
    s.id="jsdemo-map-requirement-style";
    s.textContent='.jsdemo-map-label{font-size:0!important}.jsdemo-map-label::after{content:"Map location (required)";font-size:.77rem;font-weight:800;color:#30483b}html[lang="hi"] .jsdemo-map-label::after{content:"मानचित्र स्थान (आवश्यक)"}body.jsdemo-map-outage .jsdemo-map-label::after{content:"Map location (temporarily unavailable)"}html[lang="hi"] body.jsdemo-map-outage .jsdemo-map-label::after{content:"मानचित्र स्थान (अस्थायी रूप से उपलब्ध नहीं)"}';
    document.head.appendChild(s);
  }

  function requirementText(){
    return isHindi()?"रिपोर्ट जमा करने से पहले झारखंड के अंदर स्थान पिन चुनें।":"Choose a pin inside Jharkhand before submitting the report.";
  }

  function annotateMapRequirement(){
    ensureRequirementStyles();
    var wrap=id("jsgeo-wrap"),failed=mapFailed();
    document.body.classList.toggle("jsdemo-map-outage",failed);
    if(!wrap)return;
    var label=wrap.querySelector("label");
    if(label){
      label.classList.add("jsdemo-map-label");
      label.setAttribute("aria-label",failed?(isHindi()?"मानचित्र स्थान अस्थायी रूप से उपलब्ध नहीं":"Map location temporarily unavailable"):(isHindi()?"मानचित्र स्थान आवश्यक":"Map location required"));
    }
    if(!failed){
      var status=id("jsgeo-status"),geo=null;
      try{if(window.JanSamadhanGIS&&typeof window.JanSamadhanGIS.getPendingGeo==="function")geo=window.JanSamadhanGIS.getPendingGeo()}catch(e){}
      if(status&&!geo&&status.textContent!==requirementText())status.textContent=requirementText();
    }
  }

  function ensureNotice(){
    var box=id("jsgeo-report-map");
    if(!box||!mapFailed())return;
    var wrap=id("jsgeo-wrap");if(!wrap||id("jsdemo-map-fallback-note"))return;
    var n=document.createElement("div");
    n.id="jsdemo-map-fallback-note";
    n.setAttribute("role","status");
    n.style.cssText="margin-top:8px;padding:9px 10px;border:1px solid #e2c98d;border-left:4px solid #a96100;border-radius:7px;background:#fff8e9;font-size:.72rem;line-height:1.45;color:#5d4715";
    n.textContent=isHindi()
      ?"मानचित्र सेवा उपलब्ध नहीं है। डेमो fallback सक्रिय है: वैध झारखंड जिला और लिखित locality के आधार पर रिपोर्ट जारी रह सकती है; सटीक स्थान को admin को बाद में सत्यापित करना होगा।"
      :"Map service is unavailable. Demo fallback is active: the report can continue using a valid Jharkhand district plus locality text; exact location must be verified by the administrator later.";
    wrap.appendChild(n);
  }

  function annotateUseLocation(){
    var btn=id("jsgeo-use-location");if(!btn)return;
    btn.title=isHindi()?"केवल झारखंड के अंदर होने पर उपयोग करें। बाहर होने पर मानचित्र पर झारखंड स्थान चुनें।":"Use only when you are physically inside Jharkhand. Otherwise choose a Jharkhand location on the map.";
    btn.setAttribute("aria-label",isHindi()?"मेरी लोकेशन इस्तेमाल करें — केवल झारखंड में":"Use my location — Jharkhand only");
  }

  function bindClearPin(){
    var btn=id("jsgeo-clear");if(!btn||btn.dataset.jsdemoRequiredBound==="1")return;
    btn.dataset.jsdemoRequiredBound="1";
    btn.addEventListener("click",function(){
      setTimeout(function(){
        if(mapFailed())return;
        var s=id("jsgeo-status");
        if(s)s.textContent=requirementText();
      },30);
    });
  }

  function bindSubmit(){
    var form=id("reportForm");if(!form||form.dataset.jsdemoResilience==="1")return;
    form.dataset.jsdemoResilience="1";
    form.addEventListener("submit",function(){
      fallbackUsed=!!fallbackGeo();
      if(!fallbackUsed)return;
      setTimeout(function(){
        var s=id("jsjh-guard-status");
        if(s){
          s.className="jsjh-guard-status good";
          s.textContent=isHindi()
            ?"मानचित्र outage fallback · जिला + locality स्वीकार · सटीक स्थान की admin verification आवश्यक"
            :"Map-outage fallback · district + locality accepted · exact location requires admin verification";
        }
      },0);
    },true);
  }

  function scan(){
    wrapGIS();annotateMapRequirement();annotateUseLocation();bindClearPin();bindSubmit();ensureNotice();
    if(!mapFailed()&&id("jsdemo-map-fallback-note"))id("jsdemo-map-fallback-note").remove();
  }

  function init(){
    scan();
    new MutationObserver(function(){clearTimeout(scanTimer);scanTimer=setTimeout(scan,80)}).observe(document.body,{childList:true,subtree:true});
    new MutationObserver(function(){setTimeout(scan,0)}).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
    window.JanSamadhanDemoResilience={version:"1.2",mapFallbackActive:function(){return mapFailed()},fallbackUsed:function(){return fallbackUsed}};
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();

/* Cloud sync recovery.
   The official presentation layer namespaces Firestore collections for demo
   isolation. That can conflict with existing Firebase security rules that only
   permit the original `accounts` and `problems` collections. This recovery path
   deliberately uses firebase.app().firestore(), which bypasses the presentation
   wrapper, then mirrors the normal app state to the original cloud collections.
*/
(function(){
  "use strict";

  var DATA_KEY="jansamadhan_data_v3";
  var connected=false;
  var directDb=null;
  var applyingRemote=false;
  var pushTimer=null;
  var listenersAttached=false;
  var storagePatched=false;
  var connectAttempts=0;

  function badgeElements(){
    return [document.getElementById("cloudStatus"),document.getElementById("cloudStatusDash")].filter(Boolean);
  }

  function setBadge(ok,text,detail){
    badgeElements().forEach(function(el){
      el.className="cloud-badge "+(ok?"":"offline");
      el.innerHTML='<span class="dot"></span><span>'+String(text||"")+'</span>';
      if(detail)el.title=detail;
      else el.removeAttribute("title");
    });
    window.JanSamadhanRuntime=window.JanSamadhanRuntime||{};
    window.JanSamadhanRuntime.cloudMode=ok?"firebase-live":"local";
    window.JanSamadhanRuntime.cloudDetail=detail||"";
  }

  function state(){
    try{
      var raw=localStorage.getItem(DATA_KEY);
      var parsed=JSON.parse(raw||"null");
      return parsed&&Array.isArray(parsed.accounts)&&Array.isArray(parsed.problems)?parsed:null;
    }catch(e){return null}
  }

  function safeDoc(value){
    var out={};
    Object.keys(value||{}).forEach(function(k){
      var v=value[k];
      if(typeof v==="undefined")return;
      if(k==="photo"&&typeof v==="string"&&v.length>180000){
        out.photo="";
        out.photoLocalOnly=true;
      }else out[k]=v;
    });
    return out;
  }

  function pushState(snapshot){
    if(!connected||!directDb||applyingRemote)return Promise.resolve();
    var d=snapshot||state();
    if(!d)return Promise.resolve();
    try{
      var batch=directDb.batch();
      d.accounts.forEach(function(a){
        if(!a||!a.id)return;
        batch.set(directDb.collection("accounts").doc(String(a.id)),safeDoc(a),{merge:true});
      });
      d.problems.forEach(function(p){
        if(!p||!p.id)return;
        batch.set(directDb.collection("problems").doc(String(p.id)),safeDoc(p),{merge:true});
      });
      return batch.commit().then(function(){
        setBadge(true,"Live Cloud DB Active","Firebase sync recovered through the original cloud collections.");
      }).catch(function(err){
        connected=false;
        setBadge(false,"Cloud save failed · Local mode",String((err&&err.code)||"")+" "+String((err&&err.message)||err||""));
        throw err;
      });
    }catch(e){
      connected=false;
      setBadge(false,"Cloud save failed · Local mode",String(e&&e.message||e));
      return Promise.reject(e);
    }
  }

  function schedulePush(){
    clearTimeout(pushTimer);
    pushTimer=setTimeout(function(){pushState().catch(function(){})},180);
  }

  function patchLocalStorage(){
    if(storagePatched)return;
    try{
      var proto=Object.getPrototypeOf(window.localStorage);
      var previous=proto.setItem;
      proto.setItem=function(key,value){
        var result=previous.call(this,key,value);
        if(this===window.localStorage&&String(key)===DATA_KEY&&!applyingRemote)schedulePush();
        return result;
      };
      storagePatched=true;
    }catch(e){
      console.warn("Cloud recovery could not observe local saves",e);
    }
  }

  function mergeRemote(accounts,problems){
    var local=state();
    if(!local)return false;
    var next={};
    Object.keys(local).forEach(function(k){next[k]=local[k]});
    if(accounts&&accounts.length)next.accounts=accounts;
    if(problems&&problems.length)next.problems=problems;
    var before=JSON.stringify(local);
    var after=JSON.stringify(next);
    if(before===after)return false;
    applyingRemote=true;
    try{localStorage.setItem(DATA_KEY,after)}finally{applyingRemote=false}
    return true;
  }

  function docs(snapshot){
    var out=[];
    snapshot.forEach(function(doc){
      var value=doc.data()||{};
      value.id=value.id||doc.id;
      out.push(value);
    });
    return out;
  }

  function attachListeners(){
    if(listenersAttached||!directDb)return;
    listenersAttached=true;
    directDb.collection("accounts").onSnapshot(function(snap){
      if(applyingRemote)return;
      var current=state();
      if(!current)return;
      var accounts=docs(snap);
      if(accounts.length)mergeRemote(accounts,current.problems);
    },function(err){
      connected=false;
      setBadge(false,"Cloud sync blocked · Local mode",String((err&&err.code)||"")+" "+String((err&&err.message)||err||""));
    });
    directDb.collection("problems").onSnapshot(function(snap){
      if(applyingRemote)return;
      var current=state();
      if(!current)return;
      var problems=docs(snap);
      if(problems.length)mergeRemote(current.accounts,problems);
    },function(err){
      connected=false;
      setBadge(false,"Cloud sync blocked · Local mode",String((err&&err.code)||"")+" "+String((err&&err.message)||err||""));
    });
  }

  function hydrate(){
    return Promise.all([
      directDb.collection("accounts").get(),
      directDb.collection("problems").get()
    ]).then(function(results){
      var accounts=docs(results[0]),problems=docs(results[1]);
      if(!accounts.length&&!problems.length){
        return pushState();
      }
      var changed=mergeRemote(accounts,problems);
      if(changed&&sessionStorage.getItem("js_cloud_hydrated_v1")!=="1"){
        sessionStorage.setItem("js_cloud_hydrated_v1","1");
        setTimeout(function(){location.reload()},120);
      }
    });
  }

  function probe(){
    if(!directDb)return Promise.reject(new Error("Firestore unavailable"));
    return directDb.collection("accounts").limit(1).get();
  }

  function connect(){
    connectAttempts++;
    if(connected)return;
    if(!(window.firebase&&firebase.app)){
      if(connectAttempts<40)setTimeout(connect,250);
      return;
    }
    try{
      var app=firebase.app();
      if(!app||typeof app.firestore!=="function"){
        if(connectAttempts<40)setTimeout(connect,250);
        return;
      }
      directDb=app.firestore();
    }catch(e){
      if(connectAttempts<40)setTimeout(connect,250);
      return;
    }

    setBadge(false,"Connecting cloud data…");
    probe().catch(function(firstErr){
      if(!(firebase.auth&&typeof firebase.auth==="function"))throw firstErr;
      var auth=firebase.auth();
      if(auth.currentUser)return Promise.reject(firstErr);
      return auth.signInAnonymously().then(function(){return probe()});
    }).then(function(){
      connected=true;
      patchLocalStorage();
      setBadge(true,"Live Cloud DB Active","Connected to Firebase cloud data.");
      return hydrate();
    }).then(function(){
      attachListeners();
      schedulePush();
    }).catch(function(err){
      connected=false;
      var code=String((err&&err.code)||"");
      var msg=String((err&&err.message)||err||"");
      setBadge(false,"Cloud unavailable · Local demo mode",(code?code+": ":"")+msg);
      console.warn("Firebase cloud recovery failed",err);
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",connect,{once:true});
  else connect();
})();