// Home page content from the editor (link/editor): edited texts, added sections and the section order.
// Visitors: the last copy on this device is shown at once, then refreshed from the Google Sheet now and then.
// Editor: the page is loaded inside editor.html, which drives it through window.SITE.
(function(){
  const CACHE_KEY="site_v1", FRESH_MS=5*60*1000;
  const BUILTIN=["top","about","products","clients","numbers","contact"];
  const LABELS={top:"Top (photo slider)",about:"About Us",products:"Our Products",clients:"Our Clients",numbers:"In numbers",contact:"Contact Us"};
  const editing=/[?&]edit\b/.test(location.search) && window.parent!==window;
  const ORIG={}; // texts as written in index.html, so only real changes are stored
  document.querySelectorAll("[data-edit]").forEach(el=>{ ORIG[el.dataset.edit]=readText(el); });
  const ORIG_IMG={}; // pictures as in index.html (src, or background for the hero slides)
  document.querySelectorAll("[data-img-edit]").forEach(el=>{ ORIG_IMG[el.dataset.imgEdit]=el.tagName==="IMG"?el.getAttribute("src"):el.style.backgroundImage; });
  let current={texts:{},sections:[],order:[],images:{}}, editApi=null;

  function readText(el){ return el.innerText.replace(/ /g," ").replace(/\n{3,}/g,"\n\n").trim(); }
  function writeText(el,text){
    el.textContent="";
    String(text).split("\n").forEach((line,i)=>{ if(i) el.appendChild(document.createElement("br")); el.appendChild(document.createTextNode(line)); });
    if(el.matches(".num b")){ const m=/^([\d,]+)(.*)$/.exec(String(text).trim()); if(m){ el.dataset.to=m[1].replace(/,/g,""); el.dataset.suffix=m[2]; } }
  }
  function setImg(el,url,isOrig){
    if(el.tagName==="IMG"){ el.removeAttribute("srcset"); el.src=url; }
    else el.style.backgroundImage=isOrig?url:"url('"+url+"')";
  }
  function imgUrl(id){ return window.SITE_IMG_BASE ? window.SITE_IMG_BASE+encodeURIComponent(id) : "https://lh3.googleusercontent.com/d/"+encodeURIComponent(id)+"=w1600"; } // SITE_IMG_BASE: only set by the local test server
  function paragraphs(text){ // blank line = new paragraph, single line break = <br>
    const frag=document.createDocumentFragment();
    String(text||"").split(/\n\s*\n/).filter(p=>p.trim()).forEach(p=>{ const el=document.createElement("p"); writeText(el,p.trim()); frag.appendChild(el); });
    return frag;
  }
  function renderSection(sec){
    const el=document.createElement("section");
    el.className="block csec bg-"+sec.bg; el.id=sec.id; el.dataset.custom="1";
    const wrap=document.createElement("div"); wrap.className="wrap csec-in lay-"+(sec.img?sec.layout:"none");
    if(sec.img && sec.layout!=="none"){
      const pic=document.createElement("div"); pic.className="csec-img";
      const im=document.createElement("img"); im.src=imgUrl(sec.img); im.alt=sec.title||""; im.loading="lazy";
      im.onerror=()=>{ if(!im.dataset.alt){ im.dataset.alt="1"; im.src="https://drive.google.com/thumbnail?id="+encodeURIComponent(sec.img)+"&sz=w1600"; } };
      pic.appendChild(im); wrap.appendChild(pic);
    }
    const txt=document.createElement("div"); txt.className="csec-txt";
    if(sec.title){ const h=document.createElement("h2"); h.textContent=sec.title; txt.appendChild(h); }
    txt.appendChild(paragraphs(sec.text));
    wrap.appendChild(txt); el.appendChild(wrap);
    return el;
  }
  // put every section in the saved order; sections the order does not mention keep their usual place
  function arrange(order){
    const footer=document.querySelector("footer");
    const exists=id=>!!document.getElementById(id);
    const list=(order||[]).filter(exists);
    BUILTIN.forEach((b,i)=>{
      if(list.includes(b)||!exists(b)) return;
      const prev=BUILTIN.slice(0,i).reverse().find(p=>list.includes(p));
      list.splice(prev?list.indexOf(prev)+1:0,0,b);
    });
    document.querySelectorAll("section[data-custom]").forEach(s=>{
      if(list.includes(s.id)) return;
      const c=list.indexOf("contact"); list.splice(c>=0?c:list.length,0,s.id);
    });
    list.forEach(id=>document.body.insertBefore(document.getElementById(id),footer));
    return list;
  }
  function apply(site){
    site=site||{};
    current={texts:Object.assign({},site.texts||{}),sections:(site.sections||[]).slice(),order:(site.order||[]).slice(),images:Object.assign({},site.images||{})};
    document.querySelectorAll("[data-img-edit]").forEach(el=>{ const k=el.dataset.imgEdit; if(current.images[k]) setImg(el,imgUrl(current.images[k])); else setImg(el,ORIG_IMG[k],true); });
    document.querySelectorAll("[data-edit]").forEach(el=>{ const k=el.dataset.edit; writeText(el, k in current.texts?current.texts[k]:ORIG[k]); });
    document.querySelectorAll("section[data-custom],a[data-custom-nav]").forEach(e=>e.remove());
    current.sections.forEach(sec=>document.body.appendChild(renderSection(sec)));
    current.order=arrange(current.order);
    const nav=document.getElementById("nav"), contactLink=nav&&nav.querySelector("a[href='#contact']");
    if(nav) current.sections.filter(s=>s.menu).forEach(s=>{
      const a=document.createElement("a"); a.href="#"+s.id; a.dataset.customNav="1"; a.textContent=s.menuLabel||s.title||"Section";
      nav.insertBefore(a,contactLink||null);
    });
    if(editApi) editApi.decorate();
  }

  // ---------- visitors ----------
  function cached(){ try{ return JSON.parse(localStorage.getItem(CACHE_KEY)||"null"); }catch(e){ return null; } }
  function remember(site){ try{ localStorage.setItem(CACHE_KEY,JSON.stringify({t:Date.now(),site:site})); }catch(e){} }
  async function fetchSite(){
    const res=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"site"})});
    const j=await res.json(); if(!j.ok) throw new Error(j.error||"Could not load"); return j.site;
  }
  if(!editing){
    const c=cached();
    if(c&&c.site) apply(c.site);
    if(typeof SCRIPT_URL==="string" && (!c||Date.now()-c.t>FRESH_MS)){
      fetchSite().then(site=>{ remember(site); if(JSON.stringify(site)!==JSON.stringify(c&&c.site)) apply(site); }).catch(()=>{});
    }
  }

  // ---------- editor ----------
  function enableEditing(handlers){
    document.documentElement.classList.add("site-editing");
    // links do not navigate while editing; clicking text puts the cursor in it
    document.addEventListener("click",e=>{ if(e.target.closest("a")) e.preventDefault(); },true);
    document.querySelectorAll("[data-edit]").forEach(el=>{
      el.contentEditable="true"; el.spellcheck=true;
      const multi=el.matches("p");
      el.addEventListener("keydown",e=>{ if(e.key==="Enter"&&!multi){ e.preventDefault(); el.blur(); } });
      el.addEventListener("paste",e=>{
        e.preventDefault();
        const t=(e.clipboardData||window.clipboardData).getData("text/plain");
        document.execCommand("insertText",false,multi?t:t.replace(/\s*\n\s*/g," "));
      });
      el.addEventListener("input",()=>{ el.classList.toggle("edited",readText(el)!==ORIG[el.dataset.edit]); handlers.changed(); });
    });
    editApi={
      decorate(){ // tools on added sections + "add section here" buttons
        document.querySelectorAll(".ed-tools,.ed-add,.ed-drag,.ed-img").forEach(e=>e.remove());
        addReplaceButtons(handlers);
        document.querySelectorAll("[data-edit]").forEach(el=>el.classList.toggle("edited",readText(el)!==ORIG[el.dataset.edit]));
        current.order.forEach(id=>{
          const sec=document.getElementById(id); if(!sec) return;
          addDragHandle(sec,id,handlers);
          const add=document.createElement("div"); add.className="ed-add";
          const ab=document.createElement("button"); ab.type="button"; ab.textContent="+ Add section here"; ab.onclick=()=>handlers.add(id);
          add.appendChild(ab); sec.after(add);
          if(sec.dataset.custom){
            const t=document.createElement("div"); t.className="ed-tools";
            [["edit","Edit section"],["up","Move up"],["down","Move down"],["del","Delete"]].forEach(([a,label])=>{
              const b=document.createElement("button"); b.type="button"; b.textContent=label; if(a==="del") b.className="del";
              b.onclick=()=>handlers[a](id); t.appendChild(b);
            });
            sec.prepend(t);
          }
        });
      }
    };
    editApi.decorate();
  }
  // "Replace" buttons below the pictures (they open the file picker in the editor)
  function replaceBtn(label,onClick){ const b=document.createElement("button"); b.type="button"; b.className="ed-img"; b.textContent=label;
    b.addEventListener("click",e=>{ e.preventDefault(); e.stopPropagation(); onClick(); }); return b; }
  function addReplaceButtons(handlers){
    document.querySelectorAll("img[data-img-edit]").forEach(im=>{ if(im.closest(".stack")) return; im.after(replaceBtn("Replace",()=>handlers.replaceImage(im.dataset.imgEdit))); });
    const stack=document.querySelector(".stack"); // About Us photo stack: replaces the photo at the front
    if(stack) stack.after(replaceBtn("Replace front photo",()=>{ const f=stack.querySelector('img[data-pos="0"]')||stack.querySelector("img"); handlers.replaceImage(f.dataset.imgEdit); }));
    const hero=document.querySelector(".hero"); // hero slider: replaces the photo showing now
    if(hero){ const b=replaceBtn("Replace this photo",()=>{ const sl=hero.querySelector(".slide.on")||hero.querySelector(".slide"); handlers.replaceImage(sl.dataset.imgEdit); }); b.classList.add("ed-img-hero"); hero.appendChild(b); }
    document.querySelectorAll("section[data-custom] .csec-img img").forEach(im=>im.after(replaceBtn("Replace",()=>handlers.replaceSectionImage(im.closest("section").id))));
  }
  // drag a section by its handle; a blue line shows where it will land (mouse and touch)
  function addDragHandle(sec,id,handlers){
    const h=document.createElement("button"); h.type="button"; h.className="ed-drag"; h.textContent="Drag to move"; h.title="Drag this section up or down";
    sec.prepend(h);
    h.addEventListener("pointerdown",e=>{
      e.preventDefault(); h.setPointerCapture(e.pointerId);
      const others=current.order.filter(x=>x!==id).map(x=>document.getElementById(x)).filter(Boolean);
      const line=document.createElement("div"); line.className="ed-line"; document.body.appendChild(line);
      sec.classList.add("ed-dragging");
      let y=e.clientY, index=current.order.filter(x=>x!==id).indexOf(current.order[current.order.indexOf(id)-1])+1;
      const place=()=>{
        index=others.filter(o=>{ const r=o.getBoundingClientRect(); return r.top+r.height/2<y; }).length;
        const ref=index<others.length?others[index].getBoundingClientRect().top:others[others.length-1].getBoundingClientRect().bottom;
        line.style.top=(ref+window.scrollY-3)+"px";
      };
      const scroller=setInterval(()=>{ if(y<70) window.scrollBy(0,-18); else if(y>window.innerHeight-70) window.scrollBy(0,18); place(); },30);
      const move=ev=>{ y=ev.clientY; place(); };
      const end=()=>{ clearInterval(scroller); h.removeEventListener("pointermove",move); h.removeEventListener("pointerup",end); h.removeEventListener("pointercancel",end);
        line.remove(); sec.classList.remove("ed-dragging"); handlers.reorder(id,index); };
      h.addEventListener("pointermove",move); h.addEventListener("pointerup",end); h.addEventListener("pointercancel",end);
      place();
    });
  }
  function collect(){ // what the editor publishes
    const texts={};
    document.querySelectorAll("[data-edit]").forEach(el=>{ const k=el.dataset.edit, v=readText(el); if(v!==ORIG[k]) texts[k]=v; });
    return {texts:texts,sections:current.sections,order:current.order,images:current.images};
  }
  function sectionList(){
    return current.order.map(id=>{ const s=current.sections.find(x=>x.id===id); return {id:id,label:s?(s.title||"Untitled section"):(LABELS[id]||id),custom:!!s}; });
  }

  window.SITE={apply:apply,collect:collect,enableEditing:enableEditing,sectionList:sectionList,remember:remember,imgUrl:imgUrl,editing:editing,get current(){ return current; }};
})();
