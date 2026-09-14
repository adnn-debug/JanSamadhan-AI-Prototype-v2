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
    wrapGIS();annotateUseLocation();bindSubmit();ensureNotice();
    if(!mapFailed()&&id("jsdemo-map-fallback-note"))id("jsdemo-map-fallback-note").remove();
  }

  function init(){
    scan();
    new MutationObserver(function(){clearTimeout(scanTimer);scanTimer=setTimeout(scan,80)}).observe(document.body,{childList:true,subtree:true});
    new MutationObserver(function(){setTimeout(scan,0)}).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
    window.JanSamadhanDemoResilience={version:"1.1",mapFallbackActive:function(){return mapFailed()},fallbackUsed:function(){return fallbackUsed}};
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
