const COMPANY = "Sakib Apparels Ltd";
const ORDERS = [];
function setOrderCount(n){ n=Math.max(1,Math.min(200,n|0)); ORDERS.length=0; for(let i=1;i<=n;i++) ORDERS.push({id:i}); }
setOrderCount(6);
const COLS = [["qty","Qty"],["cutting","Cutting"],["print","Print"],["sewing","Sewing"],["finishing","Finishing"]];
// ---------- cloud data (Google Sheet via Apps Script) ----------
let CACHE={}, PASS="";
const clone=x=>JSON.parse(JSON.stringify(x));
function load(){ return clone(CACHE); }
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cleanRow=r=>{ const o={}; if(r) Object.keys(r).sort().forEach(k=>{ if(r[k]!==""&&r[k]!=null) o[k]=r[k]; }); return o; }; // sorted keys: equal data always compares equal
function getRow(d,o,i){ return (d[o]&&d[o][i])||{}; }
async function api(payload){
  const res=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify(Object.assign({password:PASS},payload))});
  const j=await res.json();
  if(!j.ok) throw new Error(j.error||"Request failed");
  return j;
}
async function pool(items,n,fn){
  let k=0; await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{ while(k<items.length){ await fn(items[k++]); } }));
}
async function getImage(id){
  try{ const c=localStorage.getItem("img_"+id); if(c) return c; }catch(e){}
  const j=await api({action:"image",id});
  try{ localStorage.setItem("img_"+id,j.data); }catch(e){}
  return j.data;
}
async function loadAll(){ await applyLoad(await api({action:"load"})); }
async function applyLoad(j){
  let cnt=j.meta._count||6; j.rows.forEach(r=>{ cnt=Math.max(cnt,r.o); }); setOrderCount(cnt);
  const d={_n:j.meta._n||{},_dates:j.meta._dates||{},_titles:j.meta._titles||{},_notes:j.meta._notes||{},_updated:j.meta._updated||{},_products:j.meta._products||{}}, withImg=[];
  j.rows.forEach(r=>{
    const {o,i,...rest}=r; const row=cleanRow(rest);
    (d[o]=d[o]||{})[i]=row; if(row.imgId) withImg.push(row);
  });
  await pool(withImg,6,async row=>{ try{ row.img=await getImage(row.imgId); }catch(e){} });
  CACHE=d; saveDataCache();
}
// sends only what changed since the last load/save
async function save(d){
  try{
    const old=CACHE, changed=[], removed=[];
    const idByData=new Map();
    Object.keys(old).forEach(o=>{ if(!(+o>0))return; Object.values(old[o]).forEach(r=>{ if(r&&r.img&&r.imgId) idByData.set(r.img,r.imgId); }); });
    const ordList=[...new Set([...ORDERS.map(o=>o.id),...Object.keys(old).filter(k=>+k>0).map(Number)])].map(id=>({id}));
    for(const o of ordList){
      const keys=new Set([...Object.keys(old[o.id]||{}),...Object.keys(d[o.id]||{})]);
      for(const k of keys){
        const x=cleanRow(old[o.id]&&old[o.id][k]), y=cleanRow(d[o.id]&&d[o.id][k]);
        if(JSON.stringify(x)===JSON.stringify(y)) continue;
        if(!Object.keys(y).length){ removed.push({o:o.id,i:+k}); continue; }
        const item={o:o.id,i:+k};
        COLS.forEach(([c])=>{ item[c]=y[c]||""; }); item.name=y.name||""; item.products=y.products||"";
        if(y.img){ const kid=idByData.get(y.img); if(kid) item.imgId=kid; else item.imgData=y.img; }
        else item.clearImg=true;
        changed.push(item);
      }
    }
    const binned=(d._bin||[]).map(b=>{ const x=Object.assign({},b); delete x.img; if(b.img){ const kid=idByData.get(b.img); if(kid) x.imgId=kid; else x.imgData=b.img; } return x; });
    const res=await api({action:"save",changed,removed,binned,meta:{_n:d._n||{},_dates:d._dates||{},_titles:d._titles||{},_notes:d._notes||{},_products:d._products||{},_count:ORDERS.length}});
    // no second round trip: keep our copy, add the picture ids the server just created
    const nd=clone(d); delete nd._bin;
    Object.keys(res.ids||{}).forEach(k=>{ const [o,i]=k.split("_"); if(nd[o]&&nd[o][i]) nd[o][i].imgId=res.ids[k]; });
    CACHE=nd; saveDataCache();
    return true;
  }catch(e){ alert("Could not save: "+(e.message||e)); return false; }
}

// ---------- login gate + start ----------
function gate(html){
  const e=document.createElement("div"); e.className="gate"; e.innerHTML='<div class="gate-box">'+html+'</div>';
  document.body.appendChild(e); return e;
}
async function tryAuth(pw){
  PASS=pw;
  try{ return (await api({action:"auth"})).role; }catch(e){ PASS=""; throw e; }
}
function loginBox(role){
  return new Promise(res=>{
    const e=gate('<div class="brand" style="justify-content:center;color:#1d4ed8;margin-bottom:14px">Sakib <b>Apparels</b></div><h3>'+(role==="admin"?"Admin login":"Enter password")+'</h3><p>'+(role==="admin"?"Enter the admin password to manage orders.":"This page is private. Enter the password you were given.")+'</p><div class="pwbox"><input type="password" id="gp" placeholder="Password" autocomplete="current-password"><button type="button" class="pweye" id="geye" aria-label="Show password" title="Show password">Show</button></div><div class="gate-err" id="ge"></div><button class="btn lg" id="gb">Unlock</button>');
    const inp=e.querySelector("#gp"), err=e.querySelector("#ge"), btn=e.querySelector("#gb"), eye=e.querySelector("#geye");
    eye.onclick=()=>{ const show=inp.type==="password"; inp.type=show?"text":"password"; eye.textContent=show?"Hide":"Show"; eye.setAttribute("aria-label",show?"Hide password":"Show password"); eye.title=eye.getAttribute("aria-label"); inp.focus(); };
    const go=async()=>{
      if(!inp.value)return; btn.disabled=true; btn.textContent="Checking...";
      try{
        const r=await tryAuth(inp.value);
        if(role==="admin"&&r!=="admin"){ PASS=""; throw new Error("That password cannot open the Admin Panel."); }
        try{ sessionStorage.setItem("pw",inp.value); }catch(x){}
        e.remove(); res(r); return;
      }catch(x){ err.textContent=/attempts|cannot open/.test(x.message)?x.message:(x.message==="Wrong password"?"Wrong password. Please try again.":"Could not connect. Check your internet."); }
      btn.disabled=false; btn.textContent="Unlock"; inp.select();
    };
    btn.onclick=go; inp.onkeydown=ev=>{ if(ev.key==="Enter")go(); }; inp.focus();
  });
}
const DATA_KEY="data_v1", IDLE_MS=30*60*1000;
// last-seen copy (without pictures) so the site can show something immediately
function saveDataCache(){
  try{ const d=clone(CACHE); Object.keys(d).forEach(o=>{ if(+o>0) Object.values(d[o]).forEach(r=>{ delete r.img; }); });
    localStorage.setItem(DATA_KEY,JSON.stringify({d,count:ORDERS.length})); }catch(e){}
}
function loadDataCache(){
  try{ const c=JSON.parse(localStorage.getItem(DATA_KEY)||"null"); if(!c||!c.d) return false;
    setOrderCount(c.count||6);
    Object.keys(c.d).forEach(o=>{ if(+o>0) Object.values(c.d[o]).forEach(r=>{ if(r&&r.imgId){ const im=localStorage.getItem("img_"+r.imgId); if(im) r.img=im; } }); });
    CACHE=c.d; return true; }catch(e){ return false; }
}
function doLogout(){
  try{ sessionStorage.removeItem("pw"); Object.keys(localStorage).filter(k=>k.startsWith("img_")||k===DATA_KEY).forEach(k=>localStorage.removeItem(k)); }catch(x){}
  location.reload();
}
function addLogout(){
  const nav=document.querySelector(".nav"); if(!nav||nav.querySelector(".lo")) return;
  const a=document.createElement("a"); a.href="#"; a.className="lo"; a.textContent="Log out"; a.onclick=ev=>{ ev.preventDefault(); doLogout(); }; nav.appendChild(a);
}
// log out after 30 minutes without activity (never while there are unsaved changes)
function watchIdle(){
  let last=Date.now(); ["mousemove","keydown","click","touchstart","scroll"].forEach(ev=>addEventListener(ev,()=>{ last=Date.now(); },{passive:true}));
  setInterval(()=>{ if(Date.now()-last>IDLE_MS && !(window.__dirty&&window.__dirty())) doLogout(); },30000);
}
function chip(text){ const e=document.createElement("div"); e.className="syncchip"; e.textContent=text; document.body.appendChild(e); return e; }
async function start(role,fn){
  if(!SCRIPT_URL||SCRIPT_URL.startsWith("PASTE")){
    gate('<h3>Cloud not set up yet</h3><p>Open <b>SETUP.md</b>, follow the steps, and paste your Web App URL into <b>sheets-config.js</b>.</p>'); return; }
  let r=null, saved=""; try{ saved=sessionStorage.getItem("pw")||""; }catch(e){}
  // viewers: show the last-seen data at once, then refresh quietly in the background
  if(role!=="admin" && saved && loadDataCache()){
    PASS=saved; addLogout(); watchIdle(); document.body.classList.add("ready"); fn();
    const c=chip("Updating...");
    try{ await tryAuth(saved); await loadAll(); fn(); c.remove(); }
    catch(e){ if(/password|attempts/i.test(e.message)){ doLogout(); return; } c.textContent="Offline - showing saved data"; setTimeout(()=>c.remove(),4000); }
    return;
  }
  // the page content stays hidden (style.css: body:not(.ready) main) until the password is confirmed
  if(saved){ const ck=gate('<h3>Checking...</h3><p>One moment</p>'); try{ r=await tryAuth(saved); }catch(e){} ck.remove(); }
  while(!r||(role==="admin"&&r!=="admin")) r=await loginBox(role);
  const ld=gate('<h3>Loading...</h3><p>Fetching your orders</p>');
  try{ await loadAll(); }catch(e){ ld.querySelector(".gate-box").innerHTML='<h3>Could not load data</h3><p>'+(e.message||e)+'</p>'; return; }
  ld.remove();
  addLogout(); watchIdle();
  document.body.classList.add("ready");
  fn();
}
// downscale to keep localStorage small
function readImage(file, max=700){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onerror=rej;
    fr.onload=()=>{ const img=new Image(); img.onerror=rej;
      img.onload=()=>{ const s=Math.min(1,max/Math.max(img.width,img.height));
        const c=document.createElement("canvas"); c.width=img.width*s; c.height=img.height*s;
        c.getContext("2d").drawImage(img,0,0,c.width,c.height); res(c.toDataURL("image/jpeg",.75)); };
      img.src=fr.result; };
    fr.readAsDataURL(file);
  });
}
function designCount(d,o){
  if(d._n&&d._n[o.id]!=null) return d._n[o.id];
  let m=0; const rows=d[o.id]||{};
  for(const k in rows) if(Object.keys(rows[k]).length) m=Math.max(m,+k);
  return m;
}
// ===== design viewer / editor modal =====
const Viewer={
  cfg:null,i:1,el:null,
  ensure(){
    if(this.el)return;
    const e=document.createElement("div"); e.className="vw";
    e.innerHTML='<div class="vw-panel"></div><input type="file" accept="image/*" hidden>';
    e.addEventListener("mousedown",ev=>{ if(ev.target===e) this.close(); });
    document.body.appendChild(e); this.el=e;
    this.file=e.querySelector("input");
    this.file.onchange=async()=>{ const f=this.file.files[0]; if(!f)return; this.cfg.setImage(this.i,await readImage(f,700)); this.render(); };
    document.addEventListener("keydown",ev=>{
      if(!this.cfg)return;
      if(ev.key==="Escape")this.close();
      if(!/INPUT|TEXTAREA/.test(document.activeElement.tagName)){
        if(ev.key==="ArrowLeft")this.go(-1); if(ev.key==="ArrowRight")this.go(1); }
    });
  },
  open(cfg,i){ this.ensure(); this.cfg=cfg; this.i=i; this.el.classList.add("open"); document.body.style.overflow="hidden"; this.render(); },
  close(){ if(!this.cfg)return; this.el.classList.remove("open"); document.body.style.overflow=""; const c=this.cfg; this.cfg=null; c.onClose&&c.onClose(); },
  go(d){ const n=this.i+d; if(n<1||n>this.cfg.count())return; this.i=n; this.render(true); },
  render(slide){
    const c=this.cfg, r=c.get(this.i), p=this.el.querySelector(".vw-panel"), ed=c.edit;
    const img=r.img
      ? `<img class="vw-img" src="${r.img}" alt="Design ${this.i}">`
      : `<div class="vw-none">No image yet</div>`;
    const tools=ed?`<div class="vw-tools"><button class="btn" id="vw-up">${r.img?"Replace image":"Upload image"}</button>${r.img?'<button class="btn sec" id="vw-rm">Remove image</button>':""}${c.remove?'<button class="btn danger" id="vw-del">Delete design</button>':""}</div>`:"";
    const fields=COLS.map(([k,l])=>ed
      ?`<label class="vw-f"><span>${l}</span><input class="cell" data-k="${k}" value="${esc(r[k])}"></label>`
      :`<div class="vw-f"><span>${l}</span><strong>${r[k]?esc(r[k]):"&mdash;"}</strong></div>`).join("");
    const foot=ed?`<div class="vw-foot"><span class="status" id="vw-st">${c.dirty()?"Unsaved changes":"All changes saved"}</span><button class="btn lg" id="vw-save">Save</button></div>`:"";
    p.innerHTML=`<button class="vw-x" aria-label="Close">&times;</button>
      <div class="vw-head"><button class="vw-nav" id="vw-prev" ${this.i<=1?"disabled":""}>&lsaquo;</button><div class="vw-title">Design ${this.i}<small> of ${c.count()}</small>${ed?'<em>Editor</em>':""}</div><button class="vw-nav" id="vw-next" ${this.i>=c.count()?"disabled":""}>&rsaquo;</button></div>
      ${ed?`<div class="vw-namerow"><label class="vw-name"><span>Product name</span><input class="cell" data-k="name" placeholder="e.g. Red polo shirt" value="${esc(r.name)}"></label><label class="vw-name vw-pc"><span>Products</span><input class="cell" data-k="products" inputmode="numeric" placeholder="e.g. 12" value="${esc(r.products)}"></label></div>`:((r.name||r.products)?`<div class="vw-pname">${esc(r.name)}${pcBadge(r.products)}</div>`:"")}
      <div class="vw-stage ${slide?"slide":""}">${img}</div>${tools}
      <div class="vw-details">${fields}</div>${foot}`;
    p.querySelector(".vw-x").onclick=()=>this.close();
    p.querySelector("#vw-prev").onclick=()=>this.go(-1);
    p.querySelector("#vw-next").onclick=()=>this.go(1);
    if(ed){
      const st=p.querySelector("#vw-st"), dirtyNow=()=>{st.textContent="Unsaved changes";st.className="status dirty"};
      p.querySelector("#vw-up").onclick=()=>{this.file.value="";this.file.click()};
      const rm=p.querySelector("#vw-rm"); if(rm) rm.onclick=()=>{ if(confirm("Remove this image?")){ c.setImage(this.i,""); this.render(); } };
      p.querySelectorAll("input.cell").forEach(inp=>inp.oninput=()=>{ c.setField(this.i,inp.dataset.k,inp.value.trim()); dirtyNow(); });
      const dl=p.querySelector("#vw-del"); if(dl) dl.onclick=()=>{ Promise.resolve(c.remove(this.i)).then(ok=>{ if(!ok)return; const n=c.count(); if(!n){this.close();return;} if(this.i>n)this.i=n; this.render(); }); };
      p.querySelector("#vw-save").onclick=async()=>{ if(await c.save()){ st.textContent="Saved"; st.className="status ok"; } };
    }
  }
};

function confirmBox(msg,yes="Delete",note="This cannot be undone."){
  return new Promise(res=>{
    const e=document.createElement("div"); e.className="cf";
    e.innerHTML='<div class="cf-box"><div class="cf-ico">!</div><h3>'+msg+'</h3><p>'+note+'</p><div class="cf-btns"><button class="btn sec" id="cf-no">Cancel</button><button class="btn danger" id="cf-yes">'+yes+'</button></div></div>';
    document.body.appendChild(e);
    const done=v=>{e.remove();document.removeEventListener("keydown",k,true);res(v)};
    const k=ev=>{ if(ev.key==="Escape"){ev.stopPropagation();done(false)} };
    document.addEventListener("keydown",k,true);
    e.querySelector("#cf-no").onclick=()=>done(false); e.querySelector("#cf-yes").onclick=()=>done(true);
    e.addEventListener("mousedown",ev=>{ if(ev.target===e) done(false); });
    e.querySelector("#cf-no").focus();
  });
}

function fmtDate(s){ if(!s)return ""; const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}); }

// ===== recovery panels (admin) =====
function fmtWhen(iso){ const d=new Date(iso); return isNaN(d)?iso:d.toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
function panel(title){
  const e=document.createElement("div"); e.className="gate pn";
  e.innerHTML='<div class="gate-box pn-box"><button class="vw-x" aria-label="Close">&times;</button><h3>'+title+'</h3><div class="pn-result" hidden></div><div class="pn-body">Loading...</div></div>';
  document.body.appendChild(e);
  const close=()=>e.remove(); e.querySelector(".vw-x").onclick=close;
  e.addEventListener("mousedown",ev=>{ if(ev.target===e) close(); });
  return {el:e, body:e.querySelector(".pn-body"), result:e.querySelector(".pn-result"), close};
}
// what is different between two copies of the data
function diffData(a,b){
  const strip=r=>{ const x=cleanRow(r); delete x.img; return x; };
  const res={added:[],removed:[],changed:[],dates:[],orders:[]};
  const ids=new Set([...Object.keys(a),...Object.keys(b)].filter(k=>+k>0).map(Number));
  [...ids].sort((p,q)=>p-q).forEach(o=>{
    const A=a[o]||{}, B=b[o]||{};
    [...new Set([...Object.keys(A),...Object.keys(B)])].sort((p,q)=>p-q).forEach(k=>{
      const x=strip(A[k]), y=strip(B[k]), hx=Object.keys(x).length, hy=Object.keys(y).length;
      if(!hx&&hy) res.added.push({o,i:+k,name:y.name});
      else if(hx&&!hy) res.removed.push({o,i:+k,name:x.name});
      else if(hx&&hy&&JSON.stringify(x)!==JSON.stringify(y)) res.changed.push({o,i:+k,name:y.name});
    });
  });
  const da=a._dates||{}, db=b._dates||{};
  [...new Set([...Object.keys(da),...Object.keys(db)])].forEach(o=>{ if(da[o]!==db[o]) res.dates.push({o:+o,from:da[o],to:db[o]}); });
  return res;
}
function resultHtml(title,sum,extra){
  const lab=x=>'Order '+x.o+' &middot; Design '+x.i+(x.name?' &ldquo;'+esc(x.name)+'&rdquo;':'');
  const lines=[];
  sum.added.slice(0,12).forEach(x=>lines.push('<li class="add"><b>Added</b> '+lab(x)+'</li>'));
  sum.changed.slice(0,12).forEach(x=>lines.push('<li class="chg"><b>Updated</b> '+lab(x)+'</li>'));
  sum.removed.slice(0,12).forEach(x=>lines.push('<li class="rem"><b>Removed</b> '+lab(x)+'</li>'));
  sum.dates.forEach(x=>lines.push('<li class="chg"><b>Date</b> Order '+x.o+': '+esc(x.from||"none")+' &rarr; '+esc(x.to||"none")+'</li>'));
  const more=sum.added.length+sum.changed.length+sum.removed.length-Math.min(sum.added.length,12)-Math.min(sum.changed.length,12)-Math.min(sum.removed.length,12);
  if(more>0) lines.push('<li>&hellip; and '+more+' more</li>');
  return '<b>'+esc(title)+'</b>'+(lines.length?'<ul>'+lines.join("")+'</ul><small>The changed designs are highlighted in the table.</small>':'<p>No visible difference: your data already matched this version.</p>')+(extra?'<small>'+extra+'</small>':'');
}
function showResult(p,html){ p.result.innerHTML=html; p.result.hidden=false; p.el.querySelector(".pn-box").scrollTop=0; p.el.scrollTop=0; }

async function openBin(onChange){
  const p=panel("Recycle bin");
  const draw=async()=>{
    let items; try{ items=(await api({action:"bin"})).items; }catch(e){ p.body.textContent="Could not load: "+e.message; return; }
    if(!items.length){ p.body.innerHTML='<p class="pn-empty">The recycle bin is empty.<br>Deleted designs are kept here for 30 days.</p>'; return; }
    p.body.innerHTML='<p class="pn-note">Deleted designs are kept for 30 days, then removed for good.</p>'+items.map(it=>
      '<div class="pn-row" data-k="'+esc(it.key)+'" data-name="'+esc(it.name||("Design "+it.i))+'"><div class="pn-img">'+(it.imgId?'<img data-id="'+esc(it.imgId)+'" alt="">':'<span>no image</span>')+'</div>'+
      '<div class="pn-info"><b>'+esc(it.name||("Design "+it.i))+'</b><small>Order '+it.o+' &middot; was Design '+it.i+' &middot; deleted '+esc(fmtWhen(it.at))+'</small></div>'+
      '<button class="btn" data-act="restore">Restore</button><button class="btn sec del" data-act="forever">Delete forever</button></div>').join("");
    p.body.querySelectorAll("img[data-id]").forEach(async im=>{ try{ im.src=await getImage(im.dataset.id); }catch(e){} });
  };
  p.body.onclick=async e=>{
    const b=e.target.closest("button[data-act]"); if(!b)return;
    const row=b.closest(".pn-row"), key=row.dataset.k, nm=row.dataset.name;
    if(b.dataset.act==="restore"){
      b.disabled=true; b.textContent="Restoring...";
      try{ const res=await api({action:"restore",keys:[key]}); const sum=await onChange(res); showResult(p,resultHtml('Restored "'+nm+'"',sum)); }
      catch(x){ alert(x.message); }
      await draw();
    }else{
      if(!(await confirmBox("Delete this design forever?","Delete forever","It will be removed for good."))) return;
      b.disabled=true;
      try{ await api({action:"binDelete",keys:[key]}); showResult(p,'<b>Deleted "'+esc(nm)+'" forever</b>'); }
      catch(x){ alert(x.message); }
      await draw();
    }
  };
  draw();
}

async function openHistory(onChange){
  const p=panel("Version history");
  const draw=async()=>{
    let items; try{ items=(await api({action:"history"})).items; }catch(e){ p.body.textContent="Could not load: "+e.message; return; }
    if(!items.length){ p.body.innerHTML='<p class="pn-empty">No saved versions yet.<br>A version is stored automatically before every save.</p>'; return; }
    p.body.innerHTML='<p class="pn-note">A copy is stored before every save (last 15). Restoring one brings back the names, quantities, dates and pictures from that moment. Your current data is stored first, so you can undo a restore too.</p>'+
      items.map(it=>'<div class="pn-row" data-t="'+esc(it.time)+'"><div class="pn-info"><b>'+esc(fmtWhen(it.time))+'</b><small>'+esc(it.what)+'</small></div><button class="btn sec" data-act="rb">Restore this version</button></div>').join("");
  };
  p.body.onclick=async e=>{
    const b=e.target.closest("button[data-act]"); if(!b)return; const t=b.closest(".pn-row").dataset.t;
    if(!(await confirmBox("Restore the version from "+fmtWhen(t)+"?","Restore","Your current data is stored first, so you can undo this."))) return;
    b.disabled=true; b.textContent="Restoring...";
    try{ const res=await api({action:"rollback",time:t}); const sum=await onChange(res); showResult(p,resultHtml("Restored the version from "+fmtWhen(t),sum,"Your previous data is stored at the top of this list, so you can undo this.")); }
    catch(x){ alert(x.message); }
    await draw();
  };
  draw();
}

// ===== helpers: totals, progress, dates =====
function num(v){ const n=parseFloat(String(v==null?"":v).replace(/,/g,"")); return isNaN(n)?0:n; }
function pct(a,b){ return b>0?Math.max(0,Math.min(100,Math.round(a/b*100))):null; }
function orderStats(d,o){
  const t={designs:designCount(d,o),qty:0,cutting:0,print:0,sewing:0,finishing:0};
  for(let i=1;i<=t.designs;i++){ const r=getRow(d,o.id,i); COLS.forEach(([k])=>{ t[k]+=num(r[k]); }); }
  t.pct=pct(t.finishing,t.qty); return t;
}
function fmtNum(n){ return Number(n).toLocaleString("en-US",{maximumFractionDigits:2}); }
// product count shown beside the name, bigger than it
function pcBadge(v){ return v?'<span class="pc"><b>'+esc(v)+'</b><small>'+(num(v)===1?"product":"products")+'</small></span>':""; }
function bar(p){ return p==null?'<span class="empty">&mdash;</span>':'<div class="pbar"><i style="width:'+p+'%"></i></div><small class="ptxt">'+p+'%</small>'; }
