/* JanSamadhan Admin Profile v1
   Presentation-only admin login UI helper.
   Authentication is intentionally left to the main application so there is
   one credential path and dashboard transitions do not force a page reload. */
(function(){
  "use strict";

  var selectedRole="student";

  function id(x){return document.getElementById(x)}

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
})();
