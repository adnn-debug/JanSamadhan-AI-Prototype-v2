/* clean-public-dashboard: isolate preview data from the main demo.
   Loaded before the application inline script. */
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
    if(!window.firebase||!firebase.firestore)return;
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
  }catch(e){
    console.error("Preview Firestore namespace failed",e);
  }
})();
