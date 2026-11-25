(()=>{"use strict";
const $=id=>document.getElementById(id),KEY="koten-board-v1";
const demo={id:"demo",title:"徒然草　第七段",className:"高校2年",session:"第1時",goal:"作者の心情と表現の特徴を読み取る。",original:"つれづれなるままに、日暮らし、硯に向かひて、心にうつりゆくよしなし事を、そこはかとなく書きつくれば、あやしうこそものぐるほしけれ。",translation:"することもなく手持ち無沙汰なまま、一日中、硯に向かって、心に浮かんでは消えていく、とりとめもないことを、あてもなく書きつけていると、不思議と正気を失ったような気持ちになる。",items:[{type:"古語",term:"つれづれなり",explain:"することがなく、退屈である。所在ない。"}, {type:"文法",term:"なる",explain:"断定の助動詞「なり」連体形。直前の「つれづれ」を受ける。"}, {type:"文法",term:"こそ",explain:"係助詞。文末の「けれ」は已然形で、係り結び。"}, {type:"表現",term:"あやしう",explain:"形容詞「あやし」の連用形「怪しく」のウ音便。"}],notes:"発問：作者はなぜ「ものぐるほしけれ」と感じたのか。"}
let lessons=load();let current=null,staged=false,revealStep=3,fontScale=1,presStep=3;
function load(){try{let x=JSON.parse(localStorage.getItem(KEY));if(Array.isArray(x)&&x.length)return x}catch(e){}return [structuredClone(demo)]}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(lessons));$("save-status").textContent="保存済み ✓"}catch(e){$("save-status").textContent="保存できません";toast("保存容量を確認してください")}}
function toast(s){let t=$("toast");t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1900)}
function blank(){return {id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),title:"新しい授業",className:"",session:"",goal:"",original:"",translation:"",items:[],notes:""}}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function selectLesson(id){current=lessons.find(x=>x.id===id);if(!current)return;fill();renderList();renderBoard();requestAnimationFrame(redrawAll)}
function renderList(){$("lesson-list").innerHTML=lessons.map(x=>`<button class="lesson-entry ${current&&x.id===current.id?"selected":""}" data-id="${esc(x.id)}"><strong>${esc(x.title||"名称未設定")}</strong><small>${esc([x.className,x.session].filter(Boolean).join(" ・ ")||"授業教材")}</small></button>`).join("")}
function fill(){let x=current;if(!x)return;$("lesson-title").value=x.title||"";$("lesson-class").value=x.className||"";$("lesson-session").value=x.session||"";$("lesson-goal").value=x.goal||"";$("lesson-original").value=x.original||"";$("lesson-translation").value=x.translation||"";$("lesson-notes").value=x.notes||"";$("workspace-title").textContent=x.title||"名称未設定";$("workspace-subtitle").textContent=[x.className,x.session,x.goal].filter(Boolean).join(" ・ ");renderItems()}
function renderItems(){$("items-editor").innerHTML=(current.items||[]).map((it,i)=>`<div class="item-row" data-index="${i}"><select aria-label="項目の種類"><option ${it.type==="古語"?"selected":""}>古語</option><option ${it.type==="文法"?"selected":""}>文法</option><option ${it.type==="敬語"?"selected":""}>敬語</option><option ${it.type==="表現"?"selected":""}>表現</option><option ${it.type==="その他"?"selected":""}>その他</option></select><input data-field="term" aria-label="語句" placeholder="語句・文法" value="${esc(it.term)}"><input data-field="explain" aria-label="解説" placeholder="意味・解説" value="${esc(it.explain)}"><button aria-label="削除" data-remove="${i}">×</button></div>`).join("")}
function readForm(){if(!current)return;current.title=$("lesson-title").value;current.className=$("lesson-class").value;current.session=$("lesson-session").value;current.goal=$("lesson-goal").value;current.original=$("lesson-original").value;current.translation=$("lesson-translation").value;current.notes=$("lesson-notes").value;current.items=[...$("items-editor").querySelectorAll(".item-row")].map(r=>({type:r.children[0].value,term:r.querySelector('[data-field="term"]').value,explain:r.querySelector('[data-field="explain"]').value}));}
function renderBoard(){if(!current)return;readForm();$("workspace-title").textContent=current.title||"名称未設定";$("workspace-subtitle").textContent=[current.className,current.session,current.goal].filter(Boolean).join(" ・ ");$("board-title").textContent=current.title||"古典授業";$("board-class").textContent=current.className||"高校古典";$("board-session").textContent=current.session||"授業用板書";$("board-original").textContent=current.original;$("board-translation").textContent=current.translation;$("board-items").innerHTML=current.items.filter(x=>x.term||x.explain).map(x=>`<div class="board-item"><span class="term">${esc(x.term)} <small style="font:11px system-ui;color:#b9cbbd">［${esc(x.type)}］</small></span><span class="explain">${esc(x.explain)}</span></div>`).join("")||'<span class="hint">文法・語句はまだ登録されていません。</span>';$("board-notes").textContent=current.notes;$("board-original-wrap").hidden=!$("show-original").checked;$("board-translation-wrap").hidden=!$("show-translation").checked;$("board-grammar-wrap").hidden=!$("show-grammar").checked;applyReveal();renderPresentation()}
function applyReveal(){let ids=["board-original-wrap","board-translation-wrap","board-grammar-wrap"];ids.forEach((id,i)=>{let enabled=$(id.replace("board-","show-").replace("-wrap",""));$(id).style.display=enabled&&enabled.checked&&(!staged||i<revealStep)?"":"none"});$("reveal-mode").classList.toggle("primary",staged)}
function renderPresentation(){if(!current)return;readForm();$("pres-label").textContent="KOTEN BOARD";$("pres-title").textContent=current.title||"古典授業";$("pres-class").textContent=current.className||"高校古典";$("pres-session").textContent=current.session||"授業用板書";$("pres-original").textContent=current.original;$("pres-translation").textContent=current.translation;$("pres-items").innerHTML=$("board-items").innerHTML;$("pres-original-wrap").style.display=$("show-original").checked&&presStep>0?"":"none";$("pres-translation-wrap").style.display=$("show-translation").checked&&presStep>1?"":"none";$("pres-grammar-wrap").style.display=$("show-grammar").checked&&presStep>2?"":"none";$("pres-count").textContent=presStep===3?"全表示":`${presStep} / 3`;$("pres-board").style.fontSize=fontScale+"em"}
function save(){readForm();persist();renderList();renderBoard();toast("教材を保存しました")}
$("lesson-list").addEventListener("click",e=>{let b=e.target.closest("[data-id]");if(b){readForm();persist();selectLesson(b.dataset.id)}});
$("new-lesson").onclick=()=>{readForm();let x=blank();lessons.unshift(x);persist();selectLesson(x.id);toast("新しい授業を作成しました")};
$("save-lesson").onclick=save;
$("add-item").onclick=()=>{readForm();current.items.push({type:"文法",term:"",explain:""});renderItems()};
$("items-editor").addEventListener("input",()=>{readForm();renderBoard()});
$("items-editor").addEventListener("click",e=>{let b=e.target.closest("[data-remove]");if(b){readForm();current.items.splice(+b.dataset.remove,1);renderItems();renderBoard()}});
["lesson-title","lesson-class","lesson-session","lesson-goal","lesson-original","lesson-translation","lesson-notes"].forEach(id=>$(id).addEventListener("input",()=>{renderBoard();$("save-status").textContent="未保存の変更"}));
$("split-lines").onclick=()=>{$("lesson-original").value=$("lesson-original").value.replace(/。/g,"。\n");renderBoard()};
$("copy-original").onclick=async()=>{try{await navigator.clipboard.writeText($("lesson-original").value);toast("本文をコピーしました")}catch(e){toast("コピーできませんでした")}};
$("suggest-grammar").onclick=()=>{readForm();let text=current.original;let patterns=[["係助詞","こそ","係り結び。結びの語が已然形になるか確認。"],["係助詞","ぞ","係り結び。結びの語が連体形になるか確認。"],["係助詞","なむ","係り結び。結びの語が連体形になるか確認。"],["係助詞","や","係り結び・疑問/反語など文脈を確認。"],["係助詞","か","係り結び・疑問/反語など文脈を確認。"],["助動詞候補","ず","打消の助動詞候補。接続と活用形を確認。"],["助動詞候補","む","推量・意志など。接続と文脈を確認。"],["助動詞候補","けり","過去・詠嘆。接続と文脈を確認。"],["助動詞候補","べし","推量・当然・可能など。文脈を確認。"],["助動詞候補","なり","断定・伝聞推定など。接続を確認。"],["敬語候補","給ふ","尊敬・謙譲など。活用と主語を確認。"]];let found=patterns.filter(p=>text.includes(p[1])&&!current.items.some(i=>i.term===p[1]));found.forEach(p=>current.items.push({type:p[0],term:p[1],explain:p[2]}));renderItems();renderBoard();toast(found.length?`${found.length}件の候補を追加しました`:"新しい候補は見つかりませんでした")};
$("duplicate").onclick=()=>{if(!current)return;readForm();let x=structuredClone(current);x.id=crypto.randomUUID?crypto.randomUUID():String(Date.now());x.title=(x.title||"授業")+"（複製）";lessons.unshift(x);persist();selectLesson(x.id);toast("教材を複製しました")};
$("delete").onclick=()=>{if(!current||!confirm(`「${current.title}」を削除しますか？`))return;lessons=lessons.filter(x=>x.id!==current.id);current=lessons[0]||null;if(!current){let x=blank();lessons.push(x);current=x}persist();fill();renderList();renderBoard();toast("教材を削除しました")};
$("export-all").onclick=()=>{readForm();persist();download("koten-board-backup.json",JSON.stringify(lessons,null,2),"application/json")};
$("import-all").onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let x=JSON.parse(await f.text());if(!Array.isArray(x)||!x.every(y=>y&&typeof y.title==="string"&&Array.isArray(y.items)))throw Error();lessons=x;current=lessons[0]||null;if(!current){let b=blank();lessons=[b];current=b}persist();fill();renderList();renderBoard();toast("教材を読み込みました")}catch(err){toast("ファイル形式を確認してください")}e.target.value=""};
function download(name,data,type){let a=document.createElement("a"),u=URL.createObjectURL(new Blob([data],{type}));a.href=u;a.download=name;a.click();URL.revokeObjectURL(u)}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".tab-panel").forEach(x=>x.classList.toggle("active",x.id==="tab-"+b.dataset.tab));if(b.dataset.tab==="board")renderBoard()});
$("open-board").onclick=()=>document.querySelector('[data-tab="board"]').click();
["show-original","show-translation","show-grammar"].forEach(id=>$(id).onchange=()=>{applyReveal();renderPresentation()});
$("reveal-mode").onclick=()=>{staged=true;revealStep=0;applyReveal();toast("段階表示を開始しました")};
$("reveal-next").onclick=()=>{if(!staged){staged=true;revealStep=0}revealStep=Math.min(3,revealStep+1);applyReveal()};
$("reveal-all").onclick=()=>{staged=false;revealStep=3;applyReveal()};
$("font-up").onclick=()=>{fontScale=Math.min(1.35,fontScale+.1);$("board").style.fontSize=fontScale+"em"};
$("font-down").onclick=()=>{fontScale=Math.max(.8,fontScale-.1);$("board").style.fontSize=fontScale+"em"};
$("print-board").onclick=()=>window.print();
$("project-btn").onclick=()=>{readForm();presStep=0;$("presentation").hidden=false;renderPresentation();requestAnimationFrame(redrawAll);document.documentElement.requestFullscreen?.().catch(()=>{})};
function exitPres(){$("presentation").hidden=true;if(document.fullscreenElement)document.exitFullscreen?.()}
$("pres-exit").onclick=exitPres;
$("pres-next").onclick=()=>{presStep=Math.min(3,presStep+1);renderPresentation()};
$("pres-prev").onclick=()=>{presStep=Math.max(0,presStep-1);renderPresentation()};
$("pres-all").onclick=()=>{presStep=3;renderPresentation()};
document.addEventListener("keydown",e=>{if($("presentation").hidden)return;if(e.key==="ArrowRight"||e.key===" "){e.preventDefault();$("pres-next").click()}if(e.key==="ArrowLeft")$("pres-prev").click();if(e.key==="Escape")exitPres()});
window.addEventListener("beforeunload",()=>{if(current){readForm();persist()}});
if("serviceWorker" in navigator && location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});

// Drawing layer: normalized coordinates are stored per lesson and replayed on both boards.
let drawingEnabled=false,eraserMode=false,penColor="#ffdf55",penWidth=3,activePointer=null;
const canvases=[{id:"board-canvas",host:"board"},{id:"pres-canvas",host:"pres-board"}];
function strokes(){return current?(current.drawings||(current.drawings=[])):[]}
function canvasContext(c){return c.getContext("2d")}
function resizeCanvas(c,host){const rect=host.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1);const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));if(c.width!==w||c.height!==h){c.width=w;c.height=h;c.style.width=rect.width+"px";c.style.height=rect.height+"px";drawCanvas(c,host)}}
function drawCanvas(c,host){const ctx=canvasContext(c),dpr=Math.max(1,window.devicePixelRatio||1),r=host.getBoundingClientRect();ctx.clearRect(0,0,c.width,c.height);ctx.save();ctx.scale(dpr,dpr);for(const s of strokes()){if(!s.points||!s.points.length)continue;ctx.globalCompositeOperation=s.erase?"destination-out":"source-over";ctx.strokeStyle=s.color||penColor;ctx.fillStyle=s.color||penColor;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();let p=s.points[0],x=p.x*r.width,y=p.y*r.height;ctx.moveTo(x,y);if(s.points.length===1){ctx.lineWidth=(s.width||3);ctx.arc(x,y,ctx.lineWidth/2,0,Math.PI*2);ctx.fill()}else{for(let i=1;i<s.points.length;i++){p=s.points[i];ctx.lineWidth=(s.width||3)*(0.35+0.9*(p.p||0.5));ctx.lineTo(p.x*r.width,p.y*r.height);ctx.stroke();ctx.beginPath();ctx.moveTo(p.x*r.width,p.y*r.height)}}}ctx.restore();ctx.globalCompositeOperation="source-over"}
function redrawAll(){canvases.forEach(({id,host})=>{const c=$(id),h=$(host);if(c&&h)resizeCanvas(c,h)})}
function setDrawMode(on){drawingEnabled=on;["board","pres-board"].forEach(id=>$(id).classList.toggle("drawing-enabled",on));$("draw-toggle").textContent=on?"✎ 手書き：ON":"✎ 手書き：OFF";$("draw-toggle").classList.toggle("primary",on);toast(on?"手書きモード：Apple Pencilで描画できます":"手書きモードを終了しました")}
function pointerPoint(e,c){const r=c.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)),p:e.pressure||0.5}}
canvases.forEach(({id,host})=>{const c=$(id),h=$(host);c.addEventListener("pointerdown",e=>{if(!drawingEnabled)return;e.preventDefault();activePointer=e.pointerId;c.setPointerCapture(e.pointerId);const p=pointerPoint(e,c);const erase=eraserMode;const s={color:penColor,width:penWidth,erase,points:[p]};strokes().push(s);c.dataset.strokeIndex=String(strokes().length-1);drawCanvas(c,h)});c.addEventListener("pointermove",e=>{if(!drawingEnabled||activePointer!==e.pointerId)return;e.preventDefault();const idx=Number(c.dataset.strokeIndex),s=strokes()[idx];if(!s)return;s.points.push(pointerPoint(e,c));drawCanvas(c,h)});const end=e=>{if(activePointer!==e.pointerId)return;activePointer=null;try{c.releasePointerCapture(e.pointerId)}catch(_){}persist();drawCanvas(c,h)};c.addEventListener("pointerup",end);c.addEventListener("pointercancel",end)});
$("draw-toggle").onclick=()=>setDrawMode(!drawingEnabled);
$("pen-color").oninput=e=>{penColor=e.target.value;eraserMode=false};
$("pen-width").oninput=e=>penWidth=Number(e.target.value);
$("eraser").onclick=()=>{eraserMode=!eraserMode;$("eraser").classList.toggle("primary",eraserMode);toast(eraserMode?"消しゴムを選択しました":"ペンに戻しました")};
$("clear-drawing").onclick=()=>{if(!current)return;if(!confirm("この教材の手書き描画をすべて消去しますか？"))return;current.drawings=[];persist();redrawAll();toast("描画を消去しました")};
const ro=typeof ResizeObserver!=="undefined"?new ResizeObserver(()=>redrawAll()):null;
if(ro)canvases.forEach(({id,host})=>ro.observe($(host)));
window.addEventListener("resize",redrawAll);
document.addEventListener("fullscreenchange",redrawAll);

selectLesson(lessons[0].id);
redrawAll();
})();