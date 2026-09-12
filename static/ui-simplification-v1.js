/* JanSamadhan UI simplification v1
   Keeps the full workflow and judge-facing evidence, but reduces first-glance density.
   Principle: show status/decision first; explanation stays one click deeper. */
(function(){
  "use strict";

  var scanTimer=null;
  function id(x){return document.getElementById(x)}
  function hi(){return document.documentElement.lang==="hi"}
  function role(){var el=id("sessionRole");return el?String(el.textContent||"").trim().toLowerCase():""}
  function isAdmin(){return role()==="admin"}

  function ensureStyles(){
    if(id("jsu-style"))return;
    var s=document.createElement("style");
    s.id="jsu-style";
    s.textContent=".jsu-details{margin:10px 0 0;border-top:1px solid var(--line,#cbd9d0);padding-top:8px}.jsu-details>summary{list-style:none;display:inline-flex;align-items:center;gap:6px;color:var(--forest,#075b3a);font-size:.72rem;font-weight:850;cursor:pointer;user-select:none}.jsu-details>summary::-webkit-details-marker{display:none}.jsu-details>summary:after{content:'+';display:grid;place-items:center;width:18px;height:18px;border:1px solid #9ebbaa;border-radius:50%;font-size:.7rem}.jsu-details[open]>summary:after{content:'–'}.jsu-detail-body{margin-top:9px;display:grid;gap:8px}.jsu-extra-meta{display:grid;grid-template-columns:1fr 1fr;gap:7px;font-size:.71rem;color:var(--muted,#5c6d64)}.jsu-extra-meta strong{color:var(--ink,#17231d)}.jsu-home-details{margin-top:16px;background:#fff;border:1px solid var(--line,#cbd9d0);border-radius:9px;padding:12px 14px}.jsu-home-details>summary{font-weight:850;color:var(--forest,#075b3a);cursor:pointer}.jsu-home-details .architecture{margin-top:12px}.jsu-compact-ai p,.jsu-compact-ai small{margin:7px 0 0}.jsu-dup-wrap{margin-top:8px}.jsu-dup-wrap>summary{color:var(--forest,#075b3a);font-size:.72rem;font-weight:850;cursor:pointer}.jsu-dup-wrap>.jsh-dup{margin-top:8px}.jsu-primary-meta{grid-template-columns:1fr 1fr}body.high-contrast .jsu-home-details,body.high-contrast .jsu-details{background:#000!important;color:#fff!important;border-color:#fff!important}body.high-contrast .jsu-details>summary,body.high-contrast .jsu-home-details>summary,body.high-contrast .jsu-dup-wrap>summary{color:#fff!important}@media(max-width:650px){.jsu-extra-meta,.jsu-primary-meta{grid-template-columns:1fr}}";
    document.head.appendChild(s);
  }

  function makeDetails(label){
    var d=document.createElement("details");
    d.className="jsu-details";
    var summary=document.createElement("summary");
    summary.textContent=label;
    var body=document.createElement("div");
    body.className="jsu-detail-body";
    d.appendChild(summary);d.appendChild(body);
    return{root:d,body:body};
  }

  function simplifyCard(card){
    if(!card||card.dataset.jsuSimplified||isAdmin())return;
    card.dataset.jsuSimplified="1";
    var block=makeDetails(hi()?"अधिक विवरण":"View details");
    var moved=false;
    var meta=card.querySelector(":scope > .meta");
    if(meta){
      meta.classList.add("jsu-primary-meta");
      var children=Array.from(meta.children);
      if(children.length>2){
        var extra=document.createElement("div");extra.className="jsu-extra-meta";
        children.slice(2).forEach(function(n){extra.appendChild(n)});
        block.body.appendChild(extra);moved=true;
      }
    }
    [".ai",".review-flag",".supportlist",".solution",".jsai-box",".jsh-dup",".jswf-path-note"].forEach(function(sel){
      Array.from(card.querySelectorAll(":scope > "+sel)).forEach(function(n){block.body.appendChild(n);moved=true})
    });
    if(moved){
      var actions=card.querySelector(":scope > .cardactions");
      if(actions)card.insertBefore(block.root,actions);else card.appendChild(block.root);
    }
  }

  function simplifyReportAnalysis(){
    var out=id("jsai-report-result");if(!out)return;
    Array.from(out.querySelectorAll(":scope > .jsai-box")).forEach(function(box){
      if(box.dataset.jsuCompact)return;box.dataset.jsuCompact="1";box.classList.add("jsu-compact-ai");
      var detail=makeDetails(hi()?"AI ने यह क्यों सुझाया?":"Why this recommendation?");
      var moved=false;
      Array.from(box.children).forEach(function(n){if(n.tagName==="P"||n.tagName==="SMALL"){detail.body.appendChild(n);moved=true}});
      if(moved)box.appendChild(detail.root);
    });
    Array.from(out.querySelectorAll(":scope > .jsh-dup")).forEach(function(box){
      if(box.parentElement&&box.parentElement.classList.contains("jsu-dup-wrap"))return;
      if(box.classList.contains("high"))return;
      var d=document.createElement("details");d.className="jsu-dup-wrap";
      var s=document.createElement("summary");s.textContent=hi()?"डुप्लिकेट जाँच":"Duplicate check";
      box.parentNode.insertBefore(d,box);d.appendChild(s);d.appendChild(box);
    });
  }

  function simplifyTracker(){
    var r=id("trackResult");if(!r)return;
    Array.from(r.querySelectorAll(":scope > .jsai-box")).forEach(function(box){
      if(box.dataset.jsuCompact)return;box.dataset.jsuCompact="1";
      var detail=makeDetails(hi()?"रूटिंग का कारण":"Why this route?");
      var moved=false;
      Array.from(box.children).forEach(function(n){if(n.tagName==="P"||n.tagName==="SMALL"){detail.body.appendChild(n);moved=true}});
      if(moved)box.appendChild(detail.root);
    });
  }

  function simplifyHomepage(){
    if(id("dashView")&&!id("dashView").classList.contains("hidden"))return;
    Array.from(document.querySelectorAll(".architecture")).forEach(function(a){
      if(a.closest(".jsu-home-details"))return;
      var d=document.createElement("details");d.className="jsu-home-details";
      var s=document.createElement("summary");s.textContent=hi()?"सिस्टम कैसे काम करता है देखें":"See system details";
      a.parentNode.insertBefore(d,a);d.appendChild(s);d.appendChild(a);
    });
  }

  function updateLabels(){
    document.querySelectorAll(".jsu-details>summary").forEach(function(s){
      if(s.closest("#jsai-report-result"))s.textContent=hi()?"AI ने यह क्यों सुझाया?":"Why this recommendation?";
      else if(s.closest("#trackResult"))s.textContent=hi()?"रूटिंग का कारण":"Why this route?";
      else s.textContent=hi()?"अधिक विवरण":"View details";
    });
    document.querySelectorAll(".jsu-home-details>summary").forEach(function(s){s.textContent=hi()?"सिस्टम कैसे काम करता है देखें":"See system details"});
    document.querySelectorAll(".jsu-dup-wrap>summary").forEach(function(s){s.textContent=hi()?"डुप्लिकेट जाँच":"Duplicate check"});
  }

  function cleanSecondaryHeadings(){
    var paragraphs=document.querySelectorAll("#content .panelhead p");
    paragraphs.forEach(function(p){p.style.display=""});
    if(isAdmin())return;
    paragraphs.forEach(function(p){if(String(p.textContent||"").length>110)p.style.display="none"});
  }

  function scan(){
    ensureStyles();
    if(!isAdmin())document.querySelectorAll("#content .card").forEach(simplifyCard);
    simplifyReportAnalysis();
    simplifyTracker();
    simplifyHomepage();
    cleanSecondaryHeadings();
    updateLabels();
  }

  function init(){
    scan();
    new MutationObserver(function(){clearTimeout(scanTimer);scanTimer=setTimeout(scan,70)}).observe(document.body,{childList:true,subtree:true});
    new MutationObserver(function(){setTimeout(scan,0)}).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
