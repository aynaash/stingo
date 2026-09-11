export const page = String.raw`<!doctype html>
<html><head><meta charset="utf-8"><title>stingo studio</title>
<style>
  :root { --bg:#0b0a14; --surface:#15132a; --border:#2e2a52; --text:#f4f2ff; --muted:#8a85ab; --accent:#a78bfa; --accent2:#2dd4bf; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 ui-monospace,"JetBrains Mono",Menlo,monospace; }
  header { display:flex; align-items:center; gap:16px; padding:12px 20px; border-bottom:1px solid var(--border); background:var(--surface); flex-wrap:wrap; }
  h1 { font-size:15px; margin:0; font-weight:800; letter-spacing:-.02em; }
  h1 span { color:var(--accent); }
  .dim { color:var(--muted); font-size:12px; }
  main { display:flex; gap:24px; padding:24px; align-items:flex-start; flex-wrap:wrap; }
  .stage { background:#000; border:1px solid var(--border); border-radius:12px; overflow:hidden; line-height:0; position:relative; }
  .stage img { display:block; max-height:74vh; width:auto; }
  .side { flex:1; min-width:280px; display:flex; flex-direction:column; gap:16px; }
  .panel { border:1px solid var(--border); border-radius:12px; background:var(--surface); padding:14px; }
  .panel h2 { font-size:11px; text-transform:uppercase; letter-spacing:.12em; color:var(--muted); margin:0 0 10px; }
  .cue { display:flex; gap:8px; align-items:center; padding:5px 8px; border-radius:6px; cursor:pointer; font-size:12px; }
  .cue:hover { background:#1e1a38; }
  .cue.on { background:#2a2450; color:var(--accent); }
  .cue b { font-weight:600; min-width:74px; }
  .cue .t { color:var(--muted); margin-left:auto; font-size:11px; }
  .controls { display:flex; align-items:center; gap:12px; padding:14px 20px; border-top:1px solid var(--border); background:var(--surface); position:sticky; bottom:0; }
  button { background:var(--accent); color:#140f2b; border:0; border-radius:8px; padding:8px 16px; font:inherit; font-weight:700; cursor:pointer; }
  button.ghost { background:transparent; color:var(--text); border:1px solid var(--border); font-weight:400; }
  input[type=range] { flex:1; accent-color:var(--accent); }
  .ruler { position:relative; height:22px; margin-top:6px; }
  .ruler i { position:absolute; top:0; width:1px; height:7px; background:var(--border); }
  .ruler i.bar { height:13px; background:var(--accent2); opacity:.55; }
  .ruler u { position:absolute; top:0; height:22px; width:2px; background:var(--accent); }
  kbd { background:#1e1a38; border:1px solid var(--border); border-radius:4px; padding:1px 5px; font-size:11px; }
  .err { color:#fb7185; }
</style></head><body>
<header>
  <h1><span>stingo</span> studio</h1>
  <div class="dim" id="info">loading…</div>
  <div class="dim" style="margin-left:auto"><kbd>space</kbd> play <kbd>←</kbd><kbd>→</kbd> step <kbd>shift</kbd> ×10</div>
</header>
<main>
  <div class="stage"><img id="frame" alt=""></div>
  <div class="side">
    <div class="panel"><h2>timeline</h2><div id="cues"></div></div>
    <div class="panel"><h2>taste</h2><div id="taste" class="dim"></div></div>
    <div class="panel" id="warnpanel" style="display:none"><h2>warnings</h2><div id="warns" class="dim"></div></div>
  </div>
</main>
<div class="controls">
  <button id="play">▶ play</button>
  <button class="ghost" id="reload">↻</button>
  <input type="range" id="scrub" min="0" max="0" value="0">
  <div class="dim" id="time" style="min-width:130px;text-align:right"></div>
</div>
<script>
let M=null, f=0, playing=false, timer=null, inflight=false, pending=null;
const $=id=>document.getElementById(id);
const fmt=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0')+'.'+String(Math.floor(s*100%100)).padStart(2,'0');

async function meta(){
  M=await (await fetch('/meta')).json();
  $('scrub').max=M.frames-1;
  $('info').textContent=M.full.w+'×'+M.full.h+' @'+M.fps+'fps · '+M.frames+' frames · '+fmt(M.duration)+' · '+M.bpm+' BPM · cuts on '+M.cutOn;
  $('taste').innerHTML='<b style="color:var(--text)">'+M.taste.name+'</b> ('+M.taste.id+')<br>'+
    Object.entries(M.taste.palette).map(([k,v])=>'<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0"><i style="width:10px;height:10px;border-radius:2px;background:'+v+';display:inline-block"></i>'+k+'</span>').join('');
  $('cues').innerHTML=M.cues.map(c=>'<div class="cue" data-s="'+c.start+'" data-i="'+c.index+'"><b>'+c.block+'</b><span class="dim">'+c.id+'</span><span class="t">'+c.dur.toFixed(2)+'s</span></div>').join('');
  document.querySelectorAll('.cue').forEach(el=>el.onclick=()=>go(Math.round(el.dataset.s*M.fps)));
  if(M.warnings&&M.warnings.length){ $('warnpanel').style.display=''; $('warns').innerHTML=M.warnings.map(w=>'<div class="err">'+w+'</div>').join(''); }
  else $('warnpanel').style.display='none';
  draw();
}
function draw(){
  if(inflight){ pending=f; return; }
  inflight=true;
  const img=new Image();
  const want=f;
  img.onload=()=>{ $('frame').src=img.src; inflight=false; if(pending!=null&&pending!==want){const p=pending;pending=null;f=p;draw();} else pending=null; };
  img.onerror=()=>{ inflight=false; };
  img.src='/frame?n='+want+'&v='+(M?M.version:0);
  const t=want/(M?M.fps:30);
  $('time').textContent=fmt(t)+' · f'+want;
  $('scrub').value=want;
  if(M){ const cur=M.cues.find(c=>t>=c.start&&t<c.end);
    document.querySelectorAll('.cue').forEach(el=>el.classList.toggle('on',cur&&+el.dataset.i===cur.index)); }
}
function go(n){ f=Math.max(0,Math.min((M?M.frames:1)-1,n)); draw(); }
$('scrub').oninput=e=>go(+e.target.value);
$('reload').onclick=()=>meta();
$('play').onclick=()=>{
  playing=!playing; $('play').textContent=playing?'❚❚ pause':'▶ play';
  if(playing){ timer=setInterval(()=>{ if(f>=M.frames-1){go(0);} else go(f+1); },1000/(M?M.fps:30)); }
  else clearInterval(timer);
};
addEventListener('keydown',e=>{
  if(e.code==='Space'){e.preventDefault();$('play').click();}
  if(e.key==='ArrowRight')go(f+(e.shiftKey?10:1));
  if(e.key==='ArrowLeft')go(f-(e.shiftKey?10:1));
});
meta();
setInterval(async()=>{ const m=await (await fetch('/meta')).json(); if(M&&m.version!==M.version) meta(); },1200);
</script></body></html>`;
