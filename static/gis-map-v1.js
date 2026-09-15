/* JanSamadhan GIS map v1
   Lightweight, privacy-aware mapping for SIH demo:
   - optional citizen-selected map pin
   - explicit browser geolocation only on user action
   - admin challenge map with exact-vs-approximate labels
   - nearby / recurrence signals for geo-tagged cases
   - local + Firebase persistence without changing the core report flow
*/
(function(){
  "use strict";

  var DATA_KEYS=["jansamadhan_data_v3","jansamadhan_data_v2"];
  var DISTRICT_CENTERS={
    "Ranchi":[23.3441,85.3096],
    "East Singhbhum":[22.8046,86.2029],
    "Dhanbad":[23.7957,86.4304],
    "Bokaro":[23.6693,86.1511],
    "Hazaribagh":[23.9966,85.3691],
    "Ramgarh":[23.6341,85.5211],
    "Giridih":[24.1856,86.2996],
    "Deoghar":[24.4852,86.6948],
    "Dumka":[24.2681,87.2486],
    "Palamu":[24.0398,84.0907],
    "West Singhbhum":[22.5524,85.8025],
    "Saraikela Kharsawan":[22.7047,85.9310],
    "Patna":[25.5941,85.1376],
    "Gaya":[24.7914,85.0002],
    "Nalanda":[25.1982,85.5239],
    "Other / Demo district":[23.6102,85.2799],
    "Other Jharkhand district":[23.6102,85.2799]
  };
  var JHARKHAND_DISTRICTS=["Ranchi","East Singhbhum","Dhanbad","Bokaro","Hazaribagh","Ramgarh","Giridih","Deoghar","Dumka","Palamu","West Singhbhum","Saraikela Kharsawan","Other Jharkhand district"];

  var leafletPromise=null;
  var reportMap=null;
  var reportMarker=null;
  var adminMap=null;
  var adminLayer=null;
  var adminMapElement=null;
  var lastAdminSignature="";
  var pendingGeo=null;
  var scanTimer=null;
  var receiptTimer=null;
  var lastReceiptId="";

  function id(x){return document.getElementById(x)}
  function isHindi(){return document.documentElement.lang==="hi"}
  function esc(x){return String(x==null?"":x).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function validNum(n){return typeof n==="number"&&isFinite(n)}
  function validGeo(g){return !!(g&&validNum(Number(g.lat))&&validNum(Number(g.lng))&&Math.abs(Number(g.lat))<=90&&Math.abs(Number(g.lng))<=180)}
  function round(n,d){var p=Math.pow(10,d||5);return Math.round(Number(n)*p)/p}
  function now(){return new Date().toISOString()}
  function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}

  function getStore(){
    for(var i=0;i<DATA_KEYS.length;i++){
      try{
        var raw=localStorage.getItem(DATA_KEYS[i]);
        if(!raw)continue;
        var data=JSON.parse(raw);
        if(data&&Array.isArray(data.problems))return{key:DATA_KEYS[i],data:data};
      }catch(e){}
    }
    return{key:DATA_KEYS[0],data:{accounts:[],problems:[]}};
  }

  function saveStore(store){
    try{localStorage.setItem(store.key,JSON.stringify(store.data))}catch(e){console.warn("GIS local save failed",e)}
  }

  function repairData(){
    var store=getStore(),changed=false;
    (store.data.problems||[]).forEach(function(p){
      if(typeof p.claimedBy!=="string"){p.claimedBy=p.claimedBy?String(p.claimedBy):"";changed=true}
      if(!Array.isArray(p.geoEvidence)){p.geoEvidence=[];changed=true}
      if(p.geo&&!validGeo(p.geo)){delete p.geo;changed=true}
    });
    if(changed)saveStore(store);
  }

  function loadLeaflet(){
    if(window.L&&window.L.map)return Promise.resolve(window.L);
    if(leafletPromise)return leafletPromise;
    leafletPromise=new Promise(function(resolve,reject){
      if(!id("jsgeo-leaflet-css")){
        var css=document.createElement("link");
        css.id="jsgeo-leaflet-css";
        css.rel="stylesheet";
        css.href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(css);
      }
      var existing=id("jsgeo-leaflet-js");
      if(existing){
        var wait=setInterval(function(){if(window.L&&window.L.map){clearInterval(wait);resolve(window.L)}},50);
        setTimeout(function(){clearInterval(wait);if(!(window.L&&window.L.map))reject(new Error("Leaflet timeout"))},6000);
        return;
      }
      var js=document.createElement("script");
      js.id="jsgeo-leaflet-js";
      js.src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";
      js.async=true;
      js.onload=function(){window.L&&window.L.map?resolve(window.L):reject(new Error("Leaflet unavailable"))};
      js.onerror=function(){reject(new Error("Map library failed to load"))};
      document.head.appendChild(js);
    });
    return leafletPromise;
  }

  function ensureStyles(){
    if(id("jsgeo-style"))return;
    var s=document.createElement("style");
    s.id="jsgeo-style";
    s.textContent=".jsgeo-field{grid-column:1/-1}.jsgeo-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.jsgeo-map{height:250px;border:1px solid var(--line,#cbd9d0);border-radius:8px;overflow:hidden;background:#edf3ef}.jsgeo-status{font-size:.71rem;color:var(--muted,#5c6d64);margin-top:7px}.jsgeo-status strong{color:var(--forest,#075b3a)}.jsgeo-intel{margin-top:8px;padding:9px 10px;border:1px solid #cbd9d0;border-left:4px solid #18875a;border-radius:7px;background:#f8fbf9;font-size:.72rem;line-height:1.45}.jsgeo-admin{margin:0 0 16px;background:#fff;border:1px solid var(--line,#cbd9d0);border-radius:10px;overflow:hidden;box-shadow:var(--shadow,0 8px 28px rgba(2,53,34,.09))}.jsgeo-admin-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:14px 16px;background:#f5f9f6;border-bottom:1px solid var(--line,#cbd9d0)}.jsgeo-admin-head h2{margin:0;color:var(--forest-deep,#023522);font-size:1.05rem}.jsgeo-admin-head p{margin:3px 0 0;color:var(--muted,#5c6d64);font-size:.72rem}.jsgeo-metrics{display:flex;gap:6px;flex-wrap:wrap}.jsgeo-metric{padding:5px 7px;border:1px solid #d6e2db;border-radius:6px;background:#fff;font-size:.66rem;font-weight:800;color:#405248}.jsgeo-admin-map{height:330px}.jsgeo-fallback{padding:16px;color:#5c6d64;font-size:.78rem}.jsgeo-legend{padding:8px 14px;border-top:1px solid var(--line,#cbd9d0);font-size:.69rem;color:var(--muted,#5c6d64)}.jsgeo-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 4px 0 10px}.jsgeo-dot:first-child{margin-left:0}.jsgeo-dot.exact{background:#075b3a}.jsgeo-dot.approx{background:#c58b25}.jsgeo-dot.solved{background:#5c6d64}body.high-contrast .jsgeo-admin,body.high-contrast .jsgeo-intel{background:#000!important;color:#fff!important;border-color:#fff!important}body.high-contrast .jsgeo-admin *{color:#fff!important}@media(max-width:650px){.jsgeo-map{height:220px}.jsgeo-admin-map{height:280px}}";
    document.head.appendChild(s);
  }

  function districtCenter(name){return DISTRICT_CENTERS[name]||DISTRICT_CENTERS["Other Jharkhand district"]}

  function syncDistrictChoices(){
    var select=id("rDistrict");
    if(!select||select.dataset.jsgeoDistricts)return;
    var current=select.value;
    var options=['<option value="">Select district</option>'];
    JHARKHAND_DISTRICTS.forEach(function(d){options.push('<option>'+esc(d)+'</option>')});
    if(current&&JHARKHAND_DISTRICTS.indexOf(current)<0)options.push('<option>'+esc(current)+'</option>');
    select.innerHTML=options.join("");
    if(current)select.value=current;
    select.dataset.jsgeoDistricts="1";
  }

  function setReportStatus(text,strong){
    var el=id("jsgeo-status");
    if(!el)return;
    el.innerHTML=strong?'<strong>'+esc(strong)+'</strong> '+esc(text):esc(text);
  }

  function geoDistanceKm(a,b){
    if(!validGeo(a)||!validGeo(b))return Infinity;
    var R=6371,lat1=Number(a.lat)*Math.PI/180,lat2=Number(b.lat)*Math.PI/180,dLat=(Number(b.lat)-Number(a.lat))*Math.PI/180,dLon=(Number(b.lng)-Number(a.lng))*Math.PI/180;
    var x=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
  }

  function categoryValue(){var el=id("rCategory");return el?String(el.value||""):""}

  function updateGeoIntel(){
    var el=id("jsgeo-intel");
    if(!el)return;
    if(!validGeo(pendingGeo)){
      setText(el,isHindi()?"मानचित्र पिन चुनने पर नज़दीकी सक्रिय और पहले से हल मामलों का स्थान-आधारित संकेत यहाँ दिखेगा।":"Choose a map pin to see location-based signals from nearby active and previously solved challenges.");
      return;
    }
    var data=getStore().data,nearActive=[],nearSolved=[],cat=categoryValue();
    (data.problems||[]).forEach(function(p){
      if(!validGeo(p.geo))return;
      var km=geoDistanceKm(pendingGeo,p.geo);
      if(km>2)return;
      if(p.status==="solved"||p.stage==="completed"){
        if(!cat||cat==="Let AI decide"||p.category===cat)nearSolved.push({p:p,km:km});
      }else nearActive.push({p:p,km:km});
    });
    var bits=[];
    bits.push((isHindi()?"2 किमी के भीतर सक्रिय मामले: ":"Active cases within 2 km: ")+nearActive.length);
    bits.push((isHindi()?"समीक्षा के लिए नज़दीकी हल मामले: ":"Nearby solved cases to review: ")+nearSolved.length);
    if(nearActive.length)bits.push((isHindi()?"नज़दीकी सक्रिय: ":"Nearest active: ")+nearActive.sort(function(a,b){return a.km-b.km})[0].p.id);
    if(nearSolved.length)bits.push((isHindi()?"पहले हल मामला: ":"Nearby solved case: ")+nearSolved.sort(function(a,b){return a.km-b.km})[0].p.id);
    setText(el,bits.join(" · "));
  }

  function setPendingGeo(lat,lng,source,accuracy){
    pendingGeo={lat:round(lat,6),lng:round(lng,6),source:source||"map-click",accuracy:validNum(accuracy)?Math.round(accuracy):null,selectedAt:now()};
    if(reportMap&&window.L){
      if(reportMarker)reportMarker.setLatLng([pendingGeo.lat,pendingGeo.lng]);
      else reportMarker=window.L.marker([pendingGeo.lat,pendingGeo.lng]).addTo(reportMap);
      reportMap.panTo([pendingGeo.lat,pendingGeo.lng]);
    }
    setReportStatus(isHindi()?"स्थान पिन चुना गया। यह डुप्लिकेट/पुनरावृत्ति संकेत बेहतर करता है।":"Location pin selected. It strengthens duplicate/recurrence signals.",pendingGeo.lat+", "+pendingGeo.lng);
    updateGeoIntel();
  }

  function clearPendingGeo(){
    pendingGeo=null;
    try{sessionStorage.removeItem("jansamadhan_pending_geo_v1")}catch(e){}
    if(reportMarker&&reportMap){reportMap.removeLayer(reportMarker);reportMarker=null}
    setReportStatus(isHindi()?"मानचित्र पिन वैकल्पिक है; स्थानीयता/लैंडमार्क अभी भी आवश्यक है।":"Map pin is optional; locality/landmark text is still required.");
    updateGeoIntel();
  }

  function initReportMap(){
    var box=id("jsgeo-report-map");
    if(!box||reportMap)return;
    loadLeaflet().then(function(L){
      if(reportMap||!id("jsgeo-report-map"))return;
      var center=districtCenter(id("rDistrict")&&id("rDistrict").value);
      reportMap=L.map("jsgeo-report-map",{zoomControl:true}).setView(center,11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(reportMap);
      reportMap.on("click",function(e){setPendingGeo(e.latlng.lat,e.latlng.lng,"map-click",null)});
      setTimeout(function(){try{reportMap.invalidateSize()}catch(e){}},80);
    }).catch(function(){
      if(box)box.innerHTML='<div class="jsgeo-fallback">'+(isHindi()?"मानचित्र सेवा लोड नहीं हुई। आप स्थानीयता लिखकर रिपोर्ट जारी रख सकते हैं।":"Map service could not load. You can still submit using the locality field.")+'</div>';
    });
  }

  function ensureReportMap(){
    var form=id("reportForm"),loc=id("rLocation");
    if(!form||!loc||id("jsgeo-wrap"))return;
    syncDistrictChoices();
    var field=document.createElement("div");
    field.id="jsgeo-wrap";
    field.className="field wide jsgeo-field";
    field.innerHTML='<label>'+(isHindi()?"मानचित्र स्थान (वैकल्पिक, अनुशंसित)":"Map location (optional, recommended)")+'</label><div class="jsgeo-toolbar"><button class="btn small secondary" type="button" id="jsgeo-use-location">'+(isHindi()?"मेरी लोकेशन इस्तेमाल करें":"Use my location")+'</button><button class="btn small secondary" type="button" id="jsgeo-clear">'+(isHindi()?"पिन हटाएँ":"Clear pin")+'</button></div><div class="jsgeo-map" id="jsgeo-report-map" aria-label="Challenge location map"></div><div class="jsgeo-status" id="jsgeo-status"></div><div class="jsgeo-intel" id="jsgeo-intel"></div>';
    var locationField=loc.closest(".field");
    if(locationField&&locationField.parentNode)locationField.parentNode.insertBefore(field,locationField.nextSibling);
    else form.insertBefore(field,form.querySelector(".privacy"));

    id("jsgeo-use-location").addEventListener("click",function(){
      if(!navigator.geolocation){setReportStatus(isHindi()?"यह ब्राउज़र लोकेशन उपलब्ध नहीं कराता।":"This browser does not provide geolocation.");return}
      setReportStatus(isHindi()?"ब्राउज़र अनुमति की प्रतीक्षा...":"Waiting for browser permission...");
      navigator.geolocation.getCurrentPosition(function(pos){
        setPendingGeo(pos.coords.latitude,pos.coords.longitude,"browser-geolocation",pos.coords.accuracy);
        if(reportMap)reportMap.setView([pos.coords.latitude,pos.coords.longitude],15);
      },function(){setReportStatus(isHindi()?"लोकेशन अनुमति नहीं मिली। आप मानचित्र पर पिन चुन सकते हैं।":"Location permission was not granted. You can click the map instead.")},{enableHighAccuracy:false,timeout:7000,maximumAge:120000});
    });
    id("jsgeo-clear").addEventListener("click",clearPendingGeo);
    id("rDistrict").addEventListener("change",function(){
      if(reportMap&&!pendingGeo)reportMap.setView(districtCenter(this.value),11);
      updateGeoIntel();
    });
    id("rCategory").addEventListener("change",updateGeoIntel);
    form.addEventListener("submit",function(){
      if(validGeo(pendingGeo)){
        try{sessionStorage.setItem("jansamadhan_pending_geo_v1",JSON.stringify(pendingGeo))}catch(e){}
      }else try{sessionStorage.removeItem("jansamadhan_pending_geo_v1")}catch(e){}
    },true);
    setReportStatus(isHindi()?"मानचित्र पिन वैकल्पिक है; स्थानीयता/लैंडमार्क अभी भी आवश्यक है।":"Map pin is optional; locality/landmark text is still required.");
    updateGeoIntel();
    initReportMap();
  }

  function samePoint(a,b){return validGeo(a)&&validGeo(b)&&geoDistanceKm(a,b)<0.01}

  function persistGeo(challengeId){
    if(!challengeId)return;
    var geo=pendingGeo;
    if(!validGeo(geo)){
      try{geo=JSON.parse(sessionStorage.getItem("jansamadhan_pending_geo_v1")||"null")}catch(e){geo=null}
    }
    if(!validGeo(geo))return;
    var store=getStore(),p=(store.data.problems||[]).find(function(x){return x.id===challengeId});
    if(!p)return;
    var clean={lat:Number(geo.lat),lng:Number(geo.lng),source:geo.source||"map-click",accuracy:geo.accuracy==null?null:Number(geo.accuracy),selectedAt:geo.selectedAt||now()};
    if(!validGeo(p.geo))p.geo=clean;
    p.geoEvidence=Array.isArray(p.geoEvidence)?p.geoEvidence:[];
    if(!p.geoEvidence.some(function(x){return samePoint(x,clean)}))p.geoEvidence.push(clean);
    if(p.geoEvidence.length>20)p.geoEvidence=p.geoEvidence.slice(-20);
    p.geoUpdatedAt=now();
    saveStore(store);

    try{
      if(window.firebase&&firebase.apps&&firebase.apps.length&&firebase.firestore){
        firebase.firestore().collection("problems").doc(challengeId).set({geo:p.geo,geoEvidence:p.geoEvidence,geoUpdatedAt:p.geoUpdatedAt},{merge:true}).catch(function(e){console.warn("GIS cloud sync failed",e)});
      }
    }catch(e){console.warn("GIS cloud sync unavailable",e)}

    var receipt=id("receiptBody");
    if(receipt&&!id("jsgeo-receipt-note")){
      var note=document.createElement("div");
      note.id="jsgeo-receipt-note";
      note.className="notice";
      note.style.marginTop="10px";
      note.textContent=isHindi()?"स्थान पिन सुरक्षित किया गया। सार्वजनिक ट्रैकर सटीक निर्देशांक नहीं दिखाता।":"Map pin saved. The public tracker does not expose exact coordinates.";
      receipt.appendChild(note);
    }
    clearPendingGeo();
  }

  function watchReceipt(){
    var body=id("receiptBody");
    if(!body||body.dataset.jsgeoWatch)return;
    body.dataset.jsgeoWatch="1";
    new MutationObserver(function(){
      clearTimeout(receiptTimer);
      receiptTimer=setTimeout(function(){
        var rid=body.querySelector(".receipt-id");
        var challengeId=rid?String(rid.textContent||"").trim():"";
        if(challengeId&&challengeId!==lastReceiptId){lastReceiptId=challengeId;persistGeo(challengeId)}
      },80);
    }).observe(body,{childList:true,subtree:true});
  }

  function hashOffset(text){
    var h=0,s=String(text||"");
    for(var i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;
    return h;
  }

  function problemPoint(p,index){
    if(validGeo(p.geo))return{lat:Number(p.geo.lat),lng:Number(p.geo.lng),exact:true};
    var base=districtCenter(p.district),h=hashOffset(p.id||index),dx=((h%17)-8)*0.0045,dy=(((h>>4)%17)-8)*0.0045;
    return{lat:base[0]+dx,lng:base[1]+dy,exact:false};
  }

  function recurrenceCandidates(problems){
    var solved=problems.filter(function(p){return (p.status==="solved"||p.stage==="completed")&&validGeo(p.geo)}),active=problems.filter(function(p){return !(p.status==="solved"||p.stage==="completed")&&validGeo(p.geo)}),seen={};
    active.forEach(function(a){
      solved.forEach(function(s){
        if(a.category!==s.category)return;
        if(geoDistanceKm(a.geo,s.geo)<=2)seen[a.id+"|"+s.id]=true;
      });
    });
    return Object.keys(seen).length;
  }

  function popupHtml(p,point){
    var status=(p.status==="solved"||p.stage==="completed")?"Completed":(p.stage||p.status||"Active");
    return '<div style="min-width:190px"><strong>'+esc(p.id||"Challenge")+' · '+esc(p.title||"Untitled")+'</strong><br><span>'+esc(p.category||"Other")+' · '+esc(status)+'</span><br><span>'+esc(p.location||"")+(p.district?", "+esc(p.district):"")+'</span><br><small>'+(point.exact?(isHindi()?"नागरिक द्वारा चुना गया सटीक रिपोर्ट पिन":"Citizen-selected report pin"):(isHindi()?"पुराने डेमो रिकॉर्ड के लिए अनुमानित जिला-स्तरीय पिन":"Approximate district-level pin for legacy demo record"))+'</small></div>';
  }

  function renderAdminMap(){
    var role=id("sessionRole"),content=id("content");
    if(!role||String(role.textContent||"").trim().toLowerCase()!=="admin"||!content)return;
    var panel=id("jsgeo-admin-panel");
    if(!panel){
      panel=document.createElement("section");
      panel.id="jsgeo-admin-panel";
      panel.className="jsgeo-admin";
      panel.innerHTML='<div class="jsgeo-admin-head"><div><h2>'+(isHindi()?"GIS चुनौती मानचित्र":"GIS Challenge Map")+'</h2><p>'+(isHindi()?"सटीक नागरिक पिन और पुराने डेमो रिकॉर्ड के अनुमानित स्थान अलग दिखाए जाते हैं।":"Exact citizen pins and approximate legacy demo positions are labelled separately.")+'</p></div><div class="jsgeo-metrics" id="jsgeo-metrics"></div></div><div class="jsgeo-admin-map" id="jsgeo-admin-map"></div><div class="jsgeo-legend"><span class="jsgeo-dot exact"></span>'+(isHindi()?"सटीक पिन":"Exact pin")+' <span class="jsgeo-dot approx"></span>'+(isHindi()?"अनुमानित":"Approximate")+' <span class="jsgeo-dot solved"></span>'+(isHindi()?"पूर्ण":"Completed")+'</div>';
      var firstPanel=content.querySelector(".panel");
      if(firstPanel)content.insertBefore(panel,firstPanel);else content.appendChild(panel);
    }
    var data=getStore().data,problems=Array.isArray(data.problems)?data.problems:[],exact=problems.filter(function(p){return validGeo(p.geo)}).length,recurrence=recurrenceCandidates(problems),metrics=id("jsgeo-metrics");
    var metricHtml='<span class="jsgeo-metric">'+(isHindi()?"कुल पिन ":"Plotted ")+problems.length+'</span><span class="jsgeo-metric">'+(isHindi()?"सटीक ":"Exact ")+exact+'</span><span class="jsgeo-metric">'+(isHindi()?"पुनरावृत्ति संकेत ":"Recurrence signals ")+recurrence+'</span>';
    if(metrics&&metrics.innerHTML!==metricHtml)metrics.innerHTML=metricHtml;
    var mapEl=id("jsgeo-admin-map");if(!mapEl)return;
    var signature=(isHindi()?"hi":"en")+"|"+problems.map(function(p){return[p.id,p.status,p.stage,p.category,p.district,p.location,p.geo&&p.geo.lat,p.geo&&p.geo.lng].join("~")}).join("|");
    if(adminMapElement&&adminMapElement!==mapEl){try{adminMap.remove()}catch(e){}adminMap=null;adminLayer=null;adminMapElement=null;lastAdminSignature=""}
    if(signature===lastAdminSignature&&adminMap&&adminMapElement===mapEl)return;

    loadLeaflet().then(function(L){
      var currentEl=id("jsgeo-admin-map");if(!currentEl)return;
      if(adminMapElement&&adminMapElement!==currentEl){try{adminMap.remove()}catch(e){}adminMap=null;adminLayer=null;adminMapElement=null}
      if(!adminMap){
        adminMap=L.map(currentEl,{zoomControl:true}).setView(DISTRICT_CENTERS.Ranchi,7);
        adminMapElement=currentEl;
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(adminMap);
        adminLayer=L.layerGroup().addTo(adminMap);
      }
      adminLayer.clearLayers();
      var bounds=[];
      problems.forEach(function(p,i){
        var point=problemPoint(p,i),completed=(p.status==="solved"||p.stage==="completed");
        var opts={radius:point.exact?8:6,weight:2,fillOpacity:completed?.45:(point.exact?.78:.58)};
        if(completed){opts.color="#5c6d64";opts.fillColor="#5c6d64"}
        else if(point.exact){opts.color="#075b3a";opts.fillColor="#18875a"}
        else{opts.color="#a96100";opts.fillColor="#c58b25"}
        L.circleMarker([point.lat,point.lng],opts).bindPopup(popupHtml(p,point)).addTo(adminLayer);
        bounds.push([point.lat,point.lng]);
      });
      if(bounds.length){try{adminMap.fitBounds(bounds,{padding:[24,24],maxZoom:13})}catch(e){}}
      lastAdminSignature=signature;
      setTimeout(function(){try{adminMap.invalidateSize()}catch(e){}},70);
    }).catch(function(){
      var currentEl=id("jsgeo-admin-map");
      if(currentEl&&!currentEl.querySelector(".jsgeo-fallback"))currentEl.innerHTML='<div class="jsgeo-fallback">'+(isHindi()?"मानचित्र टाइल लोड नहीं हुई। डैशबोर्ड की बाकी कार्यक्षमता प्रभावित नहीं है।":"Map tiles did not load. The rest of the dashboard remains functional.")+'</div>';
    });
  }

  function patchStaticTruth(){
    document.querySelectorAll(".architecture article").forEach(function(article){
      var text=String(article.textContent||"");
      if(text.indexOf("Explainable rule-based demo for category, urgency and duplication")>=0){
        var p=article.querySelector("p");
        if(p)p.textContent=isHindi()?"Groq उपलब्ध होने पर LLM-सहायता, साथ में श्रेणी, सुरक्षा, रूटिंग निरंतरता और डुप्लिकेट संकेतों के लिए deterministic fallback।":"LLM-assisted when Groq is configured, with deterministic fallback for category, safety, routing continuity and duplicate signals.";
      }
    });
  }

  function updateLanguageLabels(){
    var wrap=id("jsgeo-wrap");
    if(wrap){
      var label=wrap.querySelector("label");setText(label,isHindi()?"मानचित्र स्थान (वैकल्पिक, अनुशंसित)":"Map location (optional, recommended)");
      setText(id("jsgeo-use-location"),isHindi()?"मेरी लोकेशन इस्तेमाल करें":"Use my location");
      setText(id("jsgeo-clear"),isHindi()?"पिन हटाएँ":"Clear pin");
      var district=id("rDistrict");if(district&&district.options&&district.options.length)setText(district.options[0],isHindi()?"जिला चुनें":"Select district");
      updateGeoIntel();
    }
    var panel=id("jsgeo-admin-panel");
    if(panel){
      var h=panel.querySelector("h2"),p=panel.querySelector(".jsgeo-admin-head p");
      setText(h,isHindi()?"GIS चुनौती मानचित्र":"GIS Challenge Map");
      setText(p,isHindi()?"सटीक नागरिक पिन और पुराने डेमो रिकॉर्ड के अनुमानित स्थान अलग दिखाए जाते हैं।":"Exact citizen pins and approximate legacy demo positions are labelled separately.");
    }
  }

  function scan(){
    ensureStyles();
    repairData();
    syncDistrictChoices();
    ensureReportMap();
    watchReceipt();
    patchStaticTruth();
    renderAdminMap();
    updateLanguageLabels();
  }

  function init(){
    scan();
    new MutationObserver(function(mutations){var relevant=mutations.some(function(m){var t=m.target&&m.target.nodeType===1?m.target:m.target&&m.target.parentElement;return !(t&&t.closest&&t.closest(".leaflet-container"))});if(!relevant)return;clearTimeout(scanTimer);scanTimer=setTimeout(scan,110)}).observe(document.body,{childList:true,subtree:true});
    new MutationObserver(function(){setTimeout(function(){updateLanguageLabels();patchStaticTruth();renderAdminMap()},0)}).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
    window.JanSamadhanGIS={
      getPendingGeo:function(){return validGeo(pendingGeo)?Object.assign({},pendingGeo):null},
      distanceKm:geoDistanceKm,
      version:"1.0"
    };
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
