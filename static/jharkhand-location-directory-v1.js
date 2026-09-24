/* JanSamadhan Jharkhand official location directory v1
   Rural: LGD District -> Sub-district -> Village
   Urban: LGD Jharkhand urban local body selection
   The existing Jharkhand map-pin guard remains the final geographic check. */
(function(){
  "use strict";

  var STATE_NAME="Jharkhand";
  var state={districts:[],districtByName:{},urbanBodies:[],ready:false};

  function id(x){return document.getElementById(x)}
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]})}
  function hi(){return document.documentElement.lang==="hi"}
  function copy(en,hn){return hi()?hn:en}

  function option(value,label){
    var o=document.createElement("option");
    o.value=String(value==null?"":value);
    o.textContent=label;
    return o;
  }

  function setBusy(select,label){
    select.innerHTML="";
    select.appendChild(option("",label));
    select.dataset.loading="1";
    select.disabled=true;
  }

  function fillSelect(select,items,placeholder,valueKey,labelFn){
    select.innerHTML="";
    select.appendChild(option("",placeholder));
    (items||[]).forEach(function(item){
      select.appendChild(option(item[valueKey],labelFn(item)));
    });
    select.disabled=false;
  }

  async function getJson(url){
    var res=await fetch(url,{headers:{"Accept":"application/json"}});
    var body=await res.json().catch(function(){return{}});
    if(!res.ok)throw new Error(body.error||("HTTP "+res.status));
    return body;
  }

  function makeField(labelText,control,wide){
    var div=document.createElement("div");
    div.className="field"+(wide?" wide":"");
    var label=document.createElement("label");
    label.textContent=labelText;
    if(control.id)label.setAttribute("for",control.id);
    div.appendChild(label);
    div.appendChild(control);
    return div;
  }

  function makeSelect(idValue){
    var s=document.createElement("select");
    s.id=idValue;
    s.required=true;
    return s;
  }

  function makeInput(idValue,type){
    var input=document.createElement("input");
    input.id=idValue;
    input.type=type||"text";
    return input;
  }

  function districtCode(){
    var d=id("rDistrict");
    if(!d)return"";
    var row=state.districtByName[String(d.value||"").toLowerCase()];
    return row?String(row.code):"";
  }

  function resetLocationValue(){
    var location=id("rLocation");
    if(location)location.value="";
    ["rLocationCode","rSubdistrictCode","rSubdistrictName","rUrbanBodyCode","rUrbanBodyType"].forEach(function(k){
      var el=id(k);if(el)el.value="";
    });
  }

  function syncLocationValue(){
    var type=id("rLocationType"),location=id("rLocation"),detail=id("rLandmark");
    if(!type||!location)return;
    var base="";
    if(type.value==="rural"){
      var v=id("rVillage"),sd=id("rSubdistrict");
      if(v&&v.value){
        base=v.options[v.selectedIndex].textContent;
        id("rLocationCode").value=v.value;
        if(sd&&sd.value){
          id("rSubdistrictCode").value=sd.value;
          id("rSubdistrictName").value=sd.options[sd.selectedIndex].textContent;
        }
      }
    }else if(type.value==="urban"){
      var u=id("rUrbanBody");
      if(u&&u.value){
        base=u.options[u.selectedIndex].dataset.name||u.options[u.selectedIndex].textContent;
        id("rUrbanBodyCode").value=u.value;
        id("rUrbanBodyType").value=u.options[u.selectedIndex].dataset.type||"";
        id("rLocationCode").value=u.value;
      }
    }
    var detailText=detail?String(detail.value||"").trim():"";
    location.value=base+(base&&detailText?" · "+detailText:"");
    if(detail)detail.dataset.baseLocation=base;
    var status=id("js-location-directory-status");
    if(status&&base){
      status.textContent=copy("Official Jharkhand administrative location selected: ","आधिकारिक झारखंड प्रशासनिक स्थान चुना गया: ")+base;
      status.className="js-location-status good";
    }
  }

  async function loadDistricts(){
    var body=await getJson("/api/jharkhand/districts");
    state.districts=body.items||[];
    state.districtByName={};
    state.districts.forEach(function(x){state.districtByName[String(x.name||"").toLowerCase()]=x});
    state.ready=true;
  }

  async function loadSubdistricts(){
    resetLocationValue();
    var select=id("rSubdistrict"),village=id("rVillage");
    if(!select)return;
    var code=districtCode();
    setBusy(select,copy("Select a Jharkhand district first","पहले झारखंड जिला चुनें"));
    if(village)setBusy(village,copy("Select sub-district first","पहले उप-जिला चुनें"));
    if(!code)return;
    setBusy(select,copy("Loading official LGD areas…","आधिकारिक LGD क्षेत्र लोड हो रहे हैं…"));
    try{
      var body=await getJson("/api/jharkhand/subdistricts?district_code="+encodeURIComponent(code));
      fillSelect(select,body.items||[],copy("Select sub-district / circle","उप-जिला / अंचल चुनें"),"code",function(x){return x.name});
    }catch(err){
      setBusy(select,copy("LGD directory unavailable — try again","LGD निर्देशिका उपलब्ध नहीं — फिर प्रयास करें"));
      showError(copy("Could not load Jharkhand sub-districts from LGD. Please retry.","LGD से झारखंड उप-जिले लोड नहीं हो सके। फिर प्रयास करें।"));
    }
  }

  async function loadVillages(){
    resetLocationValue();
    var sd=id("rSubdistrict"),select=id("rVillage");
    if(!sd||!select)return;
    setBusy(select,copy("Select sub-district first","पहले उप-जिला चुनें"));
    if(!sd.value)return;
    setBusy(select,copy("Loading official villages…","आधिकारिक गाँव लोड हो रहे हैं…"));
    try{
      var body=await getJson("/api/jharkhand/villages?subdistrict_code="+encodeURIComponent(sd.value));
      fillSelect(select,body.items||[],copy("Select village","गाँव चुनें"),"code",function(x){return x.name+" · LGD "+x.code});
    }catch(err){
      setBusy(select,copy("LGD village directory unavailable — try again","LGD गाँव निर्देशिका उपलब्ध नहीं — फिर प्रयास करें"));
      showError(copy("Could not load the official village list. Please retry.","आधिकारिक गाँव सूची लोड नहीं हो सकी। फिर प्रयास करें।"));
    }
  }

  async function loadUrbanBodies(){
    var select=id("rUrbanBody");
    if(!select)return;
    if(state.urbanBodies.length){
      renderUrbanBodies();
      return;
    }
    setBusy(select,copy("Loading official urban bodies…","आधिकारिक शहरी निकाय लोड हो रहे हैं…"));
    try{
      var body=await getJson("/api/jharkhand/urban-bodies");
      state.urbanBodies=body.items||[];
      renderUrbanBodies();
    }catch(err){
      setBusy(select,copy("LGD urban directory unavailable — try again","LGD शहरी निर्देशिका उपलब्ध नहीं — फिर प्रयास करें"));
      showError(copy("Could not load Jharkhand urban local bodies from LGD. Please retry.","LGD से झारखंड शहरी निकाय लोड नहीं हो सके। फिर प्रयास करें।"));
    }
  }

  function renderUrbanBodies(){
    var select=id("rUrbanBody");if(!select)return;
    select.innerHTML="";
    select.appendChild(option("",copy("Select municipal area / town","नगर निकाय / शहर चुनें")));
    state.urbanBodies.forEach(function(x){
      var o=option(x.code,x.name+" · "+x.type);
      o.dataset.name=x.name;
      o.dataset.type=x.type;
      select.appendChild(o);
    });
    select.dataset.loading="0";
    select.disabled=false;
    syncModeControls();
  }

  function showError(msg){
    var status=id("js-location-directory-status");
    if(status){status.textContent=msg;status.className="js-location-status bad"}
  }

  function syncModeControls(){
    var type=id("rLocationType"),sd=id("rSubdistrict"),village=id("rVillage"),urbanBody=id("rUrbanBody");
    if(!type)return;
    var ruralActive=type.value==="rural",urbanActive=type.value==="urban";
    if(sd){sd.required=ruralActive;sd.disabled=!ruralActive||sd.dataset.loading==="1"}
    if(village){village.required=ruralActive;village.disabled=!ruralActive||village.dataset.loading==="1"}
    if(urbanBody){urbanBody.required=urbanActive;urbanBody.disabled=!urbanActive||urbanBody.dataset.loading==="1"}
  }

  function toggleMode(){
    resetLocationValue();
    var type=id("rLocationType");
    var rural=id("js-rural-location"),urban=id("js-urban-location");
    if(!type||!rural||!urban)return;
    rural.style.display=type.value==="rural"?"contents":"none";
    urban.style.display=type.value==="urban"?"contents":"none";
    syncModeControls();
    if(type.value==="rural")loadSubdistricts();
    if(type.value==="urban")loadUrbanBodies();
    var status=id("js-location-directory-status");
    if(status){
      status.textContent=copy(
        type.value==="rural"?"Choose the official LGD sub-district and village.":"Choose the official Jharkhand urban local body, then add an optional nearby landmark.",
        type.value==="rural"?"आधिकारिक LGD उप-जिला और गाँव चुनें।":"आधिकारिक झारखंड शहरी निकाय चुनें, फिर चाहें तो पास का पहचान स्थल लिखें।"
      );
      status.className="js-location-status";
    }
  }

  function install(){
    var form=id("reportForm"),district=id("rDistrict"),old=id("rLocation");
    if(!form||!district||!old||id("rLocationType"))return;

    var style=document.createElement("style");
    style.id="js-location-directory-style";
    style.textContent=".js-location-status{grid-column:1/-1;padding:9px 10px;border:1px solid #cbd9d1;border-radius:7px;background:#f7faf8;color:#486056;font-size:.72rem}.js-location-status.good{border-color:#91c8a8;background:#eff9f3;color:#12673f}.js-location-status.bad{border-color:#e2a3aa;background:#fff1f2;color:#9b2631}.js-fixed-state{background:#eef4f0!important;color:#315443!important;font-weight:800}";
    document.head.appendChild(style);

    var oldField=old.closest(".field");
    old.type="hidden";
    old.required=false;
    old.removeAttribute("placeholder");
    if(oldField)oldField.style.display="none";

    ["rLocationCode","rSubdistrictCode","rSubdistrictName","rUrbanBodyCode","rUrbanBodyType"].forEach(function(k){
      var h=makeInput(k,"hidden");form.appendChild(h);
    });

    var grid=form.querySelector(".formgrid");
    if(!grid)return;

    var stateInput=makeInput("rState");
    stateInput.value=STATE_NAME;
    stateInput.readOnly=true;
    stateInput.className="js-fixed-state";
    var stateField=makeField(copy("State","राज्य"),stateInput,false);
    grid.insertBefore(stateField,district.closest(".field"));

    var type=makeSelect("rLocationType");
    type.appendChild(option("rural",copy("Rural village","ग्रामीण गाँव")));
    type.appendChild(option("urban",copy("Urban / town area","शहरी / नगर क्षेत्र")));
    var typeField=makeField(copy("Location type","स्थान प्रकार"),type,false);
    var districtField=district.closest(".field");
    districtField.parentNode.insertBefore(typeField,districtField.nextSibling);

    var ruralWrap=document.createElement("div");
    ruralWrap.id="js-rural-location";
    ruralWrap.style.display="contents";
    var sd=makeSelect("rSubdistrict");
    var village=makeSelect("rVillage");
    ruralWrap.appendChild(makeField(copy("Sub-district / circle","उप-जिला / अंचल"),sd,false));
    ruralWrap.appendChild(makeField(copy("Village (official LGD)","गाँव (आधिकारिक LGD)"),village,false));
    typeField.parentNode.insertBefore(ruralWrap,typeField.nextSibling);

    var urbanWrap=document.createElement("div");
    urbanWrap.id="js-urban-location";
    urbanWrap.style.display="none";
    urbanWrap.appendChild(makeField(copy("Urban locality / local body","शहरी क्षेत्र / स्थानीय निकाय"),makeSelect("rUrbanBody"),true));
    ruralWrap.parentNode.insertBefore(urbanWrap,ruralWrap.nextSibling);

    var landmark=makeInput("rLandmark");
    landmark.maxLength=90;
    landmark.placeholder=copy("Optional: ward, road, market, school, community tap…","वैकल्पिक: वार्ड, सड़क, बाज़ार, स्कूल, सामुदायिक नल…");
    var landmarkField=makeField(copy("Nearby landmark (optional)","पास का पहचान स्थल (वैकल्पिक)"),landmark,true);
    urbanWrap.parentNode.insertBefore(landmarkField,urbanWrap.nextSibling);

    var status=document.createElement("div");
    status.id="js-location-directory-status";
    status.className="js-location-status";
    status.textContent=copy("Loading Jharkhand official location directory…","झारखंड की आधिकारिक स्थान निर्देशिका लोड हो रही है…");
    landmarkField.parentNode.insertBefore(status,landmarkField.nextSibling);

    type.addEventListener("change",toggleMode);
    district.addEventListener("change",function(){if(type.value==="rural")loadSubdistricts();else resetLocationValue()});
    sd.addEventListener("change",loadVillages);
    village.addEventListener("change",syncLocationValue);
    id("rUrbanBody").addEventListener("change",syncLocationValue);
    landmark.addEventListener("input",syncLocationValue);

    form.addEventListener("reset",function(){setTimeout(function(){resetLocationValue();toggleMode()},0)});

    form.addEventListener("submit",function(e){
      syncLocationValue();
      var loc=id("rLocation");
      var valid=!!(loc&&loc.value);
      if(type.value==="rural")valid=valid&&!!sd.value&&!!village.value;
      if(type.value==="urban")valid=valid&&!!id("rUrbanBody").value;
      if(!valid){
        e.preventDefault();
        e.stopImmediatePropagation();
        showError(copy("Select a valid Jharkhand village or urban local body before submitting.","जमा करने से पहले झारखंड का वैध गाँव या शहरी निकाय चुनें।"));
      }
    },true);

    loadDistricts().then(function(){
      toggleMode();
      if(district.value)loadSubdistricts();
    }).catch(function(){
      showError(copy("Official LGD location service is temporarily unavailable. Please retry shortly.","आधिकारिक LGD स्थान सेवा अस्थायी रूप से उपलब्ध नहीं है। थोड़ी देर बाद फिर प्रयास करें।"));
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();

  new MutationObserver(function(){install()}).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
})();