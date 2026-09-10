/* JanSamadhan AI v3 — runtime AI mode indicator.
   Groq LLM is used when GROQ_API_KEY is configured.
   Local deterministic fallback keeps the prototype functional otherwise. */
(function(){
  "use strict";

  var modeLabel = "AI decision support · Local fallback ready";
  var healthChecked = false;
  var refreshScheduled = false;

  function safeSetText(node, value){
    if(node && node.textContent !== value){
      node.textContent = value;
    }
  }

  function rewriteText(root){
    if(!root) return;

    function rewriteNode(node){
      if(!node || node.nodeType !== Node.TEXT_NODE) return;
      var before = node.nodeValue || "";
      var after = before
        .replace(/LLM routing recommendation/g, "AI routing recommendation")
        .replace(/AI unavailable\./g, "AI analysis is using the local fallback.");
      if(after !== before){
        node.nodeValue = after;
      }
    }

    if(root.nodeType === Node.TEXT_NODE){
      rewriteNode(root);
      return;
    }

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while((node = walker.nextNode())){
      rewriteNode(node);
    }
  }

  function ensureModeBadge(){
    var box = document.getElementById("chatbotPanel");
    if(!box) return null;

    var badge = document.getElementById("jsDemoModeBadge");
    if(!badge){
      badge = document.createElement("div");
      badge.id = "jsDemoModeBadge";
      badge.style.cssText = "font-size:.68rem;opacity:.72;margin:6px 0 0;";
      var note = document.getElementById("chatbotNote");
      if(note && note.parentNode){
        note.parentNode.insertBefore(badge, note);
      }else{
        box.appendChild(badge);
      }
    }

    safeSetText(badge, modeLabel);
    return badge;
  }

  function checkHealthOnce(){
    if(healthChecked) return;
    healthChecked = true;

    fetch("/health", {cache:"no-store"})
      .then(function(r){
        if(!r.ok) throw new Error("health unavailable");
        return r.json();
      })
      .then(function(data){
        modeLabel = data && data.ai_mode === "groq+local-fallback"
          ? "Real LLM via Groq · Automatic local fallback"
          : "AI decision support · Local fallback mode";
        safeSetText(document.getElementById("jsDemoModeBadge"), modeLabel);
      })
      .catch(function(){
        modeLabel = "AI decision support · Local fallback ready";
        safeSetText(document.getElementById("jsDemoModeBadge"), modeLabel);
      });
  }

  function run(){
    rewriteText(document.body);
    ensureModeBadge();
    checkHealthOnce();
  }

  function scheduleRefresh(){
    if(refreshScheduled) return;
    refreshScheduled = true;
    setTimeout(function(){
      refreshScheduled = false;
      ensureModeBadge();
    }, 60);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", run, {once:true});
  }else{
    run();
  }

  var observer = new MutationObserver(function(mutations){
    var shouldRefresh = false;

    mutations.forEach(function(mutation){
      var target = mutation.target && mutation.target.nodeType === 1
        ? mutation.target
        : mutation.target && mutation.target.parentElement;

      if(target && (target.id === "jsDemoModeBadge" || target.closest("#jsDemoModeBadge"))){
        return;
      }

      mutation.addedNodes.forEach(function(node){
        if(node.nodeType === 1 && node.id === "jsDemoModeBadge") return;
        rewriteText(node);
        shouldRefresh = true;
      });
    });

    if(shouldRefresh) scheduleRefresh();
  });

  observer.observe(document.documentElement, {childList:true, subtree:true});
})();
