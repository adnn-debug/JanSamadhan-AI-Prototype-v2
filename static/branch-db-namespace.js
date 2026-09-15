/* clean-public-dashboard: isolate preview data from the main demo
   and keep the public navigation/chatbot presentation-safe. */
(function(){
  "use strict";

  var PREFIX="clean_public_dashboard__";

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
    console.warn("Preview local-storage namespace unavailable",e);
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
      window.JanSamadhanPreviewNamespace=PREFIX;
    }
  }catch(e){
    console.error("Preview Firestore namespace failed",e);
  }

  function isHindi(){
    return document.documentElement.lang==="hi";
  }

  function setText(el,value){
    if(el&&el.textContent!==value)el.textContent=value;
  }

  function installUiStyles(){
    if(document.getElementById("clean-preview-ui-style"))return;
    var style=document.createElement("style");
    style.id="clean-preview-ui-style";
    style.textContent=
      "#authView.jsu-public-clean .govnav .navlinks>[data-report],"+
      "#authView.jsu-public-clean .govnav .navlinks>[data-track],"+
      "#authView.jsu-public-clean .govnav .navlinks>.clean-admin-login,"+
      "#authView.jsu-public-clean .govnav .navlinks>.clean-partner-login{display:flex!important}"+
      "#authView.jsu-public-clean .govnav .navlinks>[data-login]{display:none!important}"+
      "#authView.jsu-public-clean .govnav .navlinks{margin-left:auto;flex-wrap:wrap}"+
      "#citizenChatbot.hidden{display:block!important}"+
      ".clean-admin-login,.clean-partner-login{white-space:nowrap}"+
      "@media(max-width:720px){#authView.jsu-public-clean .govnav-inner{justify-content:center!important}.govnav .navlinks{width:100%;justify-content:center}.govnav .navlinks button{font-size:.72rem;padding:10px 9px}}";
    document.head.appendChild(style);
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

    var report=nav.querySelector("[data-report]");
    var track=nav.querySelector("[data-track]");
    setText(report,isHindi()?"समस्या रिपोर्ट करें":"Report a Problem");
    setText(track,isHindi()?"स्थिति ट्रैक करें":"Track Status");

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

  function syncPreviewUi(){
    installUiStyles();
    installPublicNav();
    keepChatbotAvailable();
  }

  function initPreviewUi(){
    syncPreviewUi();
    var pending=false;
    new MutationObserver(function(){
      if(pending)return;
      pending=true;
      setTimeout(function(){pending=false;syncPreviewUi()},20);
    }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
    new MutationObserver(function(){setTimeout(syncPreviewUi,0)}).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initPreviewUi,{once:true});
  else initPreviewUi();
})();
