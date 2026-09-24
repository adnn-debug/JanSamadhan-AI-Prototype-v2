(function(){
  "use strict";

  async function request(path, options){
    options=options||{};
    var headers=Object.assign({"Accept":"application/json"},options.headers||{});
    if(options.body!=null)headers["Content-Type"]="application/json";
    var response=await fetch(path,Object.assign({},options,{headers:headers}));
    var text=await response.text();
    var data={};
    if(text){try{data=JSON.parse(text)}catch(e){data={error:text}}}
    if(!response.ok){
      var err=new Error(data.error||("Cloud request failed ("+response.status+")"));
      err.status=response.status;
      err.payload=data;
      throw err;
    }
    return data;
  }

  function collectionPath(collection){
    if(collection==="accounts")return "/api/accounts";
    if(collection==="problems")return "/api/problems";
    throw new Error("Unsupported collection: "+collection);
  }

  window.JSCloud={
    engine:"postgresql",
    health:function(){return request("/api/storage/health");},
    list:function(collection){return request(collectionPath(collection));},
    get:function(collection,id){return request(collectionPath(collection)+"/"+encodeURIComponent(id)).catch(function(err){if(err&&err.status===404)return null;throw err});},
    set:function(collection,id,data,merge){
      return request(collectionPath(collection)+"/"+encodeURIComponent(id)+"?merge="+(merge===false?"0":"1"),{
        method:"PUT",
        body:JSON.stringify(data||{})
      });
    },
    seed:function(data,force){
      return request("/api/cloud/seed",{
        method:"POST",
        body:JSON.stringify({
          accounts:(data&&data.accounts)||[],
          problems:(data&&data.problems)||[],
          force:!!force
        })
      });
    },
    reserveDailyLimit:function(day,citizenHash,limit){
      return request("/api/daily-limit/reserve",{
        method:"POST",
        body:JSON.stringify({day:day,citizenHash:citizenHash,limit:limit||10})
      });
    }
  };
})();