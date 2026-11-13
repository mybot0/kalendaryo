/*
 * move.js — moving people from the old address (kalendaryo-triply.onrender.com) to the new one (kalendaryo.co).
 *
 *   1. A page opened on the old address (a home link, an invite, a trip link, the start page) shows a
 *      "has a new home" page the first time on each device: nothing has changed, 3 simple steps, and a
 *      Continue button (it waits for the tap). Continue packs this device's saved lists (homes, trips,
 *      look settings) and opens the SAME page on the new address. Later visits on that device go straight
 *      through. Nothing is lost: the old links keep working forever.
 *   2. /moved on the new address unpacks the lists into this device (without overwriting anything
 *      already saved there), then opens the page the person asked for.
 *   3. A one-time note ("Save your new link", with Copy link and Got it) shows on the next page,
 *      in Kalendaryo and in Triply, until the person taps Got it.
 *
 * The data travels in the part of the address after #, which browsers never send to any server.
 * API calls on the old address keep working, so pages that are already open do not break.
 *
 * Settings (environment variables):
 *   MOVE_TO     the new address (default https://kalendaryo.co). Set to 0 to switch the move off.
 *   MOVE_FROM   which old host names to move (default: any *.onrender.com host)
 */
'use strict';

const MOVE_TO = () => {
  const v = String(process.env.MOVE_TO == null ? 'https://kalendaryo.co' : process.env.MOVE_TO).trim().replace(/\/+$/, '');
  return /^(0|off|false|no|)$/i.test(v) ? '' : v;
};
const FROM_RE = () => {
  const list = String(process.env.MOVE_FROM || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return (host) => (list.length ? list.includes(host) : /\.onrender\.com$/.test(host));
};
// The apps' own backgrounds (soft glow + faded doodles), read from their CSS so the move page matches.
const fs = require('fs');
const path = require('path');
function artFrom(file, startRe) {
  try {
    const css = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const m = css.match(startRe);
    return m ? m[1].trim() : '';
  } catch (e) { return ''; }
}
let ART = null;
const art = () => ART || (ART = {
  Kalendaryo: artFrom('client/src/styles/base.css', /--page-art:\s*([\s\S]*?);\s*\n/),
  Triply: artFrom('triply/client/src/styles/base.css', /body\s*\{[^}]*?background-image:\s*([\s\S]*?);\s*\n/)
});
const THEME = {
  Kalendaryo: { accent: '#3F7360', soft: '#E4EFE9', what: 'Your home, calendar and everything in it are exactly the same.' },
  Triply: { accent: '#B8583A', soft: '#F8E7E0', what: 'Your trips, plans, chats and everything in them are exactly the same.' }
};

const hostOf = (req) => String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');

// Is this request on the old address, and should it move?
function shouldMove(req) {
  const to = MOVE_TO();
  if (!to) return false;
  const host = hostOf(req);
  if (!host || !FROM_RE()(host)) return false;
  try { if (new URL(to).host.toLowerCase() === host) return false; } catch (e) { return false; }
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const p = String(req.url || '/').split('?')[0];
  if (p.startsWith('/api/') || p === '/api' || /^\/triply\/api(\/|$)/.test(p)) return false; // open pages keep working
  if (p === '/healthz' || p === '/triply/healthz') return false;                               // Render's health check
  return true;
}

// Old address: send the person to the same page on the new address, with this device's saved lists.
function sendMove(req, res) {
  const to = MOVE_TO();
  const pathAndQuery = String(req.url || '/').startsWith('/') ? String(req.url || '/') : '/';
  const accept = String(req.headers.accept || '');
  const dest = String(req.headers['sec-fetch-dest'] || '');
  const isPage = dest === 'document' || (!dest && accept.includes('text/html'));
  if (!isPage) { // not a browser page (a bot, a file): a plain permanent redirect
    res.writeHead(301, { Location: to + pathAndQuery, 'Cache-Control': 'no-store' });
    return res.end();
  }
  const html = movingPage(to, pathAndQuery);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; base-uri 'none'; frame-ancestors 'none'"
  });
  res.end(req.method === 'HEAD' ? undefined : html);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function movingPage(to, pathAndQuery) {
  const app = /^\/triply(\/|\?|$)/.test(pathAndQuery) ? 'Triply' : 'Kalendaryo';
  const th = THEME[app];
  const bg = art()[app];
  const cfg = JSON.stringify({ to }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><meta name="theme-color" content="#F4F3EE"><title>${app} has a new home</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700;800&family=Outfit:wght@600;700;800&display=swap">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;color:#26302B;
  font:16px/1.5 Figtree,system-ui,-apple-system,'Segoe UI',sans-serif;background-color:#F4F3EE;
  ${bg ? 'background-image:' + bg + ';background-size:auto,auto,auto,680px 680px;background-repeat:no-repeat,no-repeat,no-repeat,repeat;background-attachment:fixed;' : ''}}
.card{background:#fff;border-radius:22px;padding:30px 24px 24px;max-width:420px;width:100%;box-shadow:0 1px 2px rgba(38,48,43,.06),0 10px 30px rgba(38,48,43,.10)}
.hidden{display:none}
.pill{display:inline-flex;align-items:center;gap:8px;background:${th.accent};color:#fff;border-radius:16px;padding:6px 16px 7px 12px;box-shadow:0 2px 8px rgba(38,48,43,.15);font:800 28px/1.1 Outfit,Figtree,system-ui,sans-serif;letter-spacing:-.01em;margin:4px 0 14px}
.pill svg{width:24px;height:24px;flex:0 0 24px}
h1{font:700 24px/1.25 Outfit,Figtree,system-ui,sans-serif;margin:0 0 4px}
.addr{color:${th.accent}}
.same{display:flex;gap:10px;align-items:flex-start;background:${th.soft};border-radius:14px;padding:12px 14px;margin:16px 0;color:#26302B}
.same svg{flex:0 0 22px;width:22px;height:22px;margin-top:1px}
.same b{display:block}
h2{font:700 16px/1.3 Outfit,Figtree,system-ui,sans-serif;margin:18px 0 10px}
ol{margin:0;padding:0;list-style:none;counter-reset:s}
li{counter-increment:s;display:flex;gap:12px;align-items:flex-start;margin:0 0 12px;color:#26302B}
li:before{content:counter(s);flex:0 0 28px;height:28px;border-radius:50%;background:${th.accent};color:#fff;display:grid;place-items:center;font-weight:700;font-size:14px}
.go{display:block;width:100%;margin-top:20px;min-height:52px;border:0;border-radius:999px;background:${th.accent};color:#fff;font:inherit;font-weight:700;font-size:16px;text-align:center;line-height:52px;text-decoration:none;cursor:pointer}
.wait{text-align:center;color:#5C675F;font-weight:600}
</style>
</head><body>
<div class="card hidden" id="card">
  <div class="pill">${app === 'Triply'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12.5l17-7-5.5 14.5-3.5-5.5z"/><path d="M11 14.5L20 5.5"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2"/></svg>'}${app}</div>
  <h1>has a new home: <span class="addr">kalendaryo.co</span></h1>
  <div class="same"><svg viewBox="0 0 24 24" fill="none" stroke="${th.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>
    <span><b>Nothing has changed.</b>${th.what} Only the address is new.</span></div>
  <h2>What happens now</h2>
  <ol>
    <li><span>Tap <b>Continue</b> below.</span></li>
    <li><span>Your same page opens on <b>kalendaryo.co</b>.</span></li>
    <li><span>Save the new link: bookmark it, or add it to your home screen.</span></li>
  </ol>
  <a class="go" id="go" href="${esc(to + pathAndQuery)}">Continue to kalendaryo.co</a>
</div>
<div class="wait" id="wait">Opening ${app}…</div>
<noscript><style>#card{display:block}#wait{display:none}</style></noscript>
<script>(function(){
var C=${cfg};
var target=location.pathname+location.search+location.hash;
var go=document.getElementById('go');go.href=C.to+target;
function pack(){
  var keep={},total=0;
  try{
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);if(!k)continue;
      if(!/^(kal|tr|triply|pl)\\./.test(k))continue;      // only Kalendaryo's and Triply's own things
      if(/cache/i.test(k))continue;                       // copies of family data; the new page loads them fresh
      var v=localStorage.getItem(k);
      if(v==null||v.length>100000)continue;
      if(total+v.length>400000)continue;                  // keep the address a sensible size
      keep[k]=v;total+=v.length;
    }
  }catch(e){keep={};}
  return keep;
}
function move(){
  var data=encodeURIComponent(JSON.stringify({v:1,to:target,ls:pack()}));
  try{localStorage.setItem('kal.movedOut',String(Date.now()));}catch(e){}
  location.replace(C.to+'/moved#'+data);
}
go.addEventListener('click',function(e){e.preventDefault();move();});
var before=false;try{before=!!localStorage.getItem('kal.movedOut');}catch(e){}
if(before){move();return;}                               // seen this page before on this device: go straight through
document.getElementById('wait').className='hidden';
document.getElementById('card').className='card';
})();</script></body></html>`;
}

// New address: /moved unpacks the lists and opens the page. Nothing in this page talks to the server.
function movedPage(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
  });
  if (req.method === 'HEAD') return res.end();
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Kalendaryo</title><style>body{margin:0;background:#F4F3EE}</style></head><body>
<script>(function(){
var to='/';
try{
  var d=JSON.parse(decodeURIComponent(location.hash.slice(1)||'{}'))||{};
  if(typeof d.to==='string'&&d.to.charAt(0)==='/'&&d.to.charAt(1)!=='/'&&d.to.charAt(1)!=='\\\\'&&d.to.length<3000)to=d.to;
  var ls=d.ls&&typeof d.ls==='object'?d.ls:{};
  var parse=function(s){try{var x=JSON.parse(s);return Array.isArray(x)?x:[];}catch(e){return [];}};
  // Join two saved lists: what is already on this device first, then the ones from the old address.
  var join=function(key,idOf,max){
    if(typeof ls[key]!=='string')return;
    var here=parse(localStorage.getItem(key)),seen={},out=[];
    here.concat(parse(ls[key])).forEach(function(x){var id=x&&idOf(x);if(!id||seen[id])return;seen[id]=1;out.push(x);});
    localStorage.setItem(key,JSON.stringify(out.slice(0,max)));
  };
  join('kal.families',function(x){return x.t;},12);
  join('tr.trips',function(x){return x.tripId;},200);
  Object.keys(ls).forEach(function(k){
    if(k==='kal.families'||k==='tr.trips'||k==='kal.movedOut'||k==='kal.movedNote'||k==='kal.movedNoteSeen')return;
    if(!/^(kal|tr|triply|pl)\\./.test(k)||typeof ls[k]!=='string'||ls[k].length>100000)return;
    if(localStorage.getItem(k)==null)localStorage.setItem(k,ls[k]);   // never overwrite what is already here
  });
  if(!localStorage.getItem('kal.movedNoteSeen'))localStorage.setItem('kal.movedNote','1');
}catch(e){}
location.replace(to);
})();</script></body></html>`);
}

// The one-time note, added to Kalendaryo's and Triply's pages. It does nothing unless /moved set the flag.
function noteScript() {
  return `<script>(function(){
try{if(localStorage.getItem('kal.movedNote')!=='1')return;}catch(e){return;}
var first=location.href; // the link as it was opened, before the app changes the address
function show(){
  if(document.getElementById('kal-moved'))return;
  var dark=document.documentElement.dataset.theme==='dark';
  var acc=/^\\/triply(\\/|$)/.test(location.pathname)?'#B8583A':'#3F7360'; // the app's own color
  var box=document.createElement('div');box.id='kal-moved';box.setAttribute('role','status');
  box.style.cssText='position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;width:min(440px,calc(100% - 24px));box-sizing:border-box;padding:18px 18px 14px;border-radius:18px;font:15px/1.45 Figtree,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'+(dark?'background:#26252a;color:#f1efe9;':'background:#fff;color:#2b2a27;')+'box-shadow:0 2px 6px rgba(0,0,0,.08),0 12px 32px rgba(0,0,0,.16)';
  var t=document.createElement('div');t.style.cssText='font-weight:700;font-size:16px;margin-bottom:4px';t.textContent='Save your new link';
  var p=document.createElement('div');p.textContent='This is your link on kalendaryo.co. Bookmark it, or add it to your home screen, so you always have it.';
  var row=document.createElement('div');row.style.cssText='display:flex;gap:8px;justify-content:flex-end;margin-top:12px';
  var btn=function(label,main){var b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='min-height:44px;padding:0 18px;border-radius:999px;font-family:inherit;font-weight:600;font-size:15px;cursor:pointer;'+(main?'background:'+acc+';color:#fff;border:0':(dark?'background:transparent;color:#f1efe9;border:1px solid #55535a':'background:transparent;color:#2b2a27;border:1px solid #d9d6cc'));return b;};
  var copy=btn('Copy link',false),ok=btn('Got it',true);
  copy.onclick=function(){var u=first;var done=function(){copy.textContent='Copied';};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(u).then(done,function(){prompt('Copy this link:',u);});else prompt('Copy this link:',u);};
  ok.onclick=function(){try{localStorage.removeItem('kal.movedNote');localStorage.setItem('kal.movedNoteSeen','1');}catch(e){}box.remove();};
  row.appendChild(copy);row.appendChild(ok);box.appendChild(t);box.appendChild(p);box.appendChild(row);document.body.appendChild(box);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(show,600);});else setTimeout(show,600);
})();</script>`;
}

module.exports = { shouldMove, sendMove, movedPage, noteScript, MOVE_TO };
