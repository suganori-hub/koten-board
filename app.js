/* KOTEN BOARD v4
 * 保存キーは従来どおり koten-board-v1（教材の配列）。v2/v3のデータはそのまま読み込み、新項目は自動補完。
 * 板書は 1600x900 の固定ステージで組み、画面に合わせて拡大縮小する（端末・向きが変わっても配置が崩れない）。
 */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const KEY = "koten-board-v1", SCHEMA_KEY = "koten-board-schema", SCHEMA = 4;
const TOMB_KEY = "koten-board-tombstones", SYNC_KEY = "koten-board-sync", AI_KEY = "koten-board-ai";
const STAGE_W = 1600, STAGE_H = 900;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const str = v => v == null ? "" : String(v);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
const esc = s => str(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rd = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const hhmm = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };

const TYPES = ["古語", "文法", "助動詞", "助詞", "敬語", "係り結び", "接続", "表現", "その他"];
const GRAMMAR_TYPES = new Set(["文法", "助動詞", "助詞", "敬語", "係り結び", "接続", "係助詞", "助動詞候補", "敬語候補"]);
const PANES = ["orig", "tr", "words", "gram"];

const demo = {
  id: "demo", title: "徒然草　第七段", source: "『徒然草』序段", className: "高校2年", session: "第1時",
  goal: "作者の心情と表現の特徴を読み取る。",
  original: "つれづれなるままに、日暮らし、硯に向かひて、心にうつりゆくよしなし事を、そこはかとなく書きつくれば、あやしうこそものぐるほしけれ。",
  translation: "することもなく手持ち無沙汰なままに、一日中、硯に向かって、心に浮かんでは消えていくとりとめもないことを、あてもなく書きつけていると、不思議なほど正気を失ったような気持ちになる。",
  items: [
    { type: "古語", term: "つれづれなり", pos: "形容動詞", conjType: "ナリ活用", conjForm: "語幹", meaning: "することがなく退屈だ。所在ない。", explain: "「つれづれなる」は連体形。" },
    { type: "助詞", term: "こそ", pos: "助詞（係助詞）", conjType: "", conjForm: "", meaning: "強意", explain: "文末の「けれ」は已然形で、係り結び。" },
    { type: "係り結び", term: "こそ〜けれ", pos: "", conjType: "", conjForm: "", meaning: "", explain: "係助詞「こそ」の結びは已然形になる。" },
    { type: "表現", term: "あやしう", pos: "形容詞", conjType: "シク活用", conjForm: "連用形", meaning: "不思議だ", explain: "「あやしく」のウ音便。" }
  ],
  notes: "発問：作者はなぜ「ものぐるほしけれ」と感じたのか。"
};

/* ================= データ正規化・マイグレーション ================= */
function normItem(it) {
  it = it && typeof it === "object" ? it : {};
  const o = { ...it, type: str(it.type) || "その他", term: str(it.term), pos: str(it.pos), conjType: str(it.conjType), conjForm: str(it.conjForm), meaning: str(it.meaning), explain: str(it.explain) };
  if (it.ai) o.ai = true; else delete o.ai;
  return o;
}
function normLesson(x) {
  x = x && typeof x === "object" ? x : {};
  const v = x.view && typeof x.view === "object" ? x.view : {};
  const oldSize = +v.size > 0 ? Math.round(+v.size * 24) : 0; // v3の em指定 → px
  return {
    ...x, id: str(x.id) || uid(), title: str(x.title), source: str(x.source), className: str(x.className), session: str(x.session),
    goal: str(x.goal), original: str(x.original), translation: str(x.translation), notes: str(x.notes),
    items: (Array.isArray(x.items) ? x.items : []).map(normItem),
    marks: (Array.isArray(x.marks) ? x.marks : []).filter(m => m && Number.isFinite(m.s) && Number.isFinite(m.e)).map(m => ({ s: m.s | 0, e: m.e | 0, c: m.c === 2 ? 2 : 1 })),
    drawings: (Array.isArray(x.drawings) ? x.drawings : []).filter(s => s && Array.isArray(s.points)),
    view: {
      lh: clamp(+v.lh || 1.8, 1.2, 3.5), ls: clamp(v.ls == null || isNaN(+v.ls) ? 0.06 : +v.ls, 0, 0.6),
      auto: v.auto !== false, oPx: clamp(+v.oPx || oldSize || 0, 0, 320), lPx: clamp(+v.lPx || 0, 0, 140),
      header: v.header !== false, brk: v.brk !== false
    },
    updatedAt: Number(x.updatedAt) || 0, ver: SCHEMA
  };
}
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) {}
  if (raw) {
    try {
      const x = JSON.parse(raw);
      if (Array.isArray(x) && x.length) {
        const ver = localStorage.getItem(SCHEMA_KEY);
        if (ver !== String(SCHEMA)) { try { const bk = KEY + "-backup-v" + (ver || "2"); if (!localStorage.getItem(bk)) localStorage.setItem(bk, raw); } catch (e) {} }
        const out = x.filter(y => y && typeof y === "object").map(normLesson);
        if (out.length) return out;
      }
    } catch (e) { try { localStorage.setItem(KEY + "-corrupt-" + Date.now(), raw); } catch (_) {} }
  }
  return [normLesson(structuredClone(demo))];
}

/* ================= 状態 ================= */
let lessons = load(), tombs = rd(TOMB_KEY, {}), current = null;
let staged = false, revealStep = 4;
let presStep = 0, presShow = [false, false, false, false];
let hiddenTypes = new Set(), focusTerm = "", activeLine = -1, lastSel = null;
let saveTimer = 0, renderQueued = false, pendingRender = false, strokeActive = false, lastEditAt = 0;
let drawingEnabled = false, eraserMode = false, penColor = "#ffdf55", penWidth = 3, fingerDraw = false, autoPen = true;
const stageScale = { b: 1, p: 1 }; let lastFit = { o: 60, t: 36 };

/* ================= 保存 ================= */
function setStatus(t) { $("save-status").textContent = t; }
function persist() {
  clearTimeout(saveTimer);
  const ok = wr(KEY, lessons) && wr(TOMB_KEY, tombs);
  try { localStorage.setItem(SCHEMA_KEY, String(SCHEMA)); } catch (e) {}
  if (ok) setStatus("保存済み ✓ " + hhmm()); else { setStatus("保存できません"); toast("保存できません。容量を確認し、書き出しでバックアップしてください"); }
  return ok;
}
function scheduleSave() { setStatus("保存中…"); clearTimeout(saveTimer); saveTimer = setTimeout(persist, 500); }
function markDirty() { if (!current) return; current.updatedAt = Date.now(); lastEditAt = Date.now(); scheduleSave(); scheduleSync(); }
function toast(s) { const t = $("toast"); t.textContent = s; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600); }

/* ================= 盤面の骨組み（全パネル縦書き） ================= */
const skeleton = p => `
<div class="board-head" id="${p}-head"><h2 id="${p}-title"></h2><span class="board-source" id="${p}-source"></span><span class="board-meta"><span id="${p}-class"></span><span id="${p}-session"></span></span></div>
<div class="board-cols" id="${p}-cols">
 <section class="pane pane-orig" id="${p}-orig-wrap"><h3 class="yellow">本文</h3><div id="${p}-original" class="vtext original-text"></div></section>
 <section class="pane pane-tr" id="${p}-tr-wrap"><h3 class="cyan">現代語訳</h3><div id="${p}-translation" class="vtext translation-text"></div></section>
 <section class="pane pane-words" id="${p}-words-wrap"><h3 class="gold">語句・品詞</h3><div id="${p}-words" class="vtext items"></div></section>
 <section class="pane pane-gram" id="${p}-gram-wrap"><h3 class="pink">文法事項</h3><div id="${p}-gram" class="vtext items"></div></section>
</div>
<canvas class="draw-canvas" id="${p}-canvas" width="${STAGE_W}" height="${STAGE_H}"></canvas>`;

const penTools = () => `
<button class="btn small" data-act="draw">✎ 手書き：OFF</button>
<span class="swatches">${["#ffdf55", "#ffffff", "#ff7b7b", "#7fd8ff", "#8be28f"].map(c => `<button class="swatch" data-color="${c}" style="background:${c}" aria-label="ペン色 ${c}"></button>`).join("")}<input type="color" data-act="color" value="#ffdf55" aria-label="ペンの色"></span>
<label class="range">太さ<input type="range" data-act="width" min="1" max="14" value="3"></label>
<button class="btn small" data-act="eraser">消しゴム</button>
<button class="btn small" data-act="undo">↶ 元に戻す</button>
<button class="btn small" data-act="clear">全消去</button>
<label class="check"><input type="checkbox" data-act="autopen" checked>Pencilで自動ON</label>
<label class="check"><input type="checkbox" data-act="finger">指でも描く</label>`;
const markTools = () => `
<button class="btn small mark-y" data-mark="1">強調 黄</button>
<button class="btn small mark-r" data-mark="2">強調 赤</button>
<button class="btn small" data-mark="0">選択部分を解除</button>
<button class="btn small" data-mark="x">強調を全解除</button>`;

$("board").innerHTML = skeleton("b");
$("pres-board").innerHTML = skeleton("p");
document.querySelectorAll("[data-tools]").forEach(el => { el.innerHTML = el.dataset.tools === "pen" ? penTools() : markTools(); });

/* ================= 表示用の文章分割（「。」改行） ================= */
const getOrig = () => (current ? current.original.replace(/\r/g, "") : "");
function lineList(text, brk) { // [{s: 元文字列での開始位置, t: 表示行}]
  const out = []; let off = 0;
  const re = /[^。！？]*[。！？]+[」』）)]*|[^。！？]+/g;
  for (const raw of text.split("\n")) {
    if (brk) { re.lastIndex = 0; let m; while ((m = re.exec(raw))) if (m[0].trim()) out.push({ s: off + m.index, t: m[0] }); }
    else if (raw.trim()) out.push({ s: off, t: raw });
    off += raw.length + 1;
  }
  return out;
}
function hitSet(text, term) {
  const s = new Set(); let t = str(term).trim();
  if (!t) return s;
  while (t && !text.includes(t)) { if (t.length <= 2) { t = ""; break; } t = t.slice(0, -1); }
  if (!t) return s;
  for (let i = text.indexOf(t); i >= 0; i = text.indexOf(t, i + t.length)) for (let k = 0; k < t.length; k++) s.add(i + k);
  return s;
}
function originalHTML() {
  const text = getOrig();
  if (!text.trim()) return '<p class="empty">本文が未入力です</p>';
  const cls = new Array(text.length).fill(0);
  current.marks.forEach(m => { for (let i = Math.max(0, m.s); i < Math.min(text.length, m.e); i++) cls[i] = m.c; });
  const hits = hitSet(text, focusTerm);
  return lineList(text, current.view.brk).map((ln, n) => {
    let idx = ln.s, h = `<p class="vline${activeLine === n ? " active" : ""}" data-line="${n}"><span class="lno">${n + 1}</span>`;
    for (const ch of ln.t) {
      const c = [cls[idx] ? "m" + cls[idx] : "", hits.has(idx) ? "hit" : ""].filter(Boolean).join(" ");
      h += `<span class="ch${c ? " " + c : ""}" data-i="${idx}">${esc(ch)}</span>`; idx += ch.length;
    }
    return h + "</p>";
  }).join("");
}
function translationHTML() {
  const lines = lineList(str(current.translation).replace(/\r/g, ""), current.view.brk);
  if (!lines.length) return '<p class="empty">現代語訳が未入力です</p>';
  return lines.map((l, i) => `<p class="vline tr${activeLine === i ? " active" : ""}" data-line="${i}"><span class="lno">${i + 1}</span>${esc(l.t)}</p>`).join("");
}
function itemHTML(it, p) {
  const meta = [it.pos && "品詞 " + it.pos, it.conjType && "活用 " + it.conjType, it.conjForm].filter(Boolean).join(" ｜ ");
  const focus = focusTerm && focusTerm === it.term ? " focus" : "";
  const ai = it.ai && p === "b" ? '<span class="tag ai">AI下書き</span>' : "";
  return `<div class="item${focus}" data-t="${esc(it.type)}" data-term="${esc(it.term)}"><div class="item-head"><span class="term">${esc(it.term) || "（未入力）"}</span><span class="tag">${esc(it.type)}</span>${ai}</div>${meta ? `<div class="meta">${esc(meta)}</div>` : ""}${it.meaning ? `<div class="meaning">意味：${esc(it.meaning)}</div>` : ""}${it.explain ? `<div class="explain">${esc(it.explain)}</div>` : ""}</div>`;
}
function renderChips() {
  const counts = new Map();
  current.items.forEach(it => { if (it.term || it.explain || it.meaning) counts.set(it.type, (counts.get(it.type) || 0) + 1); });
  let html = [...counts].map(([t, n]) => `<button class="chip${hiddenTypes.has(t) ? " off" : ""}" data-chip="${esc(t)}">${esc(t)} ${n}</button>`).join("");
  if (hiddenTypes.size) html += '<button class="chip all" data-chip="*">すべて表示</button>';
  $("chips-b").innerHTML = html; $("chips-p").innerHTML = html;
}
function renderItemPanels(p) {
  const vis = current.items.filter(x => (x.term || x.explain || x.meaning) && !hiddenTypes.has(x.type));
  const words = vis.filter(x => !GRAMMAR_TYPES.has(x.type)), gram = vis.filter(x => GRAMMAR_TYPES.has(x.type));
  $(p + "-words").innerHTML = words.map(x => itemHTML(x, p)).join("") || '<p class="empty">語句は未登録</p>';
  $(p + "-gram").innerHTML = gram.map(x => itemHTML(x, p)).join("") || '<p class="empty">文法事項は未登録</p>';
}
function paneVisible(p, i) {
  if (p === "p") return presShow[i];
  const cb = document.querySelector(`.show-pane[data-pane="${PANES[i]}"]`);
  return cb.checked && (!staged || i < revealStep);
}
function applyVisibility(p) {
  const ids = ["orig", "tr", "words", "gram"];
  ids.forEach((k, i) => { $(p + "-" + k + "-wrap").hidden = !paneVisible(p, i); });
}

/* ================= ステージ（固定サイズ→拡縮）と自動拡大 ================= */
function layoutStage(p) {
  const wrap = $("stage-" + p), host = $(p === "b" ? "board" : "pres-board");
  let s;
  if (p === "b") s = wrap.parentElement.clientWidth / STAGE_W;
  else { const a = $("stage-area"); s = Math.min(a.clientWidth / STAGE_W, a.clientHeight / STAGE_H); }
  if (!(s > 0.02)) return false;
  stageScale[p] = s; wrap.style.width = STAGE_W * s + "px"; wrap.style.height = STAGE_H * s + "px"; host.style.transform = `scale(${s})`;
  return true;
}
function setSizes(host, o, t, w) { host.style.setProperty("--o-px", o + "px"); host.style.setProperty("--t-px", t + "px"); host.style.setProperty("--w-px", w + "px"); }
function fitMax(lo, hi, ok) { if (ok(hi)) return hi; if (!ok(lo)) return lo; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ok(m)) lo = m; else hi = m; } return lo; }
function applyView(p) {
  const host = $(p === "b" ? "board" : "pres-board"), v = current.view;
  host.style.setProperty("--lh", v.lh); host.style.setProperty("--ls", v.ls + "em");
  $(p + "-head").hidden = !v.header; host.classList.toggle("fit", v.auto);
}
function fitStage(p) {
  const host = $(p === "b" ? "board" : "pres-board"), v = current.view, cols = $(p + "-cols");
  const panes = [...cols.children].filter(e => !e.hidden);
  if (!panes.length) return;
  const oVis = !$(p + "-orig-wrap").hidden;
  if (!v.auto) { setSizes(host, v.oPx || 64, v.lPx || 38, (v.lPx || 38) * 0.92); return; }
  const set = s => { const t = oVis ? s * 0.58 : s; setSizes(host, s, t, t * 0.92); };
  const ok = () => {
    const gap = parseFloat(getComputedStyle(cols).columnGap) || 0;
    const used = panes.reduce((a, e) => a + e.offsetWidth, 0) + gap * (panes.length - 1);
    return used <= cols.clientWidth + 1 && panes.every(e => e.scrollHeight <= e.clientHeight + 1);
  };
  const s = fitMax(18, 300, x => { set(x); return ok(); });
  set(s); lastFit = { o: s, t: oVis ? s * 0.58 : s };
}
function renderSurface(p) {
  if (!current) return;
  $(p + "-class").textContent = current.className || "高校古典"; $(p + "-session").textContent = current.session || "";
  $(p + "-title").textContent = current.title || "古典授業";
  $(p + "-source").textContent = current.source ? "出典：" + current.source : ""; $(p + "-source").hidden = !current.source;
  $(p + "-original").innerHTML = originalHTML(); $(p + "-translation").innerHTML = translationHTML();
  renderItemPanels(p); applyVisibility(p); applyView(p);
  if (layoutStage(p)) fitStage(p);
  drawFull(p);
  if (p === "p") updatePresCount();
}
function renderOriginalOnly() { ["b", "p"].forEach(p => { $(p + "-original").innerHTML = originalHTML(); $(p + "-translation").innerHTML = translationHTML(); }); }
function syncViewUI() {
  if (!current) return; const v = current.view;
  document.querySelectorAll(".auto-fit").forEach(c => { c.checked = v.auto; });
  document.querySelectorAll(".hdr-toggle").forEach(c => { c.checked = v.header; });
  document.querySelectorAll(".brk-toggle").forEach(c => { c.checked = v.brk; });
  $("v-opx").value = v.oPx || Math.round(lastFit.o); $("v-lpx").value = v.lPx || Math.round(lastFit.t);
  $("v-lh").value = v.lh; $("v-ls").value = v.ls;
  ["v-opx", "v-lpx"].forEach(id => { $(id).disabled = v.auto; $(id).parentElement.style.opacity = v.auto ? .45 : 1; });
}
function renderAll() {
  renderQueued = false;
  if (!current) return;
  if (strokeActive) { pendingRender = true; return; } // 描画中は再配置しない
  $("workspace-title").textContent = current.title || "名称未設定";
  $("workspace-subtitle").textContent = [current.className, current.session, current.goal].filter(Boolean).join(" ・ ");
  $("tn-goal").textContent = current.goal || "（未設定）"; $("tn-notes").textContent = current.notes;
  renderChips();
  if ($("tab-board").classList.contains("active")) renderSurface("b");
  if (!$("presentation").hidden) renderSurface("p");
  syncViewUI();
}
function scheduleRender() { if (!renderQueued) { renderQueued = true; requestAnimationFrame(renderAll); } }

/* ================= 一覧・フォーム ================= */
function renderList() {
  $("lesson-list").innerHTML = lessons.map(x => `<button class="lesson-entry ${current && x.id === current.id ? "selected" : ""}" data-id="${esc(x.id)}"><strong>${esc(x.title || "名称未設定")}</strong><small>${esc([x.className, x.session].filter(Boolean).join(" ・ ") || "授業教材")}</small></button>`).join("");
}
const typeOptions = t => (TYPES.includes(t) ? TYPES : [...TYPES, t]).map(o => `<option${o === t ? " selected" : ""}>${esc(o)}</option>`).join("");
function renderItemsEditor() {
  $("items-editor").innerHTML = current.items.map((it, i) => `
<div class="item-card${it.ai ? " ai" : ""}" data-index="${i}" data-t="${esc(it.type)}">
 ${it.ai ? '<div class="ai-note">✨ AIの下書きです。内容を確認・修正してください。<button class="btn small" data-op="ok">確認済み</button></div>' : ""}
 <div class="ic-head"><select data-field="type" aria-label="種類">${typeOptions(it.type)}</select>
  <input data-field="term" aria-label="語句" placeholder="語句・文法項目（例：こそ）" value="${esc(it.term)}">
  <div class="ic-ops"><button class="btn small" data-op="up" aria-label="上へ">↑</button><button class="btn small" data-op="down" aria-label="下へ">↓</button><button class="btn small" data-op="dup">複製</button><button class="btn small danger" data-op="del" aria-label="削除">削除</button></div></div>
 <div class="ic-grid">
  <label>品詞<input data-field="pos" list="dl-pos" value="${esc(it.pos)}" placeholder="例：助詞"></label>
  <label>活用の種類<input data-field="conjType" list="dl-conj" value="${esc(it.conjType)}" placeholder="例：四段"></label>
  <label>活用形<input data-field="conjForm" list="dl-form" value="${esc(it.conjForm)}" placeholder="例：連体形"></label>
 </div>
 <div class="ic-grid2">
  <label>意味<input data-field="meaning" value="${esc(it.meaning)}" placeholder="例：強意"></label>
  <label>文法上の説明<textarea data-field="explain" rows="2" placeholder="接続・係り結び・敬語の種類など">${esc(it.explain)}</textarea></label>
 </div>
</div>`).join("") || '<p class="hint">項目はまだありません。上のボタン、または「AIで自動入力」で追加できます。</p>';
}
function fill() {
  const x = current; if (!x) return;
  $("lesson-title").value = x.title; $("lesson-source").value = x.source; $("lesson-class").value = x.className; $("lesson-session").value = x.session;
  $("lesson-goal").value = x.goal; $("lesson-original").value = x.original; $("lesson-translation").value = x.translation; $("lesson-notes").value = x.notes;
  renderItemsEditor(); syncViewUI();
}
function readForm() {
  if (!current) return;
  const oldOrig = current.original;
  current.title = $("lesson-title").value; current.source = $("lesson-source").value; current.className = $("lesson-class").value; current.session = $("lesson-session").value;
  current.goal = $("lesson-goal").value; current.original = $("lesson-original").value; current.translation = $("lesson-translation").value; current.notes = $("lesson-notes").value;
  if (current.original !== oldOrig) lastSel = null;
  const rows = [...$("items-editor").querySelectorAll(".item-card")];
  if (rows.length === current.items.length) {
    current.items = rows.map((r, i) => { const o = { ...current.items[i] }; r.querySelectorAll("[data-field]").forEach(f => { o[f.dataset.field] = f.value; }); return o; });
  }
}
function onEdit() { readForm(); markDirty(); scheduleRender(); clearTimeout(onEdit.t); onEdit.t = setTimeout(renderList, 250); }
function selectLesson(id) {
  const x = lessons.find(l => l.id === id); if (!x) return;
  current = x; focusTerm = ""; activeLine = -1; lastSel = null; hiddenTypes = new Set();
  fill(); renderList(); renderAll(); syncTools();
}
const blank = () => normLesson({ id: uid(), title: "新しい授業", updatedAt: Date.now() });

/* ================= 教材の操作 ================= */
$("lesson-list").addEventListener("click", e => { const b = e.target.closest("[data-id]"); if (b) { readForm(); persist(); selectLesson(b.dataset.id); } });
$("new-lesson").onclick = () => { readForm(); const x = blank(); lessons.unshift(x); persist(); selectLesson(x.id); document.querySelector('[data-tab="edit"]').click(); scheduleSync(); toast("新しい授業を作成しました"); };
$("save-lesson").onclick = () => { readForm(); if (persist()) { renderList(); renderAll(); scheduleSync(); toast("教材を保存しました"); } };
$("duplicate").onclick = () => { if (!current) return; readForm(); const x = normLesson(structuredClone(current)); x.id = uid(); x.title = (x.title || "授業") + "（複製）"; x.updatedAt = Date.now(); lessons.unshift(x); persist(); selectLesson(x.id); scheduleSync(); toast("教材を複製しました"); };
$("delete").onclick = () => {
  if (!current || !confirm(`「${current.title || "名称未設定"}」を削除しますか？（同期している他の端末からも削除されます。必要なら先に書き出してください）`)) return;
  tombs[current.id] = Date.now();
  lessons = lessons.filter(x => x.id !== current.id);
  if (!lessons.length) lessons.push(blank());
  persist(); selectLesson(lessons[0].id); scheduleSync(); toast("教材を削除しました");
};
["lesson-title", "lesson-source", "lesson-class", "lesson-session", "lesson-goal", "lesson-original", "lesson-translation", "lesson-notes"].forEach(id => $(id).addEventListener("input", onEdit));
$("items-editor").addEventListener("input", onEdit);
$("items-editor").addEventListener("change", e => { if (e.target.dataset.field === "type") e.target.closest(".item-card").dataset.t = e.target.value; onEdit(); });
$("items-editor").addEventListener("click", e => {
  const b = e.target.closest("[data-op]"); if (!b) return;
  readForm();
  const i = +b.closest(".item-card").dataset.index, a = current.items, op = b.dataset.op;
  if (op === "del") a.splice(i, 1);
  else if (op === "dup") a.splice(i + 1, 0, { ...a[i], ai: false });
  else if (op === "ok") { delete a[i].ai; }
  else if (op === "up" && i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]];
  else if (op === "down" && i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]];
  renderItemsEditor(); onEdit();
});
document.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
  if (!current) return; readForm();
  current.items.push(normItem({ type: b.dataset.add })); renderItemsEditor(); onEdit();
  const t = $("items-editor").querySelector(".item-card:last-child [data-field=term]"); if (t) t.focus();
});
const breakKuten = s => s.replace(/\r/g, "").replace(/([。！？][」』）)]*)\n?/g, "$1\n").replace(/\n+$/, "");
$("split-lines").onclick = () => { $("lesson-original").value = breakKuten($("lesson-original").value); onEdit(); };
$("split-trans").onclick = () => { $("lesson-translation").value = breakKuten($("lesson-translation").value); onEdit(); };
$("copy-original").onclick = async () => { try { await navigator.clipboard.writeText($("lesson-original").value); toast("本文をコピーしました"); } catch (e) { toast("コピーできませんでした"); } };
$("suggest-grammar").onclick = () => {
  readForm(); const text = current.original;
  const P = [["係助詞", "こそ", "助詞", "係り結び。結びの語が已然形になるか確認。"], ["係助詞", "ぞ", "助詞", "係り結び。結びの語が連体形になるか確認。"], ["係助詞", "なむ", "助詞", "係り結び。結びの語が連体形になるか確認。"], ["係助詞", "や", "助詞", "係り結び・疑問/反語など文脈を確認。"], ["係助詞", "か", "助詞", "係り結び・疑問/反語など文脈を確認。"], ["助動詞候補", "ず", "助動詞", "打消の助動詞候補。接続と活用形を確認。"], ["助動詞候補", "む", "助動詞", "推量・意志など。接続と文脈を確認。"], ["助動詞候補", "けり", "助動詞", "過去・詠嘆。接続と文脈を確認。"], ["助動詞候補", "べし", "助動詞", "推量・当然・可能など。文脈を確認。"], ["助動詞候補", "なり", "助動詞", "断定・伝聞推定など。接続を確認。"], ["敬語候補", "給ふ", "動詞（敬語）", "尊敬・謙譲など。活用と主語を確認。"]];
  const found = P.filter(p => text.includes(p[1]) && !current.items.some(i => i.term === p[1]));
  found.forEach(p => current.items.push(normItem({ type: p[0], term: p[1], pos: p[2], explain: p[3] })));
  renderItemsEditor(); onEdit(); toast(found.length ? `${found.length}件の候補を追加しました` : "新しい候補は見つかりませんでした");
};

/* ================= AIによる語句・文法の自動入力（Claude API・利用者自身のAPIキー） ================= */
const AI_SYSTEM = "あなたは高校の古典（古文）を教える教師の授業準備を助ける専門家です。与えられた古文を読み、生徒が学ぶべき語句・文法事項を正確に整理します。確信が持てない点は断定せず、explainの先頭に「要確認：」を付けてください。出力はJSONのみ（前後に説明文やコードフェンスを付けない）。";
function aiPrompt(lines, existing) {
  return `次の古文について、授業で扱うべき重要語句・文法事項を整理してください。

【本文（1行ずつ番号付き）】
${lines.map((t, i) => `${i + 1}. ${t}`).join("\n")}

【出力するJSONの形式】
{"translation":["1行目の現代語訳","2行目の現代語訳", ...],
 "items":[{"type":"古語|助動詞|助詞|敬語|係り結び|接続|表現|文法|その他","term":"本文中の表記","pos":"品詞","conjType":"活用の種類（例：ラ変型、四段、ク活用。活用しない語は空）","conjForm":"本文中での活用形（例：連体形。活用しない語は空）","meaning":"意味（助動詞は本文中での意味）","explain":"文法上の説明（接続・識別・係り結び・敬語の種類など。1〜2文）"}]}

【条件】
- translationは本文と同じ行数（${lines.length}行）。各行を自然な現代語訳にする。
- itemsは本文に出てくる順に、重要なものを最大25件。助動詞・助詞（係助詞など）・敬語・係り結び・重要古語・識別に注意すべき語を優先する。
- すでに登録済みの語句は重複させない：${existing.length ? existing.join("、") : "（なし）"}
- 高校古典の教科書的な説明にする。`;
}
function parseJSONLoose(t) {
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("parse");
  return JSON.parse(t.slice(a, b + 1));
}
function aiMsg(status) {
  if (status === 401) return "APIキーが無効です";
  if (status === 403) return "このAPIキーでは利用できません";
  if (status === 429) return "利用制限に達しました。少し待って再試行してください";
  if (status >= 500) return "AIサービスが一時的に利用できません";
  return "AIへの問い合わせに失敗しました(" + status + ")";
}
async function aiFill() {
  const cfg = rd(AI_KEY, null);
  if (!cfg || !cfg.key) { toast("先に「使い方・同期設定」でAPIキーを登録してください"); document.querySelector('[data-tab="guide"]').click(); return; }
  readForm();
  const lines = lineList(getOrig(), true).map(l => l.t.trim());
  if (!lines.length) { toast("本文を入力してください"); return; }
  const btn = $("ai-fill"), st = $("ai-status"); btn.disabled = true; st.textContent = "AIが解析中…（10〜40秒）";
  const target = current;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cfg.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: cfg.model || "claude-sonnet-5-5", max_tokens: 8000, system: AI_SYSTEM, messages: [{ role: "user", content: aiPrompt(lines, target.items.map(i => i.term).filter(Boolean)) }] })
    });
    if (!res.ok) throw Object.assign(new Error("http"), { status: res.status });
    const j = await res.json();
    const data = parseJSONLoose((j.content || []).map(b => b.text || "").join(""));
    let added = 0;
    (Array.isArray(data.items) ? data.items : []).slice(0, 30).forEach(it => {
      const n = normItem({ ...it, type: TYPES.includes(it && it.type) ? it.type : "その他", ai: true });
      if (!n.term || target.items.some(x => x.term === n.term && x.type === n.type)) return;
      target.items.push(n); added++;
    });
    let tr = false;
    let trNote = "";
    if (target.translation.trim()) trNote = "（現代語訳は入力済みのため変更していません）";
    else if (Array.isArray(data.translation) && data.translation.length === lines.length) { target.translation = data.translation.map(str).join("\n"); tr = true; }
    else trNote = "（現代語訳は行数が本文と合わなかったため入力しませんでした）";
    target.updatedAt = Date.now(); lastEditAt = Date.now(); scheduleSave(); scheduleSync();
    if (current === target) { fill(); renderAll(); }
    st.textContent = `完了：語句・文法 ${added}件を追加${tr ? "、現代語訳の下書きを入力" : ""}。${trNote}必ず内容を確認してください。`;
    toast(`AIが${added}件を追加しました。内容を確認してください`);
  } catch (e) {
    const m = e.status ? aiMsg(e.status) : (e.message === "parse" || e instanceof SyntaxError ? "AIの返答を読み取れませんでした。もう一度お試しください" : "通信できませんでした（オフライン／ネットワーク制限）");
    st.textContent = m; toast(m);
  } finally { btn.disabled = false; }
}
$("ai-fill").onclick = aiFill;
function fillAiForm() { const c = rd(AI_KEY, null); $("ai-model").value = (c && c.model) || ""; $("ai-key").value = ""; $("ai-key").placeholder = c && c.key ? "登録済み（変更する場合のみ入力）" : "sk-ant-…（この端末にだけ保存）"; $("ai-state").textContent = c && c.key ? "APIキー：登録済み" : "APIキー：未登録"; }
$("ai-save").onclick = () => { const old = rd(AI_KEY, {}) || {}; const key = $("ai-key").value.trim() || old.key || ""; if (!key) { toast("APIキーを入力してください"); return; } wr(AI_KEY, { key, model: $("ai-model").value.trim() }); fillAiForm(); toast("AIの設定を保存しました"); };
$("ai-remove").onclick = () => { if (!confirm("この端末のAPIキーを削除しますか？")) return; try { localStorage.removeItem(AI_KEY); } catch (e) {} fillAiForm(); toast("削除しました"); };

/* ================= 書き出し・読み込み ================= */
function download(name, data, type) { const a = document.createElement("a"), u = URL.createObjectURL(new Blob([data], { type })); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
$("export-all").onclick = () => { readForm(); persist(); const d = new Date(), ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); download(`koten-board-backup-${ymd}.json`, JSON.stringify(lessons, null, 2), "application/json"); toast("書き出しました"); };
$("import-all").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    let x = JSON.parse(await f.text());
    if (x && !Array.isArray(x) && Array.isArray(x.lessons)) x = x.lessons;
    if (!Array.isArray(x)) throw Error("not array");
    const inc = x.filter(y => y && typeof y === "object" && (typeof y.title === "string" || typeof y.original === "string")).map(normLesson);
    if (!inc.length) throw Error("empty");
    readForm();
    try { localStorage.setItem(KEY + "-before-import", JSON.stringify(lessons)); } catch (_) {}
    const now = Date.now(); inc.forEach(l => { l.updatedAt = now; delete tombs[l.id]; });
    const replace = confirm(`${inc.length}件の教材を読み込みます。\n\nOK＝現在の教材をすべて置き換える\nキャンセル＝現在の教材を残し、追加・同一IDは更新する`);
    if (replace) { lessons.forEach(l => { if (!inc.some(n => n.id === l.id)) tombs[l.id] = now; }); lessons = inc; }
    else inc.forEach(n => { const i = lessons.findIndex(l => l.id === n.id); if (i >= 0) lessons[i] = n; else lessons.push(n); });
    persist(); selectLesson((inc[0] || lessons[0]).id); scheduleSync(); toast(`${inc.length}件を読み込みました`);
  } catch (err) { toast("ファイル形式を確認してください"); }
  e.target.value = "";
};

/* ================= タブ・表示操作 ================= */
document.querySelectorAll(".tab").forEach(b => b.onclick = () => {
  if (b.dataset.tab !== "edit") readForm();
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === b));
  document.querySelectorAll(".tab-panel").forEach(x => x.classList.toggle("active", x.id === "tab-" + b.dataset.tab));
  if (b.dataset.tab === "board") renderAll();
});
$("open-board").onclick = () => document.querySelector('[data-tab="board"]').click();
document.querySelectorAll(".show-pane").forEach(cb => cb.onchange = () => renderSurface("b"));
$("reveal-mode").onclick = () => { staged = true; revealStep = 0; renderSurface("b"); toast("段階表示を開始しました。「次を表示」で順に提示します"); };
$("reveal-next").onclick = () => { if (!staged) { staged = true; revealStep = 0; } revealStep = Math.min(4, revealStep + 1); renderSurface("b"); };
$("reveal-all").onclick = () => { staged = false; revealStep = 4; renderSurface("b"); };
$("print-board").onclick = () => { renderSurface("b"); window.print(); };

function setAuto(on) {
  if (!current) return; const v = current.view;
  if (!on) { v.oPx = Math.round(lastFit.o); v.lPx = Math.round(lastFit.t); }
  v.auto = on; markDirty(); renderAll();
}
function adjust(kind, dir) {
  if (!current) return; const v = current.view;
  if (v.auto) setAuto(false);
  if (kind === "o") v.oPx = clamp(Math.round((v.oPx || 64) * (dir > 0 ? 1.12 : 0.89)), 24, 320);
  else v.lPx = clamp(Math.round((v.lPx || 38) * (dir > 0 ? 1.12 : 0.89)), 14, 140);
  markDirty(); renderAll();
}
document.addEventListener("change", e => {
  const c = e.target; if (!current || !c.classList) return;
  if (c.classList.contains("auto-fit")) setAuto(c.checked);
  else if (c.classList.contains("hdr-toggle")) { current.view.header = c.checked; markDirty(); renderAll(); }
  else if (c.classList.contains("brk-toggle")) { current.view.brk = c.checked; activeLine = -1; markDirty(); renderAll(); }
});
[["v-opx", "oPx"], ["v-lpx", "lPx"], ["v-lh", "lh"], ["v-ls", "ls"]].forEach(([id, k]) => $(id).addEventListener("input", e => { if (!current) return; current.view[k] = +e.target.value; markDirty(); scheduleRender(); }));

// 本文↔現代語訳の対応、語句→本文ハイライト、種類の絞り込み
document.addEventListener("click", e => {
  const sel = window.getSelection && window.getSelection().toString();
  const ln = e.target.closest(".vline");
  if (ln && !sel) {
    const n = +ln.dataset.line; activeLine = activeLine === n ? -1 : n; renderOriginalOnly();
    if (activeLine >= 0) document.querySelectorAll(`.vline[data-line="${n}"]`).forEach(el => { if (el.parentElement !== ln.parentElement) el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); });
    return;
  }
  const it = e.target.closest(".item");
  if (it && !sel) { const t = it.dataset.term; focusTerm = focusTerm === t ? "" : t; ["b", "p"].forEach(p => { renderItemPanels(p); $(p + "-original").innerHTML = originalHTML(); }); return; }
  const ch = e.target.closest("[data-chip]");
  if (ch) { const t = ch.dataset.chip; if (t === "*") hiddenTypes.clear(); else if (hiddenTypes.has(t)) hiddenTypes.delete(t); else hiddenTypes.add(t); renderAll(); }
});

/* ================= 強調（本文の選択範囲） ================= */
function selectionRange() {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0); let n = r.commonAncestorContainer; if (n.nodeType !== 1) n = n.parentElement;
  const host = n && n.closest(".original-text"); if (!host) return null;
  let s = Infinity, e = -1;
  host.querySelectorAll("[data-i]").forEach(sp => { if (r.intersectsNode(sp)) { const i = +sp.dataset.i; s = Math.min(s, i); e = Math.max(e, i + sp.textContent.length); } });
  return e < 0 ? null : { s, e };
}
document.addEventListener("selectionchange", () => { const r = selectionRange(); if (r) lastSel = r; });
function cutMarks(s, e) {
  const out = [];
  current.marks.forEach(m => { if (m.e <= s || m.s >= e) out.push(m); else { if (m.s < s) out.push({ s: m.s, e: s, c: m.c }); if (m.e > e) out.push({ s: e, e: m.e, c: m.c }); } });
  current.marks = out;
}
function applyMark(kind) {
  if (!current) return;
  if (kind === "x") { if (current.marks.length && confirm("この教材の強調をすべて解除しますか？")) { current.marks = []; renderOriginalOnly(); markDirty(); } return; }
  const r = selectionRange() || lastSel;
  if (!r) { toast("本文の文字をなぞって選択してから押してください"); return; }
  cutMarks(r.s, r.e);
  if (kind !== "0") current.marks.push({ s: r.s, e: r.e, c: +kind });
  lastSel = null; window.getSelection().removeAllRanges(); renderOriginalOnly(); markDirty();
}
document.addEventListener("pointerdown", e => { if (e.target.closest("[data-mark]")) e.preventDefault(); });
document.addEventListener("click", e => { const b = e.target.closest("[data-mark]"); if (b) applyMark(b.dataset.mark); });

/* ================= 投影モード ================= */
function setPresStep(n) { presStep = clamp(n, 0, 4); presShow = presShow.map((_, i) => i < presStep); renderPresPanes(); }
function renderPresPanes() { if (!current) return; renderSurface("p"); }
function updatePresCount() {
  const n = presShow.filter(Boolean).length;
  $("pres-count").textContent = n === 4 ? "全表示" : `${n} / 4 表示中`;
  document.querySelectorAll(".pres-pane").forEach(b => b.classList.toggle("on", presShow[+b.dataset.pane]));
}
function openPres() {
  if (!current) return; readForm(); persist();
  $("presentation").hidden = false; document.body.classList.add("projecting");
  setBarMode(0); renderChips(); syncViewUI(); setPresStep(0); syncTools();
  const el = $("presentation"), rf = el.requestFullscreen || el.webkitRequestFullscreen;
  if (rf) try { const r = rf.call(el); if (r && r.catch) r.catch(() => {}); } catch (e) {}
  setTimeout(() => { if (!$("presentation").hidden) renderSurface("p"); }, 250); // 全画面化後のサイズで再計算
}
function exitPres() {
  $("presentation").hidden = true; document.body.classList.remove("projecting");
  const fe = document.fullscreenElement || document.webkitFullscreenElement;
  if (fe) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }
  renderAll();
}
let presBarMode = 0; // 0=コンパクト(1段) 1=ペン・強調ツールも表示 2=すべて隠す（提示内容を最大に）
function setBarMode(m) { presBarMode = m; $("pres-bar").hidden = m === 2; $("pres-foot").hidden = m === 2; $("pres-more").hidden = m !== 1; $("pres-bar-toggle").classList.toggle("on", m !== 0); $("pres-bar-toggle").textContent = m === 0 ? "⚙ ツール" : m === 1 ? "⚙ 閉じる" : "⚙ 戻す"; }
function togglePresBar() { setBarMode((presBarMode + 1) % 3); }
$("project-btn").onclick = openPres;
$("pres-exit").onclick = exitPres;
$("pres-bar-toggle").onclick = togglePresBar;
$("pres-next").onclick = () => setPresStep(presStep + 1);
$("pres-prev").onclick = () => setPresStep(presStep - 1);
$("pres-all").onclick = () => setPresStep(4);
document.querySelectorAll(".pres-pane").forEach(b => b.onclick = () => { const i = +b.dataset.pane; presShow[i] = !presShow[i]; renderPresPanes(); });
$("pres-osize-up").onclick = () => adjust("o", 1); $("pres-osize-down").onclick = () => adjust("o", -1);
$("pres-lsize-up").onclick = () => adjust("l", 1); $("pres-lsize-down").onclick = () => adjust("l", -1);

document.addEventListener("keydown", e => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" && e.target.type !== "checkbox" && e.target.type !== "range") return;
  if (tag === "textarea" || tag === "select") return;
  const k = e.key, ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && (k === "z" || k === "Z")) { if (!$("presentation").hidden || $("tab-board").classList.contains("active")) { e.preventDefault(); undo(); } return; }
  if ($("presentation").hidden) return;
  if (k === "ArrowRight" || k === " " || k === "PageDown") { e.preventDefault(); $("pres-next").click(); }
  else if (k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); $("pres-prev").click(); }
  else if (k === "Home") setPresStep(0);
  else if (k === "End" || k === "a" || k === "A") setPresStep(4);
  else if (k === "Escape") exitPres();
  else if (k === "+" || k === "=") adjust("o", 1);
  else if (k === "-") adjust("o", -1);
  else if (k >= "1" && k <= "4") { const i = +k - 1; presShow[i] = !presShow[i]; renderPresPanes(); }
  else if (k === "d" || k === "D") setDraw(!drawingEnabled);
  else if (k === "e" || k === "E") toggleEraser();
  else if (k === "t" || k === "T") togglePresBar();
  else if (k === "f" || k === "F") setAuto(!current.view.auto);
  else if (k === "h" || k === "H") { current.view.header = !current.view.header; markDirty(); renderAll(); }
  else if (k === "k" || k === "K") { current.view.brk = !current.view.brk; markDirty(); renderAll(); }
});

/* ================= 手書き（ステージ座標・Pointer Events） ================= */
const activeSurface = () => ($("presentation").hidden ? "b" : "p");
const LEGACY_KEY = "a1111hb";
function layoutKey(p) {
  const v = current.view, flags = (v.header ? "h" : "") + (v.brk ? "b" : "");
  if (v.auto) return "a" + PANES.map((_, i) => (paneVisible(p, i) ? 1 : 0)).join("") + flags; // 表示内容ごとにレイアウトが変わる
  return `m${v.oPx}_${v.lPx}_${v.lh}_${v.ls}${flags}`; // 手動サイズでは表示内容を変えても本文の位置は動かない
}
const strokeKey = s => s.k || LEGACY_KEY;
const strokesFor = p => (current ? current.drawings.filter(s => strokeKey(s) === layoutKey(p)) : []);
const strokeWidth = (s, pt) => (s.width || 3) * (s.erase ? 6 : 0.35 + 0.9 * (pt.p || 0.5));
function drawStroke(ctx, s) {
  const pts = s.points; if (!pts.length) return;
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
  ctx.strokeStyle = ctx.fillStyle = s.color || "#ffdf55";
  if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0].x * STAGE_W, pts[0].y * STAGE_H, strokeWidth(s, pts[0]) / 2, 0, Math.PI * 2); ctx.fill(); }
  else for (let i = 1; i < pts.length; i++) segment(ctx, s, i);
  ctx.globalCompositeOperation = "source-over";
}
function segment(ctx, s, i) {
  const a = s.points[i - 1], b = s.points[i];
  ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over"; ctx.strokeStyle = s.color || "#ffdf55"; ctx.lineCap = "round"; ctx.lineWidth = strokeWidth(s, b);
  ctx.beginPath(); ctx.moveTo(a.x * STAGE_W, a.y * STAGE_H); ctx.lineTo(b.x * STAGE_W, b.y * STAGE_H); ctx.stroke();
}
function canvasCtx(p) {
  const c = $(p + "-canvas"), dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(STAGE_W * stageScale[p] * dpr)), h = Math.max(1, Math.round(STAGE_H * stageScale[p] * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext("2d"); ctx.setTransform(c.width / STAGE_W, 0, 0, c.height / STAGE_H, 0, 0);
  return { c, ctx };
}
function drawFull(p) {
  if (!current) return;
  const host = $(p === "b" ? "board" : "pres-board"); if (!host.offsetWidth || !(stageScale[p] > 0.02)) return;
  if (p === "p" && $("presentation").hidden) return;
  const { c, ctx } = canvasCtx(p);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore();
  ctx.setTransform(c.width / STAGE_W, 0, 0, c.height / STAGE_H, 0, 0);
  strokesFor(p).forEach(s => drawStroke(ctx, s));
}
function redrawAll() { drawFull("b"); drawFull("p"); }
function syncTools() {
  document.body.classList.toggle("drawing", drawingEnabled);
  ["board", "pres-board"].forEach(id => $(id).classList.toggle("drawing-enabled", drawingEnabled));
  document.querySelectorAll('[data-act="draw"]').forEach(b => { b.textContent = drawingEnabled ? "✎ 手書き：ON" : "✎ 手書き：OFF"; b.classList.toggle("on", drawingEnabled); });
  document.querySelectorAll('[data-act="eraser"]').forEach(b => b.classList.toggle("on", eraserMode));
  document.querySelectorAll('[data-act="finger"]').forEach(b => { b.checked = fingerDraw; });
  document.querySelectorAll('[data-act="autopen"]').forEach(b => { b.checked = autoPen; });
  document.querySelectorAll('[data-act="width"]').forEach(b => { b.value = penWidth; });
  document.querySelectorAll('[data-act="color"]').forEach(b => { b.value = penColor; });
  document.querySelectorAll(".swatch").forEach(b => b.classList.toggle("on", !eraserMode && b.dataset.color === penColor));
}
function setDraw(on, silent) { drawingEnabled = on; syncTools(); if (!silent) toast(on ? "手書きON：Apple Pencilで書けます" : "手書きOFF：指でスクロール・タップできます"); }
function toggleEraser() { eraserMode = !eraserMode; if (eraserMode && !drawingEnabled) drawingEnabled = true; syncTools(); toast(eraserMode ? "消しゴム" : "ペンに戻しました"); }
function undo() {
  if (!current) return; const p = activeSurface(), key = layoutKey(p), list = current.drawings;
  for (let i = list.length - 1; i >= 0; i--) if (strokeKey(list[i]) === key) { list.splice(i, 1); drawFull(p); markDirty(); return; }
  toast("元に戻す書き込みがありません");
}
function clearDrawings() {
  if (!current) return; const p = activeSurface(), key = layoutKey(p);
  if (!strokesFor(p).length) { toast("この表示の書き込みはありません"); return; }
  if (!confirm("この表示の手書きをすべて消去しますか？（元に戻せません）")) return;
  current.drawings = current.drawings.filter(s => strokeKey(s) !== key); drawFull(p); markDirty(); toast("手書きを消去しました");
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (b) {
    const a = b.dataset.act;
    if (a === "draw") setDraw(!drawingEnabled); else if (a === "eraser") toggleEraser(); else if (a === "undo") undo(); else if (a === "clear") clearDrawings();
  }
  const sw = e.target.closest(".swatch"); if (sw) { penColor = sw.dataset.color; eraserMode = false; if (!drawingEnabled) drawingEnabled = true; syncTools(); }
});
document.addEventListener("input", e => {
  const a = e.target.dataset && e.target.dataset.act;
  if (a === "color") { penColor = e.target.value; eraserMode = false; syncTools(); }
  else if (a === "width") { penWidth = +e.target.value; syncTools(); }
});
document.addEventListener("change", e => {
  const a = e.target.dataset && e.target.dataset.act;
  if (a === "finger") { fingerDraw = e.target.checked; syncTools(); } else if (a === "autopen") { autoPen = e.target.checked; syncTools(); }
});

const beginStroke = {};
["b", "p"].forEach(p => {
  const c = $(p + "-canvas"), host = $(p === "b" ? "board" : "pres-board"); let cur = null, pid = null, tap = null;
  const pt = e => { const r = c.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1), p: e.pointerType === "mouse" ? 0.5 : (e.pressure || 0.5) }; };
  const begin = e => {
    e.preventDefault(); pid = e.pointerId; try { c.setPointerCapture(pid); } catch (_) {}
    strokeActive = true; lastEditAt = Date.now();
    cur = { color: penColor, width: +(penWidth * 1.6).toFixed(2), erase: eraserMode, k: layoutKey(p), points: [pt(e)] };
    current.drawings.push(cur);
    const { ctx } = canvasCtx(p); drawStroke(ctx, cur);
  };
  beginStroke[p] = begin;
  c.addEventListener("pointerdown", e => {
    if (!drawingEnabled || !current) return;
    e.preventDefault();
    if (e.pointerType === "touch" && !fingerDraw) { tap = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId }; return; }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    begin(e);
  });
  c.addEventListener("pointermove", e => {
    if (!cur || e.pointerId !== pid) return; e.preventDefault();
    const { ctx } = canvasCtx(p);
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (evs.length ? evs : [e]).forEach(ev => { cur.points.push(pt(ev)); segment(ctx, cur, cur.points.length - 1); });
    ctx.globalCompositeOperation = "source-over";
  });
  const end = e => {
    if (tap && e.pointerId === tap.id) { // 指のタップは下の要素（行・語句カード等）に渡す
      if (e.type === "pointerup" && Date.now() - tap.t < 500 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 14) {
        c.style.pointerEvents = "none"; const el = document.elementFromPoint(e.clientX, e.clientY); c.style.pointerEvents = ""; if (el && el !== c) el.click();
      }
      tap = null; return;
    }
    if (!cur || e.pointerId !== pid) return;
    cur = null; pid = null; strokeActive = false; try { c.releasePointerCapture(e.pointerId); } catch (_) {}
    markDirty(); if (pendingRender) { pendingRender = false; scheduleRender(); }
  };
  c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
  c.addEventListener("contextmenu", e => e.preventDefault());
  c.addEventListener("touchmove", e => { if (drawingEnabled) e.preventDefault(); }, { passive: false });
  // Apple Pencilが画面に触れたら自動で手書きON（そのまま書き始める）
  host.addEventListener("pointerdown", e => {
    if (e.pointerType !== "pen" || drawingEnabled || !autoPen || !current) return;
    if (e.target.closest("button,input,select,textarea,a,label")) return;
    setDraw(true, true); begin(e);
  }, true);
});

/* ================= 端末間同期（GitHub非公開リポジトリ） ================= */
const syncCfg = () => { const c = rd(SYNC_KEY, null); return c && c.repo && c.token ? c : null; };
let syncing = false, pendingSync = false, syncTimer = 0;
function setSync(t, err) { $("sync-status").textContent = "同期：" + t; $("sync-detail").textContent = t; $("sync-status").classList.toggle("err", !!err); $("sync-detail").classList.toggle("err", !!err); }
function scheduleSync() { const c = syncCfg(); if (!c || c.auto === false) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(false), 4000); }
const b64enc = s => { const b = new TextEncoder().encode(s); let bin = ""; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };
const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), ch => ch.charCodeAt(0)));
const ghUrl = (c, p) => `https://api.github.com/repos/${c.repo}${p}`;
const ghHead = c => ({ Authorization: "Bearer " + c.token, Accept: "application/vnd.github+json" });
const ghPath = c => (c.path || "koten-board-data.json").split("/").map(encodeURIComponent).join("/");
function ghErr(status) {
  if (status === 401) return "トークンが無効、または期限切れです";
  if (status === 403) return "権限不足またはAPI制限です（トークンのContents権限を確認）";
  if (status === 404) return "リポジトリまたはブランチが見つかりません（名前・トークンの対象を確認）";
  if (status === 409 || status === 422) return "保存が競合しました（もう一度同期します）";
  return "同期エラー(" + status + ")";
}
async function ghGet(c) {
  const br = encodeURIComponent(c.branch || "main");
  const r = await fetch(ghUrl(c, `/contents/${ghPath(c)}?ref=${br}&_=${Date.now()}`), { headers: ghHead(c), cache: "no-store" });
  if (r.status === 404) { // ファイル未作成か、リポジトリ自体にアクセスできないか
    const rr = await fetch(ghUrl(c, ""), { headers: ghHead(c), cache: "no-store" });
    if (!rr.ok) throw Object.assign(new Error("gh"), { status: rr.status });
    return { data: null, sha: undefined };
  }
  if (!r.ok) throw Object.assign(new Error("gh"), { status: r.status });
  const meta = await r.json();
  let b64 = meta.content;
  if (!b64) { const br2 = await fetch(meta.git_url, { headers: ghHead(c), cache: "no-store" }); if (!br2.ok) throw Object.assign(new Error("gh"), { status: br2.status }); b64 = (await br2.json()).content; } // 1MB超
  return { data: JSON.parse(b64dec(b64)), sha: meta.sha };
}
async function ghPut(c, payload, sha) {
  const body = { message: "KOTEN BOARD sync " + new Date().toISOString(), content: b64enc(JSON.stringify(payload)), branch: c.branch || "main" };
  if (sha) body.sha = sha;
  const r = await fetch(ghUrl(c, `/contents/${ghPath(c)}`), { method: "PUT", headers: { ...ghHead(c), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw Object.assign(new Error("gh"), { status: r.status });
}
function mergeData(localLessons, localDel, remote, protectId) {
  let rl = (remote && Array.isArray(remote.lessons) ? remote.lessons : []).filter(x => x && typeof x === "object").map(normLesson);
  let ll = localLessons;
  if (rl.length && ll.length === 1 && ll[0].id === "demo" && !ll[0].updatedAt) ll = []; // 初期サンプルだけの端末は取り込みを優先
  const rdel = (remote && remote.deleted) || {}, del = { ...rdel };
  Object.entries(localDel).forEach(([k, v]) => { del[k] = Math.max(del[k] || 0, v); });
  const best = new Map(), order = [];
  ll.forEach(l => { best.set(l.id, l); order.push(l.id); });
  rl.forEach(r => {
    const l = best.get(r.id);
    if (!l) { best.set(r.id, r); order.push(r.id); return; }
    const lu = l.updatedAt || 0, ru = r.updatedAt || 0;
    if (ru > lu) best.set(r.id, r);
    else if (ru === lu && lu === 0 && JSON.stringify(l) !== JSON.stringify(r)) l.updatedAt = Date.now(); // 旧データ同士の差異はこの端末を採用
  });
  if (protectId) { const l = ll.find(x => x.id === protectId); if (l && best.get(protectId) !== l) { l.updatedAt = Date.now(); best.set(protectId, l); } } // 入力中の教材は自端末を優先
  const out = order.map(id => best.get(id)).filter(l => !(del[l.id] && del[l.id] >= (l.updatedAt || 0)));
  const rm = new Map(rl.map(l => [l.id, l.updatedAt || 0]));
  const needsPush = !remote || out.some(l => !rm.has(l.id) || rm.get(l.id) !== (l.updatedAt || 0)) || Object.keys(del).some(k => rdel[k] !== del[k]) || rl.some(l => !out.includes(best.get(l.id)) && !del[l.id]);
  return { lessons: out, deleted: del, needsPush };
}
function applyMerged(m) {
  const sig = a => a.map(l => l.id + ":" + (l.updatedAt || 0)).join("|");
  const before = sig(lessons) + JSON.stringify(tombs), prev = current, curId = current && current.id;
  lessons = m.lessons.length ? m.lessons : [blank()]; tombs = m.deleted;
  if (before === sig(lessons) + JSON.stringify(tombs)) return false;
  persist();
  if (!lessons.some(l => l.id === curId)) selectLesson(lessons[0].id);
  else {
    current = lessons.find(l => l.id === curId);
    if (current !== prev && !(Date.now() - lastEditAt < 8000)) fill();
    renderList(); renderAll();
  }
  return true;
}
async function syncNow(manual) {
  const c = syncCfg();
  if (!c) { if (manual) { toast("同期はまだ設定されていません。「使い方・同期設定」で設定してください"); document.querySelector('[data-tab="guide"]').click(); } return; }
  if (syncing) { pendingSync = true; return; }
  syncing = true; setSync("同期中…");
  try {
    let changed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await ghGet(c);
      const editing = Date.now() - lastEditAt < 8000 || strokeActive;
      const m = mergeData(lessons, tombs, remote.data, editing && current ? current.id : null);
      if (applyMerged(m)) changed = true;
      if (!m.needsPush) break;
      try { await ghPut(c, { app: "koten-board", schema: SCHEMA, savedAt: Date.now(), lessons: lessons.filter(l => !(tombs[l.id] >= (l.updatedAt || 0))), deleted: tombs }, remote.sha); break; }
      catch (e) { if ((e.status === 409 || e.status === 422) && attempt < 2) continue; throw e; }
    }
    setSync("同期済み ✓ " + hhmm());
    if (manual) toast(changed ? "他の端末の変更を取り込みました" : "同期しました");
  } catch (e) {
    const m = e.status ? ghErr(e.status) : "通信できません（オフライン）。接続後に自動で再同期します";
    setSync(m, true); if (manual) toast(m);
  } finally { syncing = false; if (pendingSync) { pendingSync = false; scheduleSync(); } }
}
function fillSyncForm() {
  const c = rd(SYNC_KEY, null) || {};
  $("sync-repo").value = c.repo || ""; $("sync-branch").value = c.branch || ""; $("sync-path").value = c.path || ""; $("sync-auto").checked = c.auto !== false;
  $("sync-token").value = ""; $("sync-token").placeholder = c.token ? "登録済み（変更する場合のみ入力）" : "github_pat_…（この端末にだけ保存）";
  if (!c.token) setSync("未設定");
}
function saveSyncForm() {
  const old = rd(SYNC_KEY, {}) || {}; const repo = $("sync-repo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  const token = $("sync-token").value.trim() || old.token || "";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { toast("リポジトリは「所有者/名前」の形式で入力してください"); return false; }
  if (!token) { toast("アクセストークンを入力してください"); return false; }
  wr(SYNC_KEY, { repo, token, branch: $("sync-branch").value.trim() || "main", path: $("sync-path").value.trim() || "koten-board-data.json", auto: $("sync-auto").checked });
  return true;
}
$("sync-connect").onclick = () => { if (!saveSyncForm()) return; readForm(); persist(); try { localStorage.setItem(KEY + "-before-sync", JSON.stringify(lessons)); } catch (e) {} fillSyncForm(); syncNow(true); };
$("sync-now").onclick = () => syncNow(true);
$("sync-btn").onclick = () => syncNow(true);
$("sync-auto").onchange = () => { const c = rd(SYNC_KEY, null); if (c) { c.auto = $("sync-auto").checked; wr(SYNC_KEY, c); } };
$("sync-disconnect").onclick = () => { if (!confirm("この端末の同期設定を解除しますか？（教材データは残ります）")) return; try { localStorage.removeItem(SYNC_KEY); } catch (e) {} fillSyncForm(); setSync("未設定"); toast("同期を解除しました"); };
$("sync-code-make").onclick = async () => {
  const c = syncCfg(); if (!c) { toast("先に接続してください"); return; }
  const code = "KB1:" + btoa(unescape(encodeURIComponent(JSON.stringify({ repo: c.repo, branch: c.branch, path: c.path, token: c.token }))));
  $("sync-code").value = code;
  try { await navigator.clipboard.writeText(code); toast("接続コードをコピーしました（他人に見せないでください）"); } catch (e) { toast("下の欄に表示しました。コピーして使ってください"); }
};
$("sync-code-apply").onclick = () => {
  try {
    const raw = $("sync-code").value.trim(); if (!raw.startsWith("KB1:")) throw Error("code");
    const o = JSON.parse(decodeURIComponent(escape(atob(raw.slice(4))))); if (!o.repo || !o.token) throw Error("code");
    wr(SYNC_KEY, { repo: o.repo, token: o.token, branch: o.branch || "main", path: o.path || "koten-board-data.json", auto: true });
    $("sync-code").value = ""; readForm(); persist(); try { localStorage.setItem(KEY + "-before-sync", JSON.stringify(lessons)); } catch (e) {}
    fillSyncForm(); syncNow(true);
  } catch (e) { toast("接続コードを読み取れませんでした"); }
};

/* ================= 初期化 ================= */
const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { layoutStage("b"); if (!$("presentation").hidden) layoutStage("p"); redrawAll(); }) : null;
if (ro) { ro.observe($("stage-b").parentElement); ro.observe($("stage-area")); }
window.addEventListener("resize", () => { layoutStage("b"); if (!$("presentation").hidden) layoutStage("p"); redrawAll(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => scheduleRender());
document.addEventListener("fullscreenchange", () => setTimeout(() => { if (!$("presentation").hidden) renderSurface("p"); }, 200));
const flush = () => { if (current) { readForm(); persist(); } };
window.addEventListener("beforeunload", flush);
window.addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); else setTimeout(() => syncNow(false), 300); });
window.addEventListener("online", () => syncNow(false));
setInterval(() => { if (document.visibilityState === "visible" && syncCfg() && (syncCfg().auto !== false)) syncNow(false); }, 60000);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const had = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.register("./sw.js").then(r => r.update && r.update()).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (had && !reloaded && $("presentation").hidden) { reloaded = true; flush(); location.reload(); } });
}

fillSyncForm(); fillAiForm();
selectLesson(lessons[0].id);
persist();
if (syncCfg()) setTimeout(() => syncNow(false), 600); else setSync("未設定");
})();
