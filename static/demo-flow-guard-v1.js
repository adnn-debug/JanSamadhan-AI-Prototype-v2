/* JanSamadhan demo flow guard v1
   Presentation-critical lifecycle hardening:
   - completion must use the impact-verification form, not the generic stage selector
   - milestone updates cannot move backwards
   - student/university milestone updates are limited to challenges they actually own/support
   - pilot-stage cases get a clear administrator verification action
*/
(function(){
  "use strict";

  var DATA_KEYS=["jansamadhan_data_v3","jansamadhan_data_v2"];
  var SESSION_KEY="jansamadhan_session_v2";
  var STAGES=["submitted","ai_review","admin_review","validated","assigned","team_formed","proposal","prototype","testing","pilot","completed"];
  var scanTimer=null;

  function id(x){return document.getElementById(x)}
  function hi(){return document.documentElement.lang==="hi"}
  function tx(en,hn){return hi()?hn:en}
  function esc(x){return String(x==null?"":x).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function stageIndex(x){var n=STAGES.indexOf(String(x||""));return n<0?0:n}
  function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||"null")}catch(e){return null}}
  function role(){var el=id("sessionRole"),s=session();return String(el&&el.textContent||s&&s.role||"").trim().toLowerCase()}
  function name(){var el=id("sessionName"),s=session();return String(el&&el.textContent||s&&s.name||"").trim()}
  function data(){
    for(var i=0;i<DATA_KEYS.length;i++)try{
      var d=JSON.parse(localStorage.getItem(DATA_KEYS[i])||"null");
      if(d&&Array.isArray(d.problems))return d;
    }catch(e){}
    return{problems:[]};
  }
  function problem(cid){var key=String(cid||"").toUpperCase();return(data().problems||[]).find(function(p){return String(p.id||"").toUpperCase()===key})||null}
  function active(p){return !!p&&String(p.status||"").toLowerCase()!=="solved"&&String(p.stage||"").toLowerCase()!=="completed"}
  function cardId(card){var el=card&&card.querySelector(".pid"),m=String(el&&el.textContent||"").match(/\bJS(?:-[A-Z0-9]+)+\b/i);return m?m[0].toUpperCase():""}
  function supportedByUniversity(p,who){return !!p&&(p.universities||[]).some(function(o){return String(o.provider||"").toLowerCase()===String(who||"").toLowerCase()})}

  function toast(text,kind){
    var host=id("toasts"),t=document.createElement("div");
    t.className="toast "+(kind||"warn");t.textContent=text;
    (host||document.body).appendChild(t);setTimeout(function(){if(t.parentNode)t.remove()},4800);
  }

  function ensureStyle(){
    if(id("jsflowguard-style"))return;
    var s=document.createElement("style");s.id="jsflowguard-style";
    s.textContent=".jsflowguard-note{margin:0 0 12px;padding:9px 10px;border:1px solid #d9c27f;border-left:4px solid #a96100;border-radius:7px;background:#fff9eb;font-size:.72rem;line-height:1.45}.jsflowguard-verify{box-shadow:0 0 0 2px rgba(24,135,90,.12)}body.high-contrast .jsflowguard-note{background:#000!important;color:#fff!important;border-color:#fff!important}";
    document.head.appendChild(s);
  }

  function hardenStageDialog(){
    var form=id("stageForm"),select=id("stageSelect");if(!form||!select)return;
    var option=Array.from(select.options).find(function(o){return o.value==="completed"});
    if(option){option.disabled=true;option.textContent=tx("Completed — use Verify completion","पूर्ण — 'समापन सत्यापित करें' का उपयोग करें")}
    var note=id("jsflowguard-stage-note");
    if(!note){
      note=document.createElement("div");note.id="jsflowguard-stage-note";note.className="jsflowguard-note";
      form.insertBefore(note,form.firstChild);
    }
    note.textContent=tx(
      "Completion is locked here. Use Verify completion so beneficiaries, outcome metric and verification evidence are recorded before the case is resolved.",
      "यहाँ से केस पूर्ण नहीं किया जा सकता। समाधान से पहले लाभार्थी, परिणाम मापदंड और सत्यापन प्रमाण दर्ज करने के लिए 'समापन सत्यापित करें' का उपयोग करें।"
    );
  }

  function ensureAdminVerificationButtons(){
    if(role()!=="admin")return;
    var content=id("content");if(!content)return;
    content.querySelectorAll(".card").forEach(function(card){
      var cid=cardId(card),p=problem(cid);if(!cid||!active(p))return;
      if(card.querySelector('[data-impact="'+CSS.escape(cid)+'"]'))return;
      var ready=String(p.stage||"")==="pilot"||!!(p.solution&&String(p.solution.status||"")!=="approved");
      if(!ready)return;
      var actions=card.querySelector(".cardactions");if(!actions)return;
      var b=document.createElement("button");b.type="button";b.className="btn small teal jsflowguard-verify";b.dataset.impact=cid;
      b.textContent=tx("Verify completion","समापन सत्यापित करें");
      actions.insertBefore(b,actions.firstChild);
    });
  }

  function block(e,message){
    e.preventDefault();e.stopImmediatePropagation();toast(message,"warn");
  }

  function onSubmitCapture(e){
    var form=e.target;if(!form||!form.id)return;

    if(form.id==="stageForm"){
      var selected=id("stageSelect")&&id("stageSelect").value;
      if(selected==="completed"){
        block(e,tx("Use Verify completion to record impact evidence before resolving this challenge.","इस चुनौती को हल करने से पहले प्रभाव प्रमाण दर्ज करने के लिए 'समापन सत्यापित करें' का उपयोग करें।"));
        return;
      }
    }

    if(form.id==="progressForm"){
      var cid=id("progressId")&&id("progressId").value,p=problem(cid),r=role(),who=name(),next=id("progressStage")&&id("progressStage").value;
      if(!p){block(e,tx("Challenge could not be found. Reopen the dashboard and try again.","चुनौती नहीं मिली। डैशबोर्ड दोबारा खोलकर प्रयास करें।"));return}
      if(stageIndex(next)<stageIndex(p.stage)){
        block(e,tx("Milestones cannot move backwards. Choose the current or a later stage.","माइलस्टोन पीछे नहीं जा सकता। वर्तमान या आगे का चरण चुनें।"));return;
      }
      if(r==="student"&&String(p.claimedBy||"").toLowerCase()!==who.toLowerCase()){
        block(e,tx("Only the assigned student team can update this challenge milestone.","केवल सौंपी गई छात्र टीम इस चुनौती का माइलस्टोन अपडेट कर सकती है।"));return;
      }
      if(r==="university"&&!supportedByUniversity(p,who)){
        block(e,tx("This university must be a recorded supporter before validating milestones.","माइलस्टोन सत्यापित करने से पहले यह विश्वविद्यालय दर्ज सहयोगी होना चाहिए।"));return;
      }
      if(r!=="student"&&r!=="university"&&r!=="admin"){
        block(e,tx("This role cannot publish challenge milestones.","यह भूमिका चुनौती माइलस्टोन प्रकाशित नहीं कर सकती।"));return;
      }
    }

    if(form.id==="impactForm"&&role()!=="admin"){
      block(e,tx("Only the Government / Nodal Administrator can verify completion.","केवल Government / Nodal Administrator समापन सत्यापित कर सकता है।"));
    }
  }

  function scan(){ensureStyle();hardenStageDialog();ensureAdminVerificationButtons()}
  function schedule(){clearTimeout(scanTimer);scanTimer=setTimeout(scan,70)}
  function init(){
    scan();
    document.addEventListener("submit",onSubmitCapture,true);
    document.addEventListener("click",function(e){
      var resetButton=e.target.closest("[data-reset]");
      if(resetButton&&role()!=="admin"){
        e.preventDefault();e.stopImmediatePropagation();
        toast(tx("Only the administrator can reset demo data.","केवल प्रशासक डेमो डेटा रीसेट कर सकता है।"),"warn");
        return;
      }
      if(e.target.closest("[data-stage]"))setTimeout(hardenStageDialog,0);
    },true);
    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
    new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
    window.JanSamadhanFlowGuard={version:"1.1",rescan:scan};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
