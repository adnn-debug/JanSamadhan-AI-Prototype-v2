/* JanSamadhan Jharkhand map boundary patch v1
   Loaded before the GIS module so every Leaflet map is constrained to the
   Jharkhand operating area instead of allowing an India/world-wide demo view.
*/
(function(){
  "use strict";

  var BOUNDS=[[21.85,83.20],[25.45,88.10]];

  function patchLeaflet(){
    if(!(window.L&&typeof window.L.map==="function")||window.L.map.__jsjhBounded)return false;
    var original=window.L.map;
    function boundedMap(element,options){
      options=options||{};
      if(!options.maxBounds)options.maxBounds=BOUNDS;
      if(options.maxBoundsViscosity==null)options.maxBoundsViscosity=1.0;
      if(options.minZoom==null)options.minZoom=7;
      var map=original.call(window.L,element,options);
      try{map.setMaxBounds(BOUNDS)}catch(e){}
      return map;
    }
    Object.keys(original).forEach(function(k){try{boundedMap[k]=original[k]}catch(e){}});
    boundedMap.__jsjhBounded=true;
    boundedMap.__original=original;
    window.L.map=boundedMap;
    return true;
  }

  /* Leaflet is injected by gis-map-v1.js. Capture its load event before the
     GIS onload handler creates the report/admin maps. */
  document.addEventListener("load",function(e){
    if(e&&e.target&&e.target.id==="jsgeo-leaflet-js")patchLeaflet();
  },true);

  patchLeaflet();

  window.JanSamadhanJharkhandMapBounds={bounds:BOUNDS,version:"1.0"};
})();
