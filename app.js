/* KOTEN BOARD v3
 * - 保存キーは v1 のまま（koten-board-v1）。データは「教材の配列」で、v2 と完全互換。
 * - v3 で増えた項目（source / items.pos 等 / marks / view）は読み込み時に自動補完（マイグレーション）。
 */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const KEY = "koten-board-v1", SCHEMA_KEY = "koten-board-schema", SCHEMA = 3;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const str = v => v == null ? "" : String(v);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
const esc = s => str(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const TYPES = ["古語", "文法", "助動詞", "助詞", "敬語", "係り結び", "接続", "表現", "その他"];
const GRAMMAR_TYPES = new Set(["文法", "助動詞", "助詞", "敬語", "係り結び", "接続", "係助詞", "助動詞候補", "敬語候補"]);
const PANES = ["orig", "tr", "words", "gram"];

const demo = {
  id: "demo", title: "徒然草　第七段", source: "『徒然草』序段", className: "高校2年", session: "第1時",
  goal: "作者の心情と表現の特徴を読み取る。",
  original: "つれづれなるままに、\n日暮らし、硯に向かひて、\n心にうつりゆくよしなし事を、\nそこはかとなく書きつくれば、\nあやしうこそものぐるほしけれ。",
  translation: "することもなく手持ち無沙汰なままに、\n一日中、硯に向かって、\n心に浮かんでは消えていくとりとめもないことを、\nあてもなく書きつけていると、\n不思議なほど正気を失ったような気持ちになる。",
  items: [
    { type: "古語", term: "つれづれなり", pos: "形容動詞", conjType: "ナリ活用", conjForm: "語幹", meaning: "することがなく退屈だ。所在ない。", explain: "「つれづれなる」は連体形。" },
    { type: "助詞", term: "こそ", pos: "助詞（係助詞）", conjType: "", conjForm: "", meaning: "強意", explain: "文末の「けれ」は已然形で、係り結び。" },
    { type: "係り結び", term: "こそ〜けれ", pos: "", conjType: "", conjForm: "", meaning: "", explain: "係助詞「こそ」の結びは已然形になる。" },
    { type: "表現", term: "あやしう", pos: "形容詞", conjType: "シク活用", conjForm: "連用形", meaning: "不思議だ", explain: "「あやしく」のウ音便。" }
  ],
  notes: "発問：作者はなぜ「ものぐるほしけれ」と感じたのか。"
};

/* ---------- データ正規化・マイグレーション ---------- */
function normItem(it) {
  it = it && typeof it === "object" ? it : {};
  return { ...it, type: str(it.type) || "その他", term: str(it.term), pos: str(it.pos), conjType: str(it.conjType), conjForm: str(it.conjForm), meaning: str(it.meaning), explain: str(it.explain) };
}
function normLesson(x) {
  x = x && typeof x === "object" ? x : {};
  const v = x.view && typeof x.view === "object" ? x.view : {};
  return {
    ...x, id: str(x.id) || uid(), title: str(x.title), source: str(x.source), className: str(x.className), session: str(x.session),
    goal: str(x.goal), original: str(x.original), translation: str(x.translation), notes: str(x.notes),
    items: (Array.isArray(x.items) ? x.items : []).map(normItem),
    marks: (Array.isArray(x.marks) ? x.marks : []).filter(m => m && Number.isFinite(m.s) && Number.isFinite(m.e)).map(m => ({ s: m.s | 0, e: m.e | 0, c: m.c === 2 ? 2 : 1 })),
    drawings: (Array.isArray(x.drawings) ? x.drawings : []).filter(s => s && Array.isArray(s.points)),
    view: { size: clamp(+v.size || 1.9, 1, 4.5), lh: clamp(+v.lh || 2, 1.3, 3.5), ls: clamp(v.ls == null || isNaN(+v.ls) ? 0.08 : +v.ls, 0, 0.6) },
    ver: SCHEMA
  };
}
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) {}
  if (raw) {
    try {
      const x = JSON.parse(raw);
      if (Array.isArray(x) && x.length) {
        let ver = null; try { ver = localStorage.getItem(SCHEMA_KEY); } catch (e) {}
        if (ver !== String(SCHEMA)) { // 初回移行前にバックアップを残す
          try { if (!localStorage.getItem(KEY + "-backup-v2")) localStorage.setItem(KEY + "-backup-v2", raw); } catch (e) {}
        }
        const out = x.filter(y => y && typeof y === "object").map(normLesson);
        if (out.length) return out;
      }
    } catch (e) { // 壊れたデータは上書きせず退避
      try { localStorage.setItem(KEY + "-corrupt-" + Date.now(), raw); } catch (_) {}
    }
  }
  return [normLesson(structuredClone(demo))];
}

/* ---------- 状態 ---------- */
let lessons = load(), current = null;
let staged = false, revealStep = 4, fontScale = 1;
let presStep = 0, presScale = 1, presShow = [false, false, false, false];
let hiddenTypes = new Set(), focusTerm = "", activeLine = -1, lastSel = null;
let saveTimer = 0, renderQueued = false;
let drawingEnabled = false, eraserMode = false, penColor = "#ffdf55", penWidth = 3, fingerDraw = false;

/* ---------- 保存 ---------- */
function setStatus(t) { $("save-status").textContent = t; }
function persist() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(lessons));
    localStorage.setItem(SCHEMA_KEY, String(SCHEMA));
    const d = new Date();
    setStatus("保存済み ✓ " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"));
    return true;
  } catch (e) { setStatus("保存できません"); toast("保存できません。容量を確認し、書き出しでバックアップしてください"); return false; }
}
function scheduleSave() { setStatus("保存中…"); clearTimeout(saveTimer); saveTimer = setTimeout(persist, 500); }
function toast(s) { const t = $("toast"); t.textContent = s; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2200); }

/* ---------- 盤面の骨組み（板書・投影で同一レイアウト） ---------- */
const skeleton = p => `
<div class="board-top"><span id="${p}-class"></span><span id="${p}-session"></span></div>
<h2 id="${p}-title"></h2><div class="board-source" id="${p}-source"></div>
<div class="board-cols" id="${p}-cols">
 <section class="col-left" id="${p}-left">
  <div class="chips" id="${p}-chips"></div>
  <div class="pane" id="${p}-tr-wrap"><h3 class="cyan">現代語訳</h3><div id="${p}-translation" class="translation-text"></div></div>
  <div class="pane" id="${p}-words-wrap"><h3 class="gold">語句・品詞</h3><div id="${p}-words" class="items"></div></div>
  <div class="pane" id="${p}-gram-wrap"><h3 class="pink">文法事項</h3><div id="${p}-gram" class="items"></div></div>
 </section>
 <section class="col-right" id="${p}-orig-wrap"><h3 class="yellow">古文本文</h3><div id="${p}-original" class="original-text"></div></section>
</div>
<canvas class="draw-canvas" id="${p}-canvas"></canvas>`;

const penTools = () => `
<button class="btn small" data-act="draw">✎ 手書き：OFF</button>
<span class="swatches">${["#ffdf55", "#ffffff", "#ff7b7b", "#7fd8ff", "#8be28f"].map(c => `<button class="swatch" data-color="${c}" style="background:${c}" aria-label="ペン色 ${c}"></button>`).join("")}<input type="color" data-act="color" value="#ffdf55" aria-label="ペンの色"></span>
<label class="range">太さ<input type="range" data-act="width" min="1" max="14" value="3"></label>
<button class="btn small" data-act="eraser">消しゴム</button>
<button class="btn small" data-act="undo">↶ 元に戻す</button>
<button class="btn small" data-act="clear">全消去</button>
<label class="check"><input type="checkbox" data-act="finger">指でも描く</label>`;
const markTools = () => `
<button class="btn small mark-y" data-mark="1">強調 黄</button>
<button class="btn small mark-r" data-mark="2">強調 赤</button>
<button class="btn small" data-mark="0">選択部分を解除</button>
<button class="btn small" data-mark="x">強調を全解除</button>`;

$("board").innerHTML = skeleton("b");
$("pres-board").innerHTML = skeleton("p");
document.querySelectorAll("[data-tools]").forEach(el => { el.innerHTML = el.dataset.tools === "pen" ? penTools() : markTools(); });

/* ---------- 描画ヘルパ ---------- */
const getOrig = () => (current ? current.original.replace(/\r/g, "") : "");
function hitSet(text, term) {
  const s = new Set(); let t = str(term).trim();
  if (!t) return s;
  while (t && !text.includes(t)) { if (t.length <= 2) { t = ""; break; } t = t.slice(0, -1); } // 活用語尾を落として探す
  if (!t) return s;
  for (let i = text.indexOf(t); i >= 0; i = text.indexOf(t, i + t.length)) for (let k = 0; k < t.length; k++) s.add(i + k);
  return s;
}
function originalHTML() {
  const text = getOrig();
  if (!text.trim()) return '<p class="empty">古文本文が未入力です（教材編集で入力してください）</p>';
  const cls = new Array(text.length).fill(0);
  current.marks.forEach(m => { for (let i = Math.max(0, m.s); i < Math.min(text.length, m.e); i++) cls[i] = m.c; });
  const hits = hitSet(text, focusTerm);
  let idx = 0, n = 0, out = "";
  for (const line of text.split("\n")) {
    if (!line.trim()) { idx += line.length + 1; continue; }
    out += `<p class="vline${activeLine === n ? " active" : ""}" data-line="${n}"><span class="lno">${n + 1}</span>`;
    for (const ch of line) {
      const c = [cls[idx] ? "m" + cls[idx] : "", hits.has(idx) ? "hit" : ""].filter(Boolean).join(" ");
      out += `<span class="ch${c ? " " + c : ""}" data-i="${idx}">${esc(ch)}</span>`;
      idx += ch.length;
    }
    idx += 1; n++; out += "</p>";
  }
  return out;
}
function translationHTML() {
  const lines = str(current.translation).replace(/\r/g, "").split("\n").filter(l => l.trim());
  if (!lines.length) return '<p class="empty">現代語訳が未入力です</p>';
  return lines.map((l, i) => `<div class="tr-block${activeLine === i ? " active" : ""}" data-line="${i}"><span class="lno">${i + 1}</span><span class="tr-text">${esc(l)}</span></div>`).join("");
}
function itemHTML(it) {
  const meta = [it.pos && "品詞 " + it.pos, it.conjType && "活用 " + it.conjType, it.conjForm].filter(Boolean).join(" ｜ ");
  const focus = focusTerm && focusTerm === it.term ? " focus" : "";
  return `<div class="item${focus}" data-t="${esc(it.type)}" data-term="${esc(it.term)}"><div class="item-head"><span class="term">${esc(it.term) || "（語句未入力）"}</span><span class="tag">${esc(it.type)}</span></div>${meta ? `<div class="meta">${esc(meta)}</div>` : ""}${it.meaning ? `<div class="meaning"><b>意味</b>${esc(it.meaning)}</div>` : ""}${it.explain ? `<div class="explain">${esc(it.explain)}</div>` : ""}</div>`;
}
function renderChips(p) {
  const counts = new Map();
  current.items.forEach(it => { if (it.term || it.explain || it.meaning) counts.set(it.type, (counts.get(it.type) || 0) + 1); });
  let html = [...counts].map(([t, n]) => `<button class="chip${hiddenTypes.has(t) ? " off" : ""}" data-chip="${esc(t)}">${esc(t)} ${n}</button>`).join("");
  if (hiddenTypes.size) html += '<button class="chip all" data-chip="*">すべて表示</button>';
  $(p + "-chips").innerHTML = html;
}
function renderItemPanels(p) {
  const vis = current.items.filter(x => (x.term || x.explain || x.meaning) && !hiddenTypes.has(x.type));
  const words = vis.filter(x => !GRAMMAR_TYPES.has(x.type)), gram = vis.filter(x => GRAMMAR_TYPES.has(x.type));
  $(p + "-words").innerHTML = words.map(itemHTML).join("") || '<span class="empty">語句は登録されていません</span>';
  $(p + "-gram").innerHTML = gram.map(itemHTML).join("") || '<span class="empty">文法事項は登録されていません</span>';
}
function paneVisible(p, i) {
  if (p === "p") return presShow[i];
  const cb = document.querySelector(`.show-pane[data-pane="${PANES[i]}"]`);
  return cb.checked && (!staged || i < revealStep);
}
function applyVisibility(p) {
  const v = PANES.map((_, i) => paneVisible(p, i));
  $(p + "-orig-wrap").hidden = !v[0]; $(p + "-tr-wrap").hidden = !v[1]; $(p + "-words-wrap").hidden = !v[2]; $(p + "-gram-wrap").hidden = !v[3];
  const left = v[1] || v[2] || v[3];
  $(p + "-left").hidden = !left;
  const cols = $(p + "-cols"); cols.classList.toggle("no-left", !left); cols.classList.toggle("no-orig", !v[0]);
  $(p + "-chips").hidden = !(v[2] || v[3]);
}
function applyView(p) {
  const host = $(p === "b" ? "board" : "pres-board"), v = current.view;
  host.style.setProperty("--o-size", v.size + "em"); host.style.setProperty("--o-lh", v.lh); host.style.setProperty("--o-ls", v.ls + "em");
  host.style.fontSize = (p === "b" ? fontScale : presScale) + "em";
}
function renderSurface(p) {
  if (!current) return;
  $(p + "-class").textContent = current.className || "高校古典";
  $(p + "-session").textContent = current.session || "授業用板書";
  $(p + "-title").textContent = current.title || "古典授業";
  $(p + "-source").textContent = current.source ? "出典：" + current.source : "";
  $(p + "-source").hidden = !current.source;
  $(p + "-original").innerHTML = originalHTML();
  $(p + "-translation").innerHTML = translationHTML();
  renderItemPanels(p); renderChips(p); applyView(p); applyVisibility(p);
  if (p === "p") updatePresCount();
}
function renderOriginalOnly() { ["b", "p"].forEach(p => { $(p + "-original").innerHTML = originalHTML(); $(p + "-translation").innerHTML = translationHTML(); }); }
function renderAll() {
  renderQueued = false;
  if (!current) return;
  $("workspace-title").textContent = current.title || "名称未設定";
  $("workspace-subtitle").textContent = [current.className, current.session, current.goal].filter(Boolean).join(" ・ ");
  $("tn-goal").textContent = current.goal || "（未設定）"; $("tn-notes").textContent = current.notes;
  renderSurface("b");
  if (!$("presentation").hidden) renderSurface("p");
  requestAnimationFrame(redrawAll);
}
function scheduleRender() { if (!renderQueued) { renderQueued = true; requestAnimationFrame(renderAll); } }

/* ---------- 一覧・フォーム ---------- */
function renderList() {
  $("lesson-list").innerHTML = lessons.map(x => `<button class="lesson-entry ${current && x.id === current.id ? "selected" : ""}" data-id="${esc(x.id)}"><strong>${esc(x.title || "名称未設定")}</strong><small>${esc([x.className, x.session].filter(Boolean).join(" ・ ") || "授業教材")}</small></button>`).join("");
}
function typeOptions(t) {
  const list = TYPES.includes(t) ? TYPES : [...TYPES, t];
  return list.map(o => `<option${o === t ? " selected" : ""}>${esc(o)}</option>`).join("");
}
function renderItemsEditor() {
  $("items-editor").innerHTML = current.items.map((it, i) => `
<div class="item-card" data-index="${i}" data-t="${esc(it.type)}">
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
</div>`).join("") || '<p class="hint">項目はまだありません。上のボタンから追加してください。</p>';
}
function fill() {
  const x = current; if (!x) return;
  $("lesson-title").value = x.title; $("lesson-source").value = x.source; $("lesson-class").value = x.className; $("lesson-session").value = x.session;
  $("lesson-goal").value = x.goal; $("lesson-original").value = x.original; $("lesson-translation").value = x.translation; $("lesson-notes").value = x.notes;
  $("v-size").value = x.view.size; $("v-lh").value = x.view.lh; $("v-ls").value = x.view.ls;
  renderItemsEditor();
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
function onEdit() { readForm(); scheduleRender(); scheduleSave(); clearTimeout(onEdit.t); onEdit.t = setTimeout(renderList, 250); }
function selectLesson(id) {
  const x = lessons.find(l => l.id === id); if (!x) return;
  current = x; focusTerm = ""; activeLine = -1; lastSel = null; hiddenTypes = new Set();
  fill(); renderList(); renderAll(); syncTools();
}
function blank() { return normLesson({ id: uid(), title: "新しい授業" }); }

/* ---------- 教材の操作 ---------- */
$("lesson-list").addEventListener("click", e => { const b = e.target.closest("[data-id]"); if (b) { readForm(); persist(); selectLesson(b.dataset.id); } });
$("new-lesson").onclick = () => { readForm(); const x = blank(); lessons.unshift(x); persist(); selectLesson(x.id); document.querySelector('[data-tab="edit"]').click(); toast("新しい授業を作成しました"); };
$("save-lesson").onclick = () => { readForm(); if (persist()) { renderList(); renderAll(); toast("教材を保存しました"); } };
$("duplicate").onclick = () => { if (!current) return; readForm(); const x = normLesson(structuredClone(current)); x.id = uid(); x.title = (x.title || "授業") + "（複製）"; lessons.unshift(x); persist(); selectLesson(x.id); toast("教材を複製しました"); };
$("delete").onclick = () => {
  if (!current || !confirm(`「${current.title || "名称未設定"}」を削除しますか？（元に戻せません。必要なら先に書き出してください）`)) return;
  lessons = lessons.filter(x => x.id !== current.id);
  if (!lessons.length) lessons.push(blank());
  persist(); selectLesson(lessons[0].id); toast("教材を削除しました");
};
["lesson-title", "lesson-source", "lesson-class", "lesson-session", "lesson-goal", "lesson-original", "lesson-translation", "lesson-notes"].forEach(id => $(id).addEventListener("input", onEdit));
$("items-editor").addEventListener("input", onEdit);
$("items-editor").addEventListener("change", e => { if (e.target.dataset.field === "type") { e.target.closest(".item-card").dataset.t = e.target.value; } onEdit(); });
$("items-editor").addEventListener("click", e => {
  const b = e.target.closest("[data-op]"); if (!b) return;
  readForm();
  const i = +b.closest(".item-card").dataset.index, a = current.items, op = b.dataset.op;
  if (op === "del") a.splice(i, 1);
  else if (op === "dup") a.splice(i + 1, 0, { ...a[i] });
  else if (op === "up" && i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]];
  else if (op === "down" && i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]];
  renderItemsEditor(); onEdit();
});
document.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
  if (!current) return; readForm();
  current.items.push(normItem({ type: b.dataset.add })); renderItemsEditor(); onEdit();
  const t = $("items-editor").querySelector(".item-card:last-child [data-field=term]"); if (t) t.focus();
});
$("split-lines").onclick = () => { $("lesson-original").value = $("lesson-original").value.replace(/\r/g, "").replace(/([。！？])\n?/g, "$1\n").replace(/\n+$/, ""); onEdit(); };
$("split-trans").onclick = () => { $("lesson-translation").value = $("lesson-translation").value.replace(/\r/g, "").replace(/([。！？])\n?/g, "$1\n").replace(/\n+$/, ""); onEdit(); };
$("copy-original").onclick = async () => { try { await navigator.clipboard.writeText($("lesson-original").value); toast("本文をコピーしました"); } catch (e) { toast("コピーできませんでした"); } };
$("suggest-grammar").onclick = () => {
  readForm(); const text = current.original;
  const P = [["係助詞", "こそ", "助詞", "係り結び。結びの語が已然形になるか確認。"], ["係助詞", "ぞ", "助詞", "係り結び。結びの語が連体形になるか確認。"], ["係助詞", "なむ", "助詞", "係り結び。結びの語が連体形になるか確認。"], ["係助詞", "や", "助詞", "係り結び・疑問/反語など文脈を確認。"], ["係助詞", "か", "助詞", "係り結び・疑問/反語など文脈を確認。"], ["助動詞候補", "ず", "助動詞", "打消の助動詞候補。接続と活用形を確認。"], ["助動詞候補", "む", "助動詞", "推量・意志など。接続と文脈を確認。"], ["助動詞候補", "けり", "助動詞", "過去・詠嘆。接続と文脈を確認。"], ["助動詞候補", "べし", "助動詞", "推量・当然・可能など。文脈を確認。"], ["助動詞候補", "なり", "助動詞", "断定・伝聞推定など。接続を確認。"], ["敬語候補", "給ふ", "動詞（敬語）", "尊敬・謙譲など。活用と主語を確認。"]];
  const found = P.filter(p => text.includes(p[1]) && !current.items.some(i => i.term === p[1]));
  found.forEach(p => current.items.push(normItem({ type: p[0], term: p[1], pos: p[2], explain: p[3] })));
  renderItemsEditor(); onEdit(); toast(found.length ? `${found.length}件の候補を追加しました` : "新しい候補は見つかりませんでした");
};

/* ---------- 書き出し・読み込み ---------- */
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
    const replace = confirm(`${inc.length}件の教材を読み込みます。\n\nOK＝現在の教材をすべて置き換える\nキャンセル＝現在の教材を残し、追加・同一IDは更新する`);
    if (replace) lessons = inc;
    else inc.forEach(n => { const i = lessons.findIndex(l => l.id === n.id); if (i >= 0) lessons[i] = n; else lessons.push(n); });
    persist(); selectLesson((inc[0] || lessons[0]).id); toast(`${inc.length}件を読み込みました`);
  } catch (err) { toast("ファイル形式を確認してください"); }
  e.target.value = "";
};

/* ---------- タブ・表示操作 ---------- */
document.querySelectorAll(".tab").forEach(b => b.onclick = () => {
  if (b.dataset.tab !== "edit") readForm();
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === b));
  document.querySelectorAll(".tab-panel").forEach(x => x.classList.toggle("active", x.id === "tab-" + b.dataset.tab));
  if (b.dataset.tab === "board") { renderAll(); }
});
$("open-board").onclick = () => document.querySelector('[data-tab="board"]').click();
document.querySelectorAll(".show-pane").forEach(cb => cb.onchange = () => { applyVisibility("b"); requestAnimationFrame(redrawAll); });
$("reveal-mode").onclick = () => { staged = true; revealStep = 0; applyVisibility("b"); toast("段階表示を開始しました。「次を表示」で順に提示します"); };
$("reveal-next").onclick = () => { if (!staged) { staged = true; revealStep = 0; } revealStep = Math.min(4, revealStep + 1); applyVisibility("b"); requestAnimationFrame(redrawAll); };
$("reveal-all").onclick = () => { staged = false; revealStep = 4; applyVisibility("b"); requestAnimationFrame(redrawAll); };
$("font-up").onclick = () => { fontScale = Math.min(1.5, +(fontScale + .1).toFixed(2)); applyView("b"); requestAnimationFrame(redrawAll); };
$("font-down").onclick = () => { fontScale = Math.max(.8, +(fontScale - .1).toFixed(2)); applyView("b"); requestAnimationFrame(redrawAll); };
$("print-board").onclick = () => window.print();
[["v-size", "size"], ["v-lh", "lh"], ["v-ls", "ls"]].forEach(([id, k]) => $(id).addEventListener("input", e => { if (!current) return; current.view[k] = +e.target.value; applyView("b"); applyView("p"); scheduleSave(); }));

// 本文↔現代語訳の対応、語句→本文ハイライト、タイプ絞り込み
document.addEventListener("click", e => {
  const sel = window.getSelection && window.getSelection().toString();
  const ln = e.target.closest(".vline, .tr-block");
  if (ln && !sel) {
    const n = +ln.dataset.line; activeLine = activeLine === n ? -1 : n; renderOriginalOnly();
    if (activeLine >= 0) document.querySelectorAll(`.tr-block[data-line="${n}"], .vline[data-line="${n}"]`).forEach(el => { if (el !== ln) el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); });
    return;
  }
  const it = e.target.closest(".item");
  if (it && !sel) { const t = it.dataset.term; focusTerm = focusTerm === t ? "" : t; ["b", "p"].forEach(p => { renderItemPanels(p); $(p + "-original").innerHTML = originalHTML(); }); return; }
  const ch = e.target.closest("[data-chip]");
  if (ch) { const t = ch.dataset.chip; if (t === "*") hiddenTypes.clear(); else if (hiddenTypes.has(t)) hiddenTypes.delete(t); else hiddenTypes.add(t); ["b", "p"].forEach(p => { renderItemPanels(p); renderChips(p); }); }
});

/* ---------- 強調（本文の選択範囲） ---------- */
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
  if (kind === "x") { if (current.marks.length && confirm("この教材の強調をすべて解除しますか？")) { current.marks = []; renderOriginalOnly(); scheduleSave(); } return; }
  const r = selectionRange() || lastSel;
  if (!r) { toast("本文の文字をなぞって選択してから押してください"); return; }
  cutMarks(r.s, r.e);
  if (kind !== "0") current.marks.push({ s: r.s, e: r.e, c: +kind });
  lastSel = null; window.getSelection().removeAllRanges(); renderOriginalOnly(); scheduleSave();
}
document.addEventListener("pointerdown", e => { if (e.target.closest("[data-mark]")) e.preventDefault(); }); // 選択を保つ
document.addEventListener("click", e => { const b = e.target.closest("[data-mark]"); if (b) applyMark(b.dataset.mark); });

/* ---------- 投影モード ---------- */
function setPresStep(n) { presStep = clamp(n, 0, 4); presShow = presShow.map((_, i) => i < presStep); renderPresPanes(); }
function renderPresPanes() { applyVisibility("p"); updatePresCount(); requestAnimationFrame(() => drawFull("p")); }
function updatePresCount() {
  const n = presShow.filter(Boolean).length;
  $("pres-count").textContent = n === 4 ? "全表示" : `${n} / 4 表示中`;
  document.querySelectorAll(".pres-pane").forEach(b => b.classList.toggle("on", presShow[+b.dataset.pane]));
}
function openPres() {
  if (!current) return; readForm(); persist();
  $("presentation").hidden = false; document.body.classList.add("projecting");
  renderSurface("p"); setPresStep(0); syncTools();
  const el = $("presentation"), rf = el.requestFullscreen || el.webkitRequestFullscreen;
  if (rf) try { const r = rf.call(el); if (r && r.catch) r.catch(() => {}); } catch (e) {}
  requestAnimationFrame(redrawAll);
}
function exitPres() {
  $("presentation").hidden = true; document.body.classList.remove("projecting");
  const fe = document.fullscreenElement || document.webkitFullscreenElement;
  if (fe) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }
  renderAll();
}
$("project-btn").onclick = openPres;
$("pres-exit").onclick = exitPres;
$("pres-next").onclick = () => setPresStep(presStep + 1);
$("pres-prev").onclick = () => setPresStep(presStep - 1);
$("pres-all").onclick = () => setPresStep(4);
document.querySelectorAll(".pres-pane").forEach(b => b.onclick = () => { const i = +b.dataset.pane; presShow[i] = !presShow[i]; renderPresPanes(); });
$("pres-font-up").onclick = () => { presScale = Math.min(1.8, +(presScale + .1).toFixed(2)); applyView("p"); requestAnimationFrame(redrawAll); };
$("pres-font-down").onclick = () => { presScale = Math.max(.7, +(presScale - .1).toFixed(2)); applyView("p"); requestAnimationFrame(redrawAll); };
function osize(d) { if (!current) return; current.view.size = clamp(+(current.view.size + d).toFixed(2), 1.2, 4.2); $("v-size").value = current.view.size; applyView("b"); applyView("p"); scheduleSave(); }
$("pres-osize-up").onclick = () => osize(.2);
$("pres-osize-down").onclick = () => osize(-.2);

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
  else if (k === "+" || k === "=") $("pres-font-up").click();
  else if (k === "-") $("pres-font-down").click();
  else if (k >= "1" && k <= "4") { const i = +k - 1; presShow[i] = !presShow[i]; renderPresPanes(); }
  else if (k === "d" || k === "D") setDraw(!drawingEnabled);
  else if (k === "e" || k === "E") toggleEraser();
});
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) { /* Esc で全画面だけ解除された場合も投影は維持 */ } requestAnimationFrame(redrawAll); });

/* ---------- 手書き（Pointer Events） ---------- */
const activeSurface = () => ($("presentation").hidden ? "b" : "p");
const strokesFor = p => (current ? current.drawings.filter(s => !s.surface || s.surface === p) : []);
function strokeWidth(s, pt) { return (s.width || 3) * (s.erase ? 4 : 0.35 + 0.9 * (pt.p || 0.5)); }
function drawStroke(ctx, r, s) {
  const pts = s.points; if (!pts.length) return;
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
  ctx.strokeStyle = ctx.fillStyle = s.color || "#ffdf55";
  if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0].x * r.width, pts[0].y * r.height, strokeWidth(s, pts[0]) / 2, 0, Math.PI * 2); ctx.fill(); }
  else for (let i = 1; i < pts.length; i++) segment(ctx, r, s, i);
  ctx.globalCompositeOperation = "source-over";
}
function segment(ctx, r, s, i) {
  const a = s.points[i - 1], b = s.points[i];
  ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over"; ctx.strokeStyle = s.color || "#ffdf55"; ctx.lineCap = "round"; ctx.lineWidth = strokeWidth(s, b);
  ctx.beginPath(); ctx.moveTo(a.x * r.width, a.y * r.height); ctx.lineTo(b.x * r.width, b.y * r.height); ctx.stroke();
}
function prepCtx(p) {
  const c = $(p + "-canvas"), r = c.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1);
  return { c, r, dpr, ctx: c.getContext("2d") };
}
function drawFull(p) {
  const host = $(p === "b" ? "board" : "pres-board"), r0 = host.getBoundingClientRect();
  if (r0.width < 2 || r0.height < 2) return;
  const { c, r, dpr, ctx } = prepCtx(p);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  strokesFor(p).forEach(s => drawStroke(ctx, r, s));
}
function redrawAll() { drawFull("b"); if (!$("presentation").hidden) drawFull("p"); }
function syncTools() {
  document.body.classList.toggle("drawing", drawingEnabled);
  ["board", "pres-board"].forEach(id => $(id).classList.toggle("drawing-enabled", drawingEnabled));
  document.querySelectorAll('[data-act="draw"]').forEach(b => { b.textContent = drawingEnabled ? "✎ 手書き：ON" : "✎ 手書き：OFF"; b.classList.toggle("on", drawingEnabled); });
  document.querySelectorAll('[data-act="eraser"]').forEach(b => b.classList.toggle("on", eraserMode));
  document.querySelectorAll('[data-act="finger"]').forEach(b => { b.checked = fingerDraw; });
  document.querySelectorAll('[data-act="width"]').forEach(b => { b.value = penWidth; });
  document.querySelectorAll('[data-act="color"]').forEach(b => { b.value = penColor; });
  document.querySelectorAll(".swatch").forEach(b => b.classList.toggle("on", !eraserMode && b.dataset.color === penColor));
}
function setDraw(on) { drawingEnabled = on; syncTools(); toast(on ? "手書きON：Apple Pencilで書けます（指ではスクロールしません）" : "手書きOFF：指でスクロールできます"); }
function toggleEraser() { eraserMode = !eraserMode; if (eraserMode && !drawingEnabled) drawingEnabled = true; syncTools(); toast(eraserMode ? "消しゴム" : "ペンに戻しました"); }
function undo() {
  if (!current) return; const p = activeSurface(), list = current.drawings;
  for (let i = list.length - 1; i >= 0; i--) { const s = list[i]; if (!s.surface || s.surface === p) { list.splice(i, 1); drawFull(p); scheduleSave(); return; } }
  toast("元に戻す書き込みがありません");
}
function clearDrawings() {
  if (!current) return; const p = activeSurface();
  if (!strokesFor(p).length) { toast("書き込みはありません"); return; }
  if (!confirm("この画面の手書きをすべて消去しますか？（元に戻せません）")) return;
  current.drawings = current.drawings.filter(s => !(!s.surface || s.surface === p)); drawFull(p); scheduleSave(); toast("手書きを消去しました");
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
document.addEventListener("change", e => { if (e.target.dataset && e.target.dataset.act === "finger") { fingerDraw = e.target.checked; syncTools(); } });

["b", "p"].forEach(p => {
  const c = $(p + "-canvas"); let cur = null, pid = null;
  const pt = e => { const r = c.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1), p: e.pointerType === "mouse" ? 0.5 : (e.pressure || 0.5) }; };
  c.addEventListener("pointerdown", e => {
    if (!drawingEnabled || !current) return;
    e.preventDefault();
    if (e.pointerType === "touch" && !fingerDraw) return; // 指（手のひら）では描かない
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pid = e.pointerId; try { c.setPointerCapture(pid); } catch (_) {}
    cur = { color: penColor, width: penWidth, erase: eraserMode, surface: p, points: [pt(e)] };
    current.drawings.push(cur);
    const { ctx, r, dpr } = prepCtx(p); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawStroke(ctx, r, cur);
  });
  c.addEventListener("pointermove", e => {
    if (!cur || e.pointerId !== pid) return; e.preventDefault();
    const { ctx, r, dpr } = prepCtx(p); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (evs.length ? evs : [e]).forEach(ev => { cur.points.push(pt(ev)); segment(ctx, r, cur, cur.points.length - 1); });
    ctx.globalCompositeOperation = "source-over";
  });
  const end = e => { if (!cur || e.pointerId !== pid) return; cur = null; pid = null; try { c.releasePointerCapture(e.pointerId); } catch (_) {} scheduleSave(); };
  c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
  c.addEventListener("contextmenu", e => e.preventDefault());
  c.addEventListener("touchmove", e => { if (drawingEnabled) e.preventDefault(); }, { passive: false }); // iPad Safari でスクロール防止
});

/* ---------- 初期化 ---------- */
const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => redrawAll()) : null;
if (ro) { ro.observe($("board")); ro.observe($("pres-board")); }
window.addEventListener("resize", redrawAll);
const flush = () => { if (current) { readForm(); persist(); } };
window.addEventListener("beforeunload", flush);
window.addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const had = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.register("./sw.js").then(r => r.update && r.update()).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (had && !reloaded && $("presentation").hidden) { reloaded = true; flush(); location.reload(); } });
}

selectLesson(lessons[0].id);
persist(); // マイグレーション結果を保存
})();
