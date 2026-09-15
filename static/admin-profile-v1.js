/* JanSamadhan Admin Profile v1
   Keeps partner demo accounts untouched and aligns the administrator login
   with the official presentation credential used across the prototype.
   This remains prototype-only client-side authentication, not production security. */
(function(){
  "use strict";

  var SESSION="jansamadhan_session_v2";
  var selectedRole="student";
  var ADMIN_HASH="240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

  function id(x){return document.getElementById(x)}
  async function sha256(text){
    if(!(window.crypto&&crypto.subtle&&window.TextEncoder))throw new Error("Secure hashing unavailable");
    var bytes=new TextEncoder().encode(String(text));
    var digest=await crypto.subtle.digest("SHA-256",bytes);
    return Array.from(new Uint8Array(digest)).map(function(b){return b.toString(16).padStart(2,"0")}).join("");
  }

  function updateAdminUI(){
    if(selectedRole!=="admin")return;
    var hint=id("hint"),u=id("username"),p=id("password");
    if(hint)hint.innerHTML="<strong>Administrator demo:</strong> <b>admin</b> / <b>admin123</b>.";
    if(u)u.placeholder="admin";
    if(p)p.placeholder="admin123";
  }

  document.addEventListener("click",function(e){
    var b=e.target.closest("[data-role]");
    if(!b)return;
    selectedRole=String(b.dataset.role||"student").toLowerCase();
    if(selectedRole==="admin")setTimeout(updateAdminUI,0);
  },true);

  document.addEventListener("submit",async function(e){
    if(!e.target||e.target.id!=="loginForm"||selectedRole!=="admin")return;
    e.preventDefault();
    e.stopImmediatePropagation();

    var u=id("username"),p=id("password"),error=id("loginError");
    var identity=String(u&&u.value||"").trim().toLowerCase();
    var password=String(p&&p.value||"");
    if(error)error.textContent="";

    var identityOk=identity==="admin";
    var passwordOk=false;
    try{passwordOk=(await sha256(password))===ADMIN_HASH}catch(err){if(error)error.textContent="Administrator login is unavailable in this browser.";return}

    if(!identityOk||!passwordOk){
      if(error)error.textContent="Incorrect administrator credentials.";
      return;
    }

    localStorage.setItem(SESSION,JSON.stringify({role:"admin",name:"Administrator",email:""}));
    try{if(id("loginDialog")&&id("loginDialog").open)id("loginDialog").close()}catch(err){}
    window.location.reload();
  },true);
})();
