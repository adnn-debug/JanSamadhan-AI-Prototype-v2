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
   The core prototype already has PostgreSQL cloud synchronization, but a citizen can submit
   during the short period before the API finishes connecting. In that case the
   local report is queued here, retried against PostgreSQL, and kept pending
   after temporary outages. */
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

  function ensureCloudReady(){
    if(!window.JSCloud)return Promise.reject(new Error("PostgreSQL cloud adapter unavailable"));
    return window.JSCloud.health().then(function(h){
      if(!h||!h.ok)throw new Error("PostgreSQL API unavailable");
      return undefined;
    });
  }

  function flushPending(){
    captureLocalCitizenReports();
    if(busy||!Object.keys(pending).length)return;
    busy=true;
    ensureCloudReady().then(function(){
      var ids=Object.keys(pending);
      return Promise.all(ids.map(async function(id){
        var local=pending[id];
        var remote=await window.JSCloud.get("problems",id);
        if(remote&&problemTime(remote)>problemTime(local)){
          delete pending[id];
          return;
        }
        await window.JSCloud.set("problems",id,local,true);
        delete pending[id];
      }));
    }).then(function(){
      lastError="";
      window.JanSamadhanCrossDeviceSync=window.JanSamadhanCrossDeviceSync||{};
      window.JanSamadhanCrossDeviceSync.lastSuccessAt=new Date().toISOString();
      window.JanSamadhanCrossDeviceSync.pendingCount=Object.keys(pending).length;
    }).catch(function(err){
      lastError=String(err&&err.message||err||"Cloud sync failed");
      setCloudWarning("Cloud sync retrying · local copy safe");
    }).finally(function(){
      busy=false;
      window.JanSamadhanCrossDeviceSync=window.JanSamadhanCrossDeviceSync||{};
      window.JanSamadhanCrossDeviceSync.pendingCount=Object.keys(pending).length;
      window.JanSamadhanCrossDeviceSync.lastError=lastError;
    });
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
