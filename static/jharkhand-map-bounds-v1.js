/* JanSamadhan Jharkhand map boundary patch v1
   Loaded before the GIS module so every Leaflet map is constrained to the
   Jharkhand operating area instead of allowing an India/world-wide demo view.
*/
(function(){
  "use strict";

  var BOUNDS=[[21.85,83.20],[25.45,88.10]];

  function patchLeaflet(){
    if(!(window.L&&typeof window.L.map==="function")||window.L.map.__jsjhBounded)return false;
    var original=window.L.map;
    function boundedMap(element,options){
      options=options||{};
      if(!options.maxBounds)options.maxBounds=BOUNDS;
      if(options.maxBoundsViscosity==null)options.maxBoundsViscosity=1.0;
      if(options.minZoom==null)options.minZoom=7;
      var map=original.call(window.L,element,options);
      try{map.setMaxBounds(BOUNDS)}catch(e){}
      return map;
    }
    Object.keys(original).forEach(function(k){try{boundedMap[k]=original[k]}catch(e){}});
    boundedMap.__jsjhBounded=true;
    boundedMap.__original=original;
    window.L.map=boundedMap;
    return true;
  }

  /* Leaflet is injected by gis-map-v1.js. Capture its load event before the
     GIS onload handler creates the report/admin maps. */
  document.addEventListener("load",function(e){
    if(e&&e.target&&e.target.id==="jsgeo-leaflet-js")patchLeaflet();
  },true);

  patchLeaflet();

  window.JanSamadhanJharkhandMapBounds={bounds:BOUNDS,version:"1.0"};
})();

/* Cross-device report recovery + cloud sync v1.
   The core prototype already has a Firestore listener, but a citizen can submit
   during the short period before Firebase finishes connecting. In that case the
   old syncProblem() path leaves the report only in localStorage, so an admin on
   another device cannot see it. This bridge captures citizen-created JS-JH IDs,
   retries them against Firestore, and keeps retrying after temporary outages. */
(function(){
  "use strict";

  var DATA_KEY="jansamadhan_data_v3";
  var pending={};
  var busy=false;
  var timer=null;
  var lastError="";

  function problemTime(p){
    var value=p&&(p.updatedAt||p.createdAt);
    var n=Date.parse(value||"");
    return isFinite(n)?n:0;
  }

  function localData(){
    try{
      var d=JSON.parse(localStorage.getItem(DATA_KEY)||"null");
      return d&&Array.isArray(d.problems)?d:null;
    }catch(e){return null}
  }

  function captureLocalCitizenReports(){
    var d=localData();
    if(!d)return;
    d.problems.forEach(function(p){
      if(!p||!/^JS-JH-/i.test(String(p.id||"")))return;
      var old=pending[p.id];
      if(!old||problemTime(p)>=problemTime(old))pending[p.id]=p;
    });
  }

  function setCloudWarning(text){
    [document.getElementById("cloudStatus"),document.getElementById("cloudStatusDash")].forEach(function(el){
      if(!el)return;
      el.className="cloud-badge offline";
      el.innerHTML='<span class="dot"></span><span>'+String(text||"Cloud sync retrying")+'</span>';
    });
  }

  function ensureFirebaseReady(){
    if(!(window.firebase&&firebase.firestore&&firebase.auth))return Promise.reject(new Error("Firebase SDK unavailable"));
    if(!firebase.apps||!firebase.apps.length)return Promise.reject(new Error("Firebase app not initialized yet"));
    if(firebase.auth().currentUser)return Promise.resolve();
    return firebase.auth().signInAnonymously().then(function(){return undefined});
  }

  function flushPending(){
    captureLocalCitizenReports();
    if(busy||!Object.keys(pending).length)return;
    busy=true;
    ensureFirebaseReady().then(function(){
      var db=firebase.firestore();
      var ids=Object.keys(pending);
      return Promise.all(ids.map(function(id){
        var local=pending[id];
        var ref=db.collection("problems").doc(id);
        return ref.get().then(function(snap){
          if(snap.exists){
            var remote=snap.data()||{};
            if(problemTime(remote)>problemTime(local)){
              delete pending[id];
              return;
            }
          }
          return ref.set(local,{merge:true}).then(function(){delete pending[id]});
        });
      }));
    }).then(function(){
      lastError="";
      window.JanSamadhanCrossDeviceSync=window.JanSamadhanCrossDeviceSync||{};
      window.JanSamadhanCrossDeviceSync.lastSuccessAt=new Date().toISOString();
      window.JanSamadhanCrossDeviceSync.pendingCount=Object.keys(pending).length;
    }).catch(function(err){
      lastError=String(err&&err.message||err||"Cloud sync failed");
      window.JanSamadhanCrossDeviceSync=window.JanSamadhanCrossDeviceSync||{};
      window.JanSamadhanCrossDeviceSync.lastError=lastError;
      window.JanSamadhanCrossDeviceSync.pendingCount=Object.keys(pending).length;
      if(Object.keys(pending).length)setCloudWarning("Cloud write retrying · local copy safe");
      if(window.console&&console.warn)console.warn("Cross-device report sync retry",err);
    }).then(function(){busy=false});
  }

  function schedule(){
    clearInterval(timer);
    timer=setInterval(flushPending,2000);
    flushPending();
  }

  window.addEventListener("online",flushPending);
  document.addEventListener("visibilitychange",function(){if(!document.hidden)flushPending()});
  window.addEventListener("focus",flushPending);

  window.JanSamadhanCrossDeviceSync={
    version:"1.0",
    flush:flushPending,
    pendingCount:0,
    lastError:lastError
  };

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule,{once:true});
  else schedule();
})();
