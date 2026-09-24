/* JanSamadhan Jharkhand jurisdiction guard v1
   Prevents out-of-state complaint locations from entering a Jharkhand-only SIH workflow.
   This is a client-side prototype guard; production still needs authoritative server-side geocoding/boundary validation.
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
  var DISTRICTS=Object.keys(DISTRICT_CENTERS).sort();
  var JH_BOUNDS={south:21.85,west:83.20,north:25.45,east:88.10};
  var DISTRICT_RADIUS_KM=120;
  var DATA_KEYS=["jansamadhan_data_v3","jansamadhan_data_v2"];
  var scanTimer=null,cloudTimer=null;

  function id(x){return document.getElementById(x)}
  function isHindi(){return document.documentElement.lang==="hi"}
  function num(x){x=Number(x);return isFinite(x)?x:null}
  function esc(x){return String(x==null?"":x).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}

  function distanceKm(a,b){
    var lat1=num(a&&a.lat),lng1=num(a&&a.lng),lat2=num(b&&b[0]),lng2=num(b&&b[1]);
    if(lat1==null||lng1==null||lat2==null||lng2==null)return Infinity;
    var R=6371,dLat=(lat2-lat1)*Math.PI/180,dLon=(lng2-lng1)*Math.PI/180,p1=lat1*Math.PI/180,p2=lat2*Math.PI/180;
    var x=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(p1)*Math.cos(p2)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
  }

  function inJharkhandBounds(geo){
    var lat=num(geo&&geo.lat),lng=num(geo&&geo.lng);
    return lat!=null&&lng!=null&&lat>=JH_BOUNDS.south&&lat<=JH_BOUNDS.north&&lng>=JH_BOUNDS.west&&lng<=JH_BOUNDS.east;
  }

  function geoResult(geo,district){
    if(!geo||num(geo.lat)==null||num(geo.lng)==null)return{ok:false,reason:"missing"};
    if(!inJharkhandBounds(geo))return{ok:false,reason:"outside-state"};
    if(DISTRICTS.indexOf(district)<0)return{ok:false,reason:"district"};
    var km=distanceKm(geo,DISTRICT_CENTERS[district]);
    if(km>DISTRICT_RADIUS_KM)return{ok:false,reason:"district-mismatch",km:km};
    return{ok:true,km:km};
  }

  function pendingGeo(){
    try{if(window.JanSamadhanGIS&&typeof window.JanSamadhanGIS.getPendingGeo==="function")return window.JanSamadhanGIS.getPendingGeo()}catch(e){}
    try{return JSON.parse(sessionStorage.getItem("jansamadhan_pending_geo_v1")||"null")}catch(e){return null}
  }

  function clearPin(){
    var btn=id("jsgeo-clear");
    if(btn){try{btn.click();return}catch(e){}}
    try{sessionStorage.removeItem("jansamadhan_pending_geo_v1")}catch(e){}
  }

  function errorText(reason){
    if(isHindi()){
      if(reason==="missing")return"रिपोर्ट जमा करने से पहले झारखंड के अंदर मानचित्र स्थान चुनना आवश्यक है।";
      if(reason==="district")return"कृपया झारखंड का वैध जिला चुनें।";
      if(reason==="district-mismatch")return"चुना गया मानचित्र स्थान चयनित झारखंड जिले से मेल नहीं खाता। जिला या पिन ठीक करें।";
      return"यह स्थान झारखंड के बाहर है। इस समस्या-विवरण के लिए केवल झारखंड के स्थान स्वीकार किए जाते हैं।";
    }
    if(reason==="missing")return"Choose a map pin inside Jharkhand before submitting this report.";
    if(reason==="district")return"Select a valid Jharkhand district.";
    if(reason==="district-mismatch")return"The map pin does not match the selected Jharkhand district. Correct the district or choose the correct pin.";
    return"This location is outside Jharkhand. This problem statement accepts Jharkhand locations only.";
  }

  function setError(text){
    var e=id("reportError");if(e){setText(e,text);e.setAttribute("role","alert")}
    var s=id("jsjh-guard-status");if(s){setText(s,text);s.className="jsjh-guard-status bad"}
  }
  function setGood(text){var s=id("jsjh-guard-status");if(s){setText(s,text);s.className="jsjh-guard-status good"}}

  function syncDistricts(){
    var select=id("rDistrict");if(!select)return;
    var current=String(select.value||""),html='<option value="">'+(isHindi()?"झारखंड जिला चुनें":"Select Jharkhand district")+'</option>';
    DISTRICTS.forEach(function(d){html+='<option value="'+esc(d)+'">'+esc(d)+'</option>'});
    if(select.dataset.jsjhDistricts!=="1"||select.options.length!==DISTRICTS.length+1){
      select.innerHTML=html;
      select.value=DISTRICTS.indexOf(current)>=0?current:"";
      select.dataset.jsjhDistricts="1";
    }
    setText(document.querySelector('label[for="rDistrict"]'),isHindi()?"जिला (केवल झारखंड)":"District (Jharkhand only)");
  }

  function ensureGuardUI(){
    var wrap=id("jsgeo-wrap");if(!wrap)return;
    var status=id("jsgeo-status");
    if(status&&!pendingGeo())setText(status,isHindi()?"रिपोर्ट जमा करने से पहले झारखंड के अंदर स्थान पिन चुनें।":"Choose a pin inside Jharkhand before submitting the report.");
    if(!id("jsjh-jurisdiction-note")){
      var note=document.createElement("div");
      note.id="jsjh-jurisdiction-note";note.className="jsjh-note";
      note.innerHTML='<strong>'+(isHindi()?"क्षेत्र सीमा: झारखंड · पिन आवश्यक":"Jurisdiction: Jharkhand · map pin required")+'</strong> '+(isHindi()?"बाहर के पिन या गलत जिला-पिन संयोजन जमा नहीं किए जा सकते।":"Out-of-state pins and district/pin mismatches cannot be submitted.");
      var map=id("jsgeo-report-map");if(map&&map.parentNode)map.parentNode.insertBefore(note,map);
    }
    if(!id("jsjh-guard-status")){
      var guard=document.createElement("div");guard.id="jsjh-guard-status";guard.className="jsjh-guard-status";
      var intel=id("jsgeo-intel");if(intel&&intel.parentNode)intel.parentNode.insertBefore(guard,intel.nextSibling);else wrap.appendChild(guard);
    }
  }

  function ensureStyles(){
    if(id("jsjh-style"))return;
    var s=document.createElement("style");s.id="jsjh-style";
    s.textContent=".jsjh-note{margin:6px 0 8px;padding:8px 10px;border:1px solid #b9d8c6;border-left:4px solid #075b3a;border-radius:7px;background:#f1f8f4;font-size:.72rem;color:#315342}.jsjh-guard-status{min-height:18px;margin-top:7px;font-size:.73rem;font-weight:750}.jsjh-guard-status.bad{color:#b4232f}.jsjh-guard-status.good{color:#075b3a}.jsjh-invalid-map{outline:3px solid #e6a3aa;outline-offset:2px}";
    document.head.appendChild(s);
  }

  function validateCurrentPin(options){
    options=options||{};
    var district=id("rDistrict")?String(id("rDistrict").value||""):"",result=geoResult(pendingGeo(),district),map=id("jsgeo-report-map");
    if(result.ok){if(map)map.classList.remove("jsjh-invalid-map");setGood(isHindi()?"झारखंड स्थान सत्यापित · जिला: "+district:"Jharkhand location verified · district: "+district);return true}
    if(map)map.classList.add("jsjh-invalid-map");
    if(options.clearInvalid&&result.reason!=="missing")clearPin();
    if(options.showError)setError(errorText(result.reason));
    return false;
  }

  function bindFormGuard(){
    var form=id("reportForm");if(!form||form.dataset.jsjhGuard==="1")return;
    form.dataset.jsjhGuard="1";
    form.addEventListener("submit",function(e){
      syncDistricts();
      if(!validateCurrentPin({showError:true,clearInvalid:false})){
        e.preventDefault();e.stopImmediatePropagation();
        var map=id("jsgeo-report-map");if(map&&map.scrollIntoView)map.scrollIntoView({behavior:"smooth",block:"center"});
      }
    },true);
  }

  function bindLiveValidation(){
    var district=id("rDistrict");
    if(district&&district.dataset.jsjhBound!=="1"){
      district.dataset.jsjhBound="1";
      district.addEventListener("change",function(){setTimeout(function(){validateCurrentPin({showError:!!pendingGeo(),clearInvalid:true})},0)});
    }
    var map=id("jsgeo-report-map");
    if(map&&map.dataset.jsjhBound!=="1"){
      map.dataset.jsjhBound="1";
      map.addEventListener("click",function(){setTimeout(function(){validateCurrentPin({showError:true,clearInvalid:true})},30)},true);
    }
    var use=id("jsgeo-use-location");
    if(use&&use.dataset.jsjhBound!=="1"){
      use.dataset.jsjhBound="1";
      use.addEventListener("click",function(){setTimeout(function(){validateCurrentPin({showError:!!pendingGeo(),clearInvalid:true})},900)},true);
    }
  }

  function getLocalStore(){
    for(var i=0;i<DATA_KEYS.length;i++)try{
      var raw=localStorage.getItem(DATA_KEYS[i]);if(!raw)continue;
      var data=JSON.parse(raw);if(data&&Array.isArray(data.problems))return{key:DATA_KEYS[i],data:data};
    }catch(e){}
    return null;
  }

  function syncCloudDemoFixes(changed){
    clearTimeout(cloudTimer);
    cloudTimer=setTimeout(function(){
      try{
        if(!window.JSCloud)return;
        changed.forEach(function(p){window.JSCloud.set("problems",p.id,{district:p.district,location:p.location,title:p.title,assignedUniversity:p.assignedUniversity,universities:p.universities},true).catch(function(){})});
      }catch(e){}
    },1200);
  }

  function migrateLegacyDemoData(){
    var store=getLocalStore();if(!store)return;
    var fixes={
      "JS-1001":{district:"Ranchi",location:"Kanke Main Road",title:"Large potholes near Kanke main road"},
      "JS-1002":{district:"Ranchi",location:"Bariatu Ward 12 Community Tap"},
      "JS-1003":{district:"Ranchi",location:"Mesra Hostel Approach Road"},
      "JS-1004":{district:"Ranchi",location:"Kanke Market"},
      "JS-1005":{district:"Ranchi",location:"Mesra Bus Stop"},
      "JS-1006":{district:"Ranchi",location:"Kanke School Gate"}
    },changed=[];
    store.data.problems.forEach(function(p){
      var f=fixes[p.id];if(!f||p.district!=="Patna")return;
      p.district=f.district;p.location=f.location;if(f.title)p.title=f.title;
      if(p.assignedUniversity==="Patna University Community Lab")p.assignedUniversity="BIT Mesra Innovation Hub";
      if(p.assignedUniversity==="NIT Patna Technical Outreach")p.assignedUniversity="NIT Jamshedpur Technical Outreach";
      if(Array.isArray(p.universities))p.universities.forEach(function(u){if(u.provider==="Patna University Community Lab")u.provider="BIT Mesra Innovation Hub";if(u.provider==="NIT Patna Technical Outreach")u.provider="NIT Jamshedpur Technical Outreach"});
      changed.push(p);
    });
    if(!changed.length)return;
    try{localStorage.setItem(store.key,JSON.stringify(store.data))}catch(e){}
    syncCloudDemoFixes(changed);
  }

  function syncStageInstitutions(){
    var select=id("stageUniversity");if(!select||select.dataset.jsjhInstitutions==="1")return;
    select.innerHTML='<option value="">Not assigned</option><option>BIT Mesra Innovation Hub</option><option>Ranchi University</option><option>NIT Jamshedpur Technical Outreach</option><option>IIT (ISM) Dhanbad</option>';
    select.dataset.jsjhInstitutions="1";
  }

  function scan(){ensureStyles();syncDistricts();ensureGuardUI();bindFormGuard();bindLiveValidation();syncStageInstitutions();migrateLegacyDemoData()}
  function init(){
    scan();
    new MutationObserver(function(){clearTimeout(scanTimer);scanTimer=setTimeout(scan,90)}).observe(document.body,{childList:true,subtree:true});
    new MutationObserver(function(){setTimeout(scan,0)}).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
    window.JanSamadhanJurisdiction={state:"Jharkhand",districts:DISTRICTS.slice(),validate:function(geo,district){return geoResult(geo,district)},version:"1.1"};
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
