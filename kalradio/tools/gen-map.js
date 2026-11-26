// gen-map.js — makes client/data.js (world map shape + city list). Run: npm install && node tools/gen-map.js 0.35
const fs=require('fs');const topo=require('topojson-client');
const simp=require('topojson-simplify');
let land=require('world-atlas/land-50m.json');
land=simp.simplify(simp.presimplify(land),simp.quantile(simp.presimplify(land),+process.argv[2]||0.25));
land=simp.filter(land,simp.filterWeight(land,0.02));
const f=topo.feature(land,land.objects.land);
const W=1000,LAT_TOP=84,LAT_BOT=-58,H=Math.round(W*(LAT_TOP-LAT_BOT)/360);
const px=(lon)=>((lon+180)/360*W),py=(lat)=>((LAT_TOP-lat)/(LAT_TOP-LAT_BOT)*H);
let d='';
const d3=require('d3-geo');
const proj=d3.geoEquirectangular().scale(W/(2*Math.PI)).translate([W/2,LAT_TOP*W/360]).clipExtent([[-1,-1],[W+1,H+1]]);
const gp=d3.geoPath(proj);if(gp.digits)gp.digits(2);
d=gp(f).replace(/(\.\d\d)\d+/g,'$1');
// Needs ne_10m_populated_places_simple.geojson (Natural Earth, public domain) next to this file:
// https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
const g=JSON.parse(fs.readFileSync(__dirname+'/ne_places.geojson'));
const countries=[];const cidx={};
let rows=g.features.map(x=>x.properties).filter(p=>p.nameascii&&p.latitude!=null).sort((a,b)=>(b.pop_max||0)-(a.pop_max||0));
const seen=new Set();const out=[];
for(const p of rows){const cn=p.adm0name||'';const key=p.nameascii+'|'+cn+'|'+(p.adm1name||'');if(seen.has(key))continue;seen.add(key);
  if(!(cn in cidx)){cidx[cn]=countries.length;countries.push([cn,(p.iso_a2&&p.iso_a2!=='-99')?p.iso_a2:'']);}
  out.push([p.nameascii,p.name!==p.nameascii?p.name:0,cidx[cn],+p.latitude.toFixed(2),+p.longitude.toFixed(2),p.adm1name||0]);}
fs.writeFileSync(__dirname+'/../client/data.js','const MAP={w:'+W+',h:'+H+',top:'+LAT_TOP+',bot:'+LAT_BOT+',d:"'+d+'"};\nconst COUNTRIES='+JSON.stringify(countries)+';\nconst CITIES='+JSON.stringify(out)+';\n');
console.log('H',H,'path',d.length,'cities',out.length,'countries',countries.length,'bytes',fs.statSync(__dirname+'/../client/data.js').size);
