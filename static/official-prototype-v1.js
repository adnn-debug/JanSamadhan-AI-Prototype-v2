/* JanSamadhan official prototype data and UI layer.
   Keeps production data isolated, presentation-safe and deterministic. */
(function(){
  "use strict";

  var PREFIX="official_prototype_v2__";
  var DATA_KEY="jansamadhan_data_v3";
  var REVISION_KEY="jansamadhan_seed_revision_v2";
  var REVISION="jharkhand-demo-clean-v1";

  function ago(days){return new Date(Date.now()-days*86400000).toISOString()}

  function canonicalSeed(){
    return {
      next:1003,
      nextUser:2004,
      accounts:[
        {id:"USR-2001",role:"student",name:"Aditi",username:"Aditi",email:"aditi@demo.local",organisation:"MACET",passwordHash:"2f32501db87cdaf48efd6210a0634c3a58ae25a8a0a8f40938fdba45b9553ba3",status:"approved",submittedAt:ago(20),reviewedAt:ago(19)},
        {id:"USR-2002",role:"university",name:"MACET",username:"MACET",email:"innovation@macet.demo",organisation:"MACET",passwordHash:"4c518658b5cb5d54bc8359024185d36f0fa4aee2cff307f6c63f306c94a5419c",status:"approved",submittedAt:ago(20),reviewedAt:ago(19)},
        {id:"USR-2003",role:"industry",name:"BrightGrid Solutions",username:"BrightGrid Solutions",email:"support@brightgrid.demo",organisation:"BrightGrid Solutions",passwordHash:"59765a8fbcd7cb918a855559b7fd523e066e75a6ef19b6302e58346fb13a8847",status:"approved",submittedAt:ago(20),reviewedAt:ago(19)}
      ],
      problems:[
        {
          id:"JS-1001",title:"Broken streetlights on Kanke Road",category:"Energy",district:"Ranchi",location:"Kanke Road, Ranchi",
          description:"Four streetlights on a busy stretch of Kanke Road are not working. The case has been verified and repair work is currently in progress.",
          reporter:"Local residents",affected:650,createdAt:ago(6),updatedAt:ago(1),status:"claimed",stage:"prototype",claimedBy:"Aditi",dupes:2,reporters:3,boost:false,help:false,criticalAcknowledged:false,
          assignedUniversity:"BIT Mesra Outreach Cell",universities:[{provider:"BIT Mesra Outreach Cell",type:"Electrical safety mentor"}],industries:[{provider:"BrightGrid Solutions",type:"Equipment and components"}],
          proposal:{summary:"Restore the failed streetlights and add a simple fault-reporting workflow for faster maintenance.",team:"Aditi and Campus Innovation Team",mentor:"Faculty mentor",duration:"5 weeks",impact:"Restore safer evening access for residents and commuters",submittedAt:ago(3)},
          solution:null,impact:null,
          ai:{suggestedCategory:"Energy",category:"Energy",confidence:91,priority:"High",risk:"No critical safety phrase detected",critical:false,reasons:["Streetlight and electricity keywords detected","650 people reportedly affected","Human validation completed"],universityMatches:["BIT Mesra Outreach Cell"]},
          statusHistory:[
            {stage:"submitted",by:"Citizen",note:"Challenge report received.",at:ago(6)},
            {stage:"ai_review",by:"JanSamadhan AI",note:"Category, priority and duplicate analysis completed.",at:ago(6)},
            {stage:"validated",by:"Administrator",note:"Report verified and approved for action.",at:ago(5)},
            {stage:"assigned",by:"Administrator",note:"Technical support assigned.",at:ago(4)},
            {stage:"team_formed",by:"Aditi",note:"Implementation team formed.",at:ago(3)},
            {stage:"prototype",by:"Aditi",note:"Repair and fault-reporting work is in progress.",at:ago(1)}
          ],photo:""
        },
        {
          id:"JS-1002",title:"Damaged bus stop sign at Lalpur Chowk",category:"Urban Development",district:"Ranchi",location:"Lalpur Chowk, Ranchi",
          description:"A damaged bus stop sign reduced visibility for commuters. A replacement sign with reflective markings was installed and verified.",
          reporter:"Local commuters",affected:310,createdAt:ago(15),updatedAt:ago(1),status:"solved",stage:"completed",claimedBy:"Aditi",dupes:0,reporters:1,boost:false,help:false,criticalAcknowledged:false,
          assignedUniversity:"Ranchi University Innovation Cell",universities:[{provider:"Ranchi University Innovation Cell",type:"Field verification support"}],industries:[],
          proposal:{summary:"Replace the damaged sign and improve night visibility with reflective markings.",team:"Aditi and Campus Innovation Team",mentor:"Faculty mentor",duration:"1 week",impact:"Improve visibility for daily commuters",submittedAt:ago(10)},
          solution:{note:"Installed a new sign with reflective markings and verified evening visibility.",by:"Aditi",status:"approved",submittedAt:ago(2)},
          impact:{beneficiaries:310,metric:"1 bus stop sign restored and verified",evidence:"Administrator field verification completed.",verifiedAt:ago(1)},
          ai:{suggestedCategory:"Urban Development",category:"Urban Development",confidence:89,priority:"High",risk:"No critical safety phrase detected",critical:false,reasons:["Road and bus-stop context detected","310 people reportedly affected","Human validation completed"],universityMatches:["Ranchi University Innovation Cell"]},
          statusHistory:[
            {stage:"submitted",by:"Citizen",note:"Challenge report received.",at:ago(15)},
            {stage:"ai_review",by:"JanSamadhan AI",note:"Category and priority analysis completed.",at:ago(15)},
            {stage:"validated",by:"Administrator",note:"Report verified.",at:ago(13)},
            {stage:"assigned",by:"Administrator",note:"Implementation responsibility assigned.",at:ago(12)},
            {stage:"testing",by:"Aditi",note:"Replacement sign installed and checked.",at:ago(2)},
            {stage:"completed",by:"Administrator",note:"Resolution verified and impact published.",at:ago(1)}
          ],photo:""
        }
      ]
    };
  }

  function mapLocalKey(key){
    key=String(key==null?"":key);
    return key.indexOf("jansamadhan_")===0?PREFIX+key:key;
  }

  try{
    var storageProto=Object.getPrototypeOf(window.localStorage);
    var originalGet=storageProto.getItem;
    var originalSet=storageProto.setItem;
    var originalRemove=storageProto.removeItem;
    storageProto.getItem=function(key){
      return originalGet.call(this,this===window.localStorage?mapLocalKey(key):key);
    };
    storageProto.setItem=function(key,value){
      return originalSet.call(this,this===window.localStorage?mapLocalKey(key):key,value);
    };
    storageProto.removeItem=function(key){
      return originalRemove.call(this,this===window.localStorage?mapLocalKey(key):key);
    };
  }catch(e){
    console.warn("Official local-storage namespace unavailable",e);
  }

  /* Seed the cleaned official dataset before the main inline application initializes.
     The revision marker prevents normal user-created reports from being reset later. */
  try{
    if(localStorage.getItem(REVISION_KEY)!==REVISION){
      localStorage.setItem(DATA_KEY,JSON.stringify(canonicalSeed()));
      localStorage.setItem(REVISION_KEY,REVISION);
    }
  }catch(e){
    console.warn("Official seed bootstrap unavailable",e);
  }

  try{
    if(window.firebase&&firebase.firestore){
      var originalFirestore=firebase.firestore;
      var cache=typeof WeakMap!=="undefined"?new WeakMap():null;

      function wrapDatabase(db){
        if(cache&&cache.has(db))return cache.get(db);
        var wrapped=new Proxy(db,{
          get:function(target,prop){
            if(prop==="collection"){
              return function(name){
                return target.collection(PREFIX+String(name));
              };
            }
            var value=Reflect.get(target,prop,target);
            return typeof value==="function"?value.bind(target):value;
          }
        });
        if(cache)cache.set(db,wrapped);
        return wrapped;
      }

      function namespacedFirestore(){
        return wrapDatabase(originalFirestore.apply(firebase,arguments));
      }

      Object.getOwnPropertyNames(originalFirestore).forEach(function(prop){
        if(prop==="length"||prop==="name"||prop==="prototype")return;
        try{Object.defineProperty(namespacedFirestore,prop,Object.getOwnPropertyDescriptor(originalFirestore,prop));}catch(e){}
      });
      firebase.firestore=namespacedFirestore;
      window.JanSamadhanOfficialNamespace=PREFIX;
    }
  }catch(e){
    console.error("Official Firestore namespace failed",e);
  }

  /* The base application defines seed() later in the page. Replace that global
     as soon as it exists so Firebase seeding and the Reset Demo Data action use
     the same cleaned two-case dataset with no pending demo account. */
  var seedOverrideAttempts=0;
  var seedOverrideTimer=setInterval(function(){
    seedOverrideAttempts++;
    if(typeof window.seed==="function"){
      window.seed=canonicalSeed;
      clearInterval(seedOverrideTimer);
    }else if(seedOverrideAttempts>400){
      clearInterval(seedOverrideTimer);
    }
  },5);

  function installFavicon(){
    if(!document.head)return;
    var icon=document.querySelector('link[rel~="icon"]');
    if(!icon){
      icon=document.createElement("link");
      icon.rel="icon";
      document.head.appendChild(icon);
    }
    icon.type="image/svg+xml";
    icon.href='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#075b3a"/><text x="32" y="41" text-anchor="middle" font-family="Arial,sans-serif" font-size="27" font-weight="700" fill="white">JS</text></svg>');
  }
  installFavicon();

  function isHindi(){
    return document.documentElement.lang==="hi";
  }

  function setText(el,value){
    if(el&&el.textContent!==value)el.textContent=value;
  }

  function installUiStyles(){
    if(document.getElementById("official-prototype-ui-style"))return;
    var style=document.createElement("style");
    style.id="official-prototype-ui-style";
    style.textContent=
      "#authView.jsu-public-clean .govnav .navlinks>[data-report],"+
      "#authView.jsu-public-clean .govnav .navlinks>[data-track],"+
      "#authView.jsu-public-clean .govnav .navlinks>[data-login]{display:none!important}"+
      "#authView.jsu-public-clean .govnav .navlinks>.clean-admin-login,"+
      "#authView.jsu-public-clean .govnav .navlinks>.clean-partner-login{display:flex!important}"+
      "#authView.jsu-public-clean .govnav .navlinks{margin-left:auto;flex-wrap:wrap}"+
      "#authView.jsu-public-clean .quicktrack{display:none!important}"+
      "#authView.jsu-public-clean .hero{grid-template-columns:1fr!important;max-width:900px;margin:0 auto}"+
      "#dashView .govnav [data-track]{display:none!important}"+
      "#citizenChatbot.hidden{display:block!important}"+
      ".clean-admin-login,.clean-partner-login{white-space:nowrap}"+
      "#official-clock-bar{position:sticky!important;top:0!important;z-index:1200!important;background:#fff!important;border-bottom:1px solid var(--line,#cbd9d0)!important;display:block!important}"+
      "#official-clock-bar .official-clock-inner{min-height:52px;display:flex;align-items:center;justify-content:flex-end;padding-top:6px;padding-bottom:6px}"+
      "#official-clock-bar .actions{display:flex!important;align-items:center;justify-content:flex-end;width:100%}"+
      "#official-clock-bar .js-live-clock{display:inline-flex!important;visibility:visible!important;opacity:1!important;margin:0!important}"+
      "body.high-contrast #official-clock-bar{background:#000!important;border-color:#fff!important}"+
      "@media(max-width:720px){#authView.jsu-public-clean .govnav-inner{justify-content:center!important}.govnav .navlinks{width:100%;justify-content:center}.govnav .navlinks button{font-size:.72rem;padding:10px 9px}#official-clock-bar .official-clock-inner{min-height:48px;justify-content:center}#official-clock-bar .actions{justify-content:center}}";
    document.head.appendChild(style);
  }

  function ensureGlobalClockBar(){
    if(!document.body)return null;
    var bar=document.getElementById("official-clock-bar");
    if(!bar){
      bar=document.createElement("div");
      bar.id="official-clock-bar";
      bar.className="apphead official-clock-bar";
      bar.setAttribute("aria-label",isHindi()?"लाइव तारीख और समय":"Live date and time");
      bar.innerHTML='<div class="shell official-clock-inner"><div class="actions" id="official-clock-actions"></div></div>';
      document.body.insertBefore(bar,document.body.firstChild||null);
    }
    return bar;
  }

  function configureLoginDialog(mode){
    var dialog=document.getElementById("loginDialog");
    if(!dialog)return;
    var title=dialog.querySelector(".modalhead h2");
    var intro=dialog.querySelector(".modalbody>p");
    var admin=dialog.querySelector('[data-role="admin"]');
    var partners=Array.prototype.slice.call(dialog.querySelectorAll('[data-role="student"],[data-role="university"],[data-role="industry"]'));

    if(mode==="admin"){
      if(title)title.textContent=isHindi()?"प्रशासक लॉगिन":"Administrator Login";
      if(intro)intro.textContent=isHindi()?"प्रशासनिक डैशबोर्ड खोलने के लिए अधिकृत प्रशासक खाते से साइन इन करें।":"Sign in with the authorized administrator account to open the governance dashboard.";
      partners.forEach(function(btn){btn.style.display="none"});
      if(admin){admin.style.display="block";admin.click()}
    }else{
      if(title)title.textContent=isHindi()?"भागीदार लॉगिन":"Partner Login";
      if(intro)intro.textContent=isHindi()?"छात्र, विश्वविद्यालय या उद्योग की स्वीकृत भूमिका चुनें।":"Select an approved student, university, or industry role.";
      partners.forEach(function(btn){btn.style.display="block"});
      if(admin)admin.style.display="none";
      var activePartner=dialog.querySelector('[data-role="student"].active,[data-role="university"].active,[data-role="industry"].active');
      if(!activePartner&&partners[0])partners[0].click();
      else if(admin&&String(admin.style.background||"").indexOf("mint")>=0&&partners[0])partners[0].click();
    }
  }

  function openLoginMode(mode){
    var source=document.querySelector('#authView [data-login]');
    if(!source)return;
    source.click();
    setTimeout(function(){configureLoginDialog(mode)},0);
  }

  function installPublicNav(){
    var auth=document.getElementById("authView");
    if(!auth)return;
    var nav=auth.querySelector(".govnav .navlinks");
    var source=nav&&nav.querySelector("[data-login]");
    if(!nav||!source)return;

    source.setAttribute("aria-hidden","true");
    source.setAttribute("tabindex","-1");
    source.style.setProperty("display","none","important");

    var report=nav.querySelector("[data-report]");
    var track=nav.querySelector("[data-track]");
    [report,track].forEach(function(btn){
      if(!btn)return;
      btn.setAttribute("aria-hidden","true");
      btn.setAttribute("tabindex","-1");
      btn.style.setProperty("display","none","important");
    });

    var admin=nav.querySelector(".clean-admin-login");
    if(!admin){
      admin=document.createElement("button");
      admin.type="button";
      admin.className="clean-admin-login";
      admin.addEventListener("click",function(){openLoginMode("admin")});
      nav.insertBefore(admin,source);
    }
    setText(admin,isHindi()?"प्रशासक पैनल":"Admin Panel");

    var partner=nav.querySelector(".clean-partner-login");
    if(!partner){
      partner=document.createElement("button");
      partner.type="button";
      partner.className="clean-partner-login";
      partner.addEventListener("click",function(){openLoginMode("partner")});
      nav.insertBefore(partner,source);
    }
    setText(partner,isHindi()?"भागीदार लॉगिन":"Partner Login");
  }

  function keepChatbotAvailable(){
    var bot=document.getElementById("citizenChatbot");
    if(bot&&bot.classList.contains("hidden"))bot.classList.remove("hidden");
  }

  function syncOfficialUi(){
    installUiStyles();
    ensureGlobalClockBar();
    installPublicNav();
    keepChatbotAvailable();
  }

  function initOfficialUi(){
    syncOfficialUi();
    var pending=false;
    new MutationObserver(function(){
      if(pending)return;
      pending=true;
      setTimeout(function(){pending=false;syncOfficialUi()},20);
    }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
    new MutationObserver(function(){setTimeout(syncOfficialUi,0)}).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initOfficialUi,{once:true});
  else initOfficialUi();
})();
