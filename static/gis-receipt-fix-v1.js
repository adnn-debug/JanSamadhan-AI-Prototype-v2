/* JanSamadhan GIS receipt persistence fix v1
   Ensures every geo-tagged submission can add evidence even when a duplicate
   merges into the same existing Challenge ID more than once in one session. */
(function(){
  "use strict";
  var DATA_KEYS=["jansamadhan_data_v3","jansamadhan_data_v2"];
  var timer=null;

  function validGeo(g){return !!(g&&isFinite(Number(g.lat))&&isFinite(Number(g.lng))&&Math.abs(Number(g.lat))<=90&&Math.abs(Number(g.lng))<=180)}
  function distanceKm(a,b){if(!validGeo(a)||!validGeo(b))return Infinity;var R=6371,la1=Number(a.lat)*Math.PI/180,la2=Number(b.lat)*Math.PI/180,dla=(Number(b.lat)-Number(a.lat))*Math.PI/180,dlo=(Number(b.lng)-Number(a.lng))*Math.PI/180,x=Math.sin(dla/2)*Math.sin(dla/2)+Math.cos(la1)*Math.cos(la2)*Math.sin(dlo/2)*Math.sin(dlo/2);return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
  function samePoint(a,b){return validGeo(a)&&validGeo(b)&&distanceKm(a,b)<0.01}
  function store(){for(var i=0;i<DATA_KEYS.length;i++){try{var raw=localStorage.getItem(DATA_KEYS[i]);if(!raw)continue;var d=JSON.parse(raw);if(d&&Array.isArray(d.problems))return{key:DATA_KEYS[i],data:d}}catch(e){}}return null}
  function pending(){try{return JSON.parse(sessionStorage.getItem("jansamadhan_pending_geo_v1")||"null")}catch(e){return null}}

  function persist(id){
    var geo=pending();if(!id||!validGeo(geo))return;
    var s=store();if(!s)return;
    var p=s.data.problems.find(function(x){return x.id===id});if(!p)return;
    var clean={lat:Number(geo.lat),lng:Number(geo.lng),source:geo.source||"map-click",accuracy:geo.accuracy==null?null:Number(geo.accuracy),selectedAt:geo.selectedAt||new Date().toISOString()};
    if(!validGeo(p.geo))p.geo=clean;
    p.geoEvidence=Array.isArray(p.geoEvidence)?p.geoEvidence:[];
    if(!p.geoEvidence.some(function(x){return samePoint(x,clean)}))p.geoEvidence.push(clean);
    if(p.geoEvidence.length>20)p.geoEvidence=p.geoEvidence.slice(-20);
    p.geoUpdatedAt=new Date().toISOString();
    try{localStorage.setItem(s.key,JSON.stringify(s.data))}catch(e){console.warn("GIS receipt local save failed",e)}
    try{if(window.firebase&&firebase.apps&&firebase.apps.length&&firebase.firestore){firebase.firestore().collection("problems").doc(id).set({geo:p.geo,geoEvidence:p.geoEvidence,geoUpdatedAt:p.geoUpdatedAt},{merge:true}).catch(function(e){console.warn("GIS receipt cloud sync failed",e)})}}catch(e){console.warn("GIS receipt cloud sync unavailable",e)}
    try{sessionStorage.removeItem("jansamadhan_pending_geo_v1")}catch(e){}
  }

  function init(){
    var body=document.getElementById("receiptBody");if(!body)return;
    new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(function(){var el=body.querySelector(".receipt-id");if(el)persist(String(el.textContent||"").trim())},40)}).observe(body,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
