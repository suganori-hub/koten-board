/* KOTEN BOARD v4
 * 保存キーは従来どおり koten-board-v1（教材の配列）。v2/v3のデータはそのまま読み込み、新項目は自動補完。
 * 板書は 1600x900 の固定ステージで組み、画面に合わせて拡大縮小する（端末・向きが変わっても配置が崩れない）。
 */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const KEY = "koten-board-v1", SCHEMA_KEY = "koten-board-schema", SCHEMA = 4;
const TOMB_KEY = "koten-board-tombstones", SYNC_KEY = "koten-board-sync", AI_KEY = "koten-board-ai", VDRAW_KEY = "koten-board-viewer-drawings";
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
  const o = { ...it, type: str(it.type) || "その他", term: str(it.term), pos: str(it.pos), conjType: str(it.conjType), conjForm: str(it.conjForm), meaning: str(it.meaning), explain: str(it.explain), line: it.line == null ? "" : String(it.line) };
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
      auto: v.auto !== false, oPx: clamp(+v.oPx || oldSize || 0, 0, 340), tPx: clamp(+v.tPx || 0, 0, 260), wPx: clamp(+v.wPx || 0, 0, 160),
      per: ["auto", "1", "2", "3", "4", "all"].includes(String(v.per)) ? String(v.per) : "auto", brk: v.brk !== false
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
let lessons = load(), tombs = rd(TOMB_KEY, {}), vdraw = rd(VDRAW_KEY, {}), current = null;
let presShow = [true, true, true, true];
let hiddenTypes = new Set(), focusTerm = "", activeLine = -1, lastSel = null;
let saveTimer = 0, renderQueued = false, pendingRender = false, strokeActive = false, lastEditAt = 0;
let drawingEnabled = false, eraserMode = false, penColor = "#ffdf55", penWidth = 3, fingerDraw = false, autoPen = true;
const stageScale = { b: 1, p: 1 }; let lastFit = { o: 60, t: 45, w: 30 };

/* ================= 保存 ================= */
function setStatus(t) { $("save-status").textContent = t; }
function persist() {
  clearTimeout(saveTimer);
  const ok = wr(KEY, lessons) && wr(TOMB_KEY, tombs) && wr(VDRAW_KEY, vdraw);
  try { localStorage.setItem(SCHEMA_KEY, String(SCHEMA)); } catch (e) {}
  if (ok) setStatus("保存済み ✓ " + hhmm()); else { setStatus("保存できません"); toast("保存できません。容量を確認し、書き出しでバックアップしてください"); }
  return ok;
}
function scheduleSave() { setStatus("保存中…"); clearTimeout(saveTimer); saveTimer = setTimeout(persist, 500); }
function markDirty() { if (!current) return; if (isViewer()) { scheduleSave(); return; } current.updatedAt = Date.now(); lastEditAt = Date.now(); scheduleSave(); scheduleSync(); }
function toast(s) { const t = $("toast"); t.textContent = s; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600); }

/* ================= 盤面の骨組み（本文の一文ごとに「本文→現代語訳→語句→文法」を右から左へ横並び） ================= */
const skeleton = p => `<div class="groups" id="${p}-groups"></div>
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
const penLite = () => `
<button class="btn fb" data-act="draw" data-short="1">✎ OFF</button>
<span class="swatches">${["#ffdf55", "#ffffff", "#ff7b7b", "#7fd8ff", "#8be28f"].map(c => `<button class="swatch" data-color="${c}" style="background:${c}" aria-label="ペン色 ${c}"></button>`).join("")}</span>
<label class="range">太さ<input type="range" data-act="width" min="1" max="14" value="3"></label>
<button class="btn fb" data-act="eraser">消しゴム</button>
<button class="btn fb" data-act="undo">↶ 戻す</button>`;
const markTools = () => `
<button class="btn small mark-y" data-mark="1">強調 黄</button>
<button class="btn small mark-r" data-mark="2">強調 赤</button>
<button class="btn small" data-mark="0">選択部分を解除</button>
<button class="btn small" data-mark="x">強調を全解除</button>`;

$("board").innerHTML = skeleton("b");
$("pres-board").innerHTML = skeleton("p");
document.querySelectorAll("[data-tools]").forEach(el => { el.innerHTML = el.dataset.tools === "pen" ? penTools() : el.dataset.tools === "penlite" ? penLite() : markTools(); });

const hostOf = p => $(p === "b" ? "board" : "pres-board");
const paneOn = (p, i) => (p === "p" ? presShow[i] : document.querySelector(`.show-pane[data-pane="${PANES[i]}"]`).checked);
// 表示状態：step＝解説を表示した文の数（0〜G）。pages＝1画面に出す文の範囲。page＝今の画面。
const S = { b: { step: null, pages: [], page: -1, key: "", G: 0 }, p: { step: 0, pages: [], page: -1, key: "", G: 0 } };
const MIN_O = 56; // 「自動」で1画面に入れる文の数を決めるときの、本文の最小文字サイズ(px)

/* ---------- 文の分割・語句の割り当て ---------- */
const getOrig = () => (current ? current.original.replace(/\r/g, "") : "");
function lineList(text, brk) { // [{s: 元文字列での開始位置, t: 表示する一文}]
  const out = []; let off = 0;
  const re = /[^。！？]*[。！？]+[」』）)]*|[^。！？]+/g;
  for (const raw of text.split("\n")) {
    if (brk) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(raw))) { const t = m[0], lead = t.length - t.trimStart().length; if (t.trim()) out.push({ s: off + m.index + lead, t: t.trim() }); }
    } else if (raw.trim()) out.push({ s: off + raw.length - raw.trimStart().length, t: raw.trim() });
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
function lineOfItem(it, texts) { // 語句が出てくる文の番号。手動指定（対応行）があればそれを優先
  const n = texts.length, m = parseInt(it.line, 10);
  if (m >= 1 && m <= n) return m - 1;
  const t = str(it.term).trim(); if (!t) return -1;
  const cands = [t]; t.split(/[〜～~・／/、，,]/).map(x => x.trim()).filter(x => x && x !== t).forEach(x => cands.push(x));
  for (const c of cands) for (let k = c.length; k >= Math.min(2, c.length); k--) { const i = texts.findIndex(x => x.includes(c.slice(0, k))); if (i >= 0) return i; }
  return -1;
}
function trLinesFor(n) { // 本文のi番目の文 ⇔ 現代語訳のi番目の文
  const tl = lineList(str(current.translation).replace(/\r/g, ""), current.view.brk).map(l => l.t);
  const out = []; for (let i = 0; i < n; i++) out.push(tl[i] || "");
  if (tl.length > n && n > 0) out[n - 1] += tl.slice(n).join("");
  return out;
}
function buildGroups() {
  const sents = lineList(getOrig(), current.view.brk), n = sents.length, texts = sents.map(x => x.t), tr = trLinesFor(n);
  const groups = sents.map((s, i) => ({ s, orig: true, tr: tr[i], words: [], gram: [] }));
  const rest = { s: null, orig: false, tr: "", words: [], gram: [] };
  current.items.forEach(it => {
    if (!(it.term || it.explain || it.meaning) || hiddenTypes.has(it.type)) return;
    const i = n ? lineOfItem(it, texts) : -1, g = i >= 0 ? groups[i] : rest;
    (GRAMMAR_TYPES.has(it.type) ? g.gram : g.words).push(it);
  });
  if (rest.words.length || rest.gram.length) groups.push(rest); // どの文にも当てはまらない項目は最後の「ほか」へ
  return groups;
}
function itemHTML(it, p) {
  const meta = [it.pos && "品詞 " + it.pos, it.conjType && "活用 " + it.conjType, it.conjForm].filter(Boolean).join(" ｜ ");
  const focus = focusTerm && focusTerm === it.term ? " focus" : "";
  const ai = it.ai && p === "b" ? '<span class="tag ai">AI下書き</span>' : "";
  return `<div class="item${focus}" data-t="${esc(it.type)}" data-term="${esc(it.term)}"><div class="item-head"><span class="term">${esc(it.term) || "（未入力）"}</span><span class="tag">${esc(it.type)}</span>${ai}</div>${meta ? `<div class="meta">${esc(meta)}</div>` : ""}${it.meaning ? `<div class="meaning">意味：${esc(it.meaning)}</div>` : ""}${it.explain ? `<div class="explain">${esc(it.explain)}</div>` : ""}</div>`;
}
function groupHTML(g, gi, p, cls, hits) {
  const act = activeLine === gi ? " active" : "";
  let h = `<div class="grp" data-g="${gi}"><span class="gno">${g.orig ? gi + 1 : "ほか"}</span>`;
  if (g.orig) {
    let idx = g.s.s; h += `<div class="gcol g-orig original-text${act}" data-g="${gi}">`;
    for (const ch of g.s.t) {
      const c = [cls[idx] ? "m" + cls[idx] : "", hits.has(idx) ? "hit" : ""].filter(Boolean).join(" ");
      h += `<span class="ch${c ? " " + c : ""}" data-i="${idx}">${esc(ch)}</span>`; idx += ch.length;
    }
    h += "</div>";
  }
  if (g.tr) h += `<div class="gcol g-tr${act}" data-g="${gi}">${esc(g.tr)}</div>`;
  if (g.words.length) h += `<div class="gcol g-words items">${g.words.map(x => itemHTML(x, p)).join("")}</div>`;
  if (g.gram.length) h += `<div class="gcol g-gram items">${g.gram.map(x => itemHTML(x, p)).join("")}</div>`;
  return h + "</div>";
}
function renderChips() {
  const counts = new Map();
  current.items.forEach(it => { if (it.term || it.explain || it.meaning) counts.set(it.type, (counts.get(it.type) || 0) + 1); });
  let html = [...counts].map(([t, n]) => `<button class="chip${hiddenTypes.has(t) ? " off" : ""}" data-chip="${esc(t)}">${esc(t)} ${n}</button>`).join("");
  if (hiddenTypes.size) html += '<button class="chip all" data-chip="*">すべて表示</button>';
  $("chips-b").innerHTML = html; $("chips-p").innerHTML = html;
}

/* ---------- ステージ（固定サイズ→拡縮）・文字サイズの自動最大化・ページ分割 ---------- */
function layoutStage(p) {
  const wrap = $("stage-" + p), host = hostOf(p);
  let s;
  if (p === "b") s = wrap.parentElement.clientWidth / STAGE_W;
  else { const a = $("stage-area"); s = Math.min(a.clientWidth / STAGE_W, a.clientHeight / STAGE_H); }
  if (!(s > 0.02)) return false;
  stageScale[p] = s; wrap.style.width = STAGE_W * s + "px"; wrap.style.height = STAGE_H * s + "px"; host.style.transform = `scale(${s})`;
  return true;
}
const sizeSet = s => ({ o: s, t: Math.max(26, s * 0.75), w: Math.max(26, s * 0.5) });
const manualSizes = () => { const v = current.view; return { o: v.oPx || Math.round(lastFit.o), t: v.tPx || Math.round(lastFit.t), w: v.wPx || Math.round(lastFit.w) }; };
function setSizes(host, z) { host.style.setProperty("--o-px", z.o + "px"); host.style.setProperty("--t-px", z.t + "px"); host.style.setProperty("--w-px", z.w + "px"); }
function fitMax(lo, hi, ok) { if (ok(hi)) return hi; if (!ok(lo)) return lo; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ok(m)) lo = m; else hi = m; } return lo; }
function applyView(p) {
  const host = hostOf(p), v = current.view;
  host.style.setProperty("--lh", v.lh); host.style.setProperty("--ls", v.ls + "em"); host.classList.toggle("fit", v.auto);
}
function computePages(p, G) {
  const per = current.view.per;
  if (!G) return [];
  if (per === "all") return [[0, G]];
  if (per !== "auto") { const k = Math.max(1, parseInt(per, 10) || 1), out = []; for (let a = 0; a < G; a += k) out.push([a, Math.min(G, a + k)]); return out; }
  // 自動：本文が最小サイズ以上で読める範囲で、1画面にできるだけ多くの文を入れる
  const wrap = $(p + "-groups"), gs = [...wrap.querySelectorAll(".grp")];
  setSizes(hostOf(p), current.view.auto ? sizeSet(MIN_O) : manualSizes());
  gs.forEach(g => g.classList.remove("off"));
  const cap = wrap.clientWidth, gap = parseFloat(getComputedStyle(wrap).columnGap) || 0, w = gs.map(g => g.offsetWidth), out = [];
  let a = 0;
  while (a < G) { let b = a + 1, used = w[a]; while (b < G && used + gap + w[b] <= cap) { used += gap + w[b]; b++; } out.push([a, b]); a = b; }
  return out;
}
function fitStage(p) {
  const host = hostOf(p), v = current.view, wrap = $(p + "-groups");
  const vis = [...wrap.querySelectorAll(".grp")].filter(g => !g.classList.contains("off"));
  wrap.classList.remove("scroll");
  if (!vis.length) return;
  if (!v.auto) { setSizes(host, manualSizes()); wrap.classList.add("scroll"); return; }
  const gap = parseFloat(getComputedStyle(wrap).columnGap) || 0, cap = wrap.clientWidth;
  const ok = () => vis.reduce((a, g) => a + g.offsetWidth, 0) + gap * (vis.length - 1) <= cap + 1;
  const s = fitMax(18, 320, x => { setSizes(host, sizeSet(x)); return ok(); });
  const z = sizeSet(s); setSizes(host, z); lastFit = z;
  if (!ok()) wrap.classList.add("scroll");
}
function pageOfStep(st, step) {
  if (!st.pages.length) return 0;
  const idx = clamp(step - 1, 0, st.G - 1), i = st.pages.findIndex(([a, b]) => idx >= a && idx < b);
  return i < 0 ? 0 : i;
}
function showPage(p) {
  const st = S[p], v = current.view, [a, b] = st.pages[st.page] || [0, 0];
  [...$(p + "-groups").querySelectorAll(".grp")].forEach((g, i) => g.classList.toggle("off", i < a || i >= b));
  const bits = [0, 1, 2, 3].map(i => (paneOn(p, i) ? 1 : 0)).join("");
  st.key = `g${a}-${b}_${bits}_${v.brk ? 1 : 0}_${v.auto ? "a" : `m${v.oPx}x${v.tPx}x${v.wPx}`}_${v.lh}_${v.ls}`;
  fitStage(p);
}
function applyStep(p) {
  const st = S[p]; if (!current) return;
  st.step = clamp(st.step == null ? 0 : st.step, 0, st.G);
  const pg = pageOfStep(st, st.step), changed = pg !== st.page; st.page = pg;
  [...$(p + "-groups").querySelectorAll(".grp")].forEach((g, i) => g.classList.toggle("pend", i >= st.step)); // 解説は step 番目までを表示（場所は確保したまま）
  if (changed) showPage(p);
  updateCount(p); drawFull(p);
}
function updateCount(p) {
  const st = S[p], el = $(p === "b" ? "b-count" : "pres-count"); if (!el) return;
  const pg = st.pages.length > 1 ? ` ・ 画面 ${st.page + 1}/${st.pages.length}` : "";
  el.textContent = st.G ? `解説 ${Math.min(st.step, st.G)} / ${st.G}${pg}` : "";
  if (p === "b" && $("bn-count")) $("bn-count").textContent = el.textContent;
}
function stepBy(p, d) {
  const st = S[p]; if (!current) return;
  if (st.fresh && d > 0 && st.pages[0] && st.pages[0][1] >= st.G) st.step = 0; // 全表示のまま「次へ」→最初の一文から解説を始める
  st.fresh = false;
  const before = st.step; st.step = clamp(st.step + d, 0, st.G);
  if (st.step === before && d > 0) toast("最後の文です");
  applyStep(p);
}
function revealPage(p) { const st = S[p]; if (!current) return; st.fresh = false; const [, b] = st.pages[Math.max(0, st.page)] || [0, 0]; st.step = b; applyStep(p); }
function renderSurface(p) {
  if (!current) return;
  const st = S[p], wrap = $(p + "-groups"), groups = buildGroups(); st.G = groups.length;
  const text = getOrig(), cls = new Array(text.length).fill(0);
  current.marks.forEach(m => { for (let i = Math.max(0, m.s); i < Math.min(text.length, m.e); i++) cls[i] = m.c; });
  const hits = hitSet(text, focusTerm);
  wrap.innerHTML = groups.length ? groups.map((g, i) => groupHTML(g, i, p, cls, hits)).join("") : '<p class="empty">本文が未入力です（教材編集で入力してください）</p>';
  ["orig", "tr", "words", "gram"].forEach((k, i) => wrap.classList.toggle("hide-" + k, !paneOn(p, i)));
  applyView(p);
  if (!layoutStage(p)) return;
  st.pages = computePages(p, st.G);
  if (st.step == null) { st.step = st.pages.length ? st.pages[0][1] : 0; st.fresh = true; } // 板書プレビューは最初の画面の解説をすべて表示
  st.page = -1; applyStep(p);
}
function renderOriginalOnly() { if ($("tab-board").classList.contains("active")) renderSurface("b"); if (!$("presentation").hidden) renderSurface("p"); }
function setActiveLine(n) { document.querySelectorAll(".g-orig,.g-tr").forEach(el => el.classList.toggle("active", +el.dataset.g === n)); }
function updateLinesNote() {
  const el = $("lines-note"); if (!el || !current) return;
  const n = lineList(getOrig(), current.view.brk).length, m = lineList(str(current.translation).replace(/\r/g, ""), current.view.brk).length, bad = n !== m && !!(n || m);
  el.textContent = `本文 ${n}文 ／ 現代語訳 ${m}文` + (bad ? "（数が違います。同じ数にすると、一文ずつ隣に表示されます）" : "");
  el.classList.toggle("warn", bad);
}
function syncViewUI() {
  if (!current) return; const v = current.view;
  document.querySelectorAll(".auto-fit").forEach(c => { c.checked = v.auto; });
  document.querySelectorAll(".auto-reset").forEach(b => { b.classList.toggle("primary", !v.auto); b.disabled = v.auto; });
  document.querySelectorAll(".brk-toggle").forEach(c => { c.checked = v.brk; });
  document.querySelectorAll(".per-select").forEach(c => { c.value = v.per; });
  $("v-opx").value = v.oPx || Math.round(lastFit.o); $("v-tpx").value = v.tPx || Math.round(lastFit.t); $("v-wpx").value = v.wPx || Math.round(lastFit.w);
  $("v-lh").value = v.lh; $("v-ls").value = v.ls;
  ["v-opx", "v-tpx", "v-wpx"].forEach(id => { $(id).disabled = v.auto; $(id).parentElement.style.opacity = v.auto ? .45 : 1; });
  syncPresPaneBtns(); updateLinesNote();
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
let lastN = -1;
const typeOptions = t => (TYPES.includes(t) ? TYPES : [...TYPES, t]).map(o => `<option${o === t ? " selected" : ""}>${esc(o)}</option>`).join("");
function renderItemsEditor() {
  const N = lineList(getOrig(), current.view.brk).length; lastN = N;
  const lineOpts = cur => { const c = String(cur || ""); let o = `<option value="">自動</option>`; const mx = Math.max(N, parseInt(c, 10) || 0); for (let k = 1; k <= mx; k++) o += `<option value="${k}"${c === String(k) ? " selected" : ""}>${k}文目</option>`; return o; };
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
  <label>表示する文<select data-field="line">${lineOpts(it.line)}</select></label>
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
  if (!current || isViewer()) return;
  const oldOrig = current.original;
  current.title = $("lesson-title").value; current.source = $("lesson-source").value; current.className = $("lesson-class").value; current.session = $("lesson-session").value;
  current.goal = $("lesson-goal").value; current.original = $("lesson-original").value; current.translation = $("lesson-translation").value; current.notes = $("lesson-notes").value;
  if (current.original !== oldOrig) lastSel = null;
  const rows = [...$("items-editor").querySelectorAll(".item-card")];
  if (rows.length === current.items.length) {
    current.items = rows.map((r, i) => { const o = { ...current.items[i] }; r.querySelectorAll("[data-field]").forEach(f => { o[f.dataset.field] = f.value; }); return o; });
  }
}
function onEdit() { readForm(); markDirty(); scheduleRender(); updateLinesNote(); if (lineList(getOrig(), current.view.brk).length !== lastN && !$("items-editor").contains(document.activeElement)) renderItemsEditor(); clearTimeout(onEdit.t); onEdit.t = setTimeout(renderList, 250); }
function selectLesson(id) {
  const x = lessons.find(l => l.id === id); if (!x) return;
  current = x; focusTerm = ""; activeLine = -1; lastSel = null; hiddenTypes = new Set(); S.b.step = null; S.p.step = 0; S.b.page = S.p.page = -1;
  fill(); renderList(); renderAll(); syncTools();
}
const blank = () => normLesson({ id: uid(), title: "新しい授業", updatedAt: Date.now() });

/* ================= 教材の操作 ================= */
$("lesson-list").addEventListener("click", e => { const b = e.target.closest("[data-id]"); if (b) { readForm(); persist(); selectLesson(b.dataset.id); } });
$("new-lesson").onclick = () => { if (viewerBlock()) return; readForm(); const x = blank(); lessons.unshift(x); persist(); selectLesson(x.id); document.querySelector('[data-tab="edit"]').click(); scheduleSync(); toast("新しい授業を作成しました"); };
$("save-lesson").onclick = () => { readForm(); if (persist()) { renderList(); renderAll(); scheduleSync(); toast("教材を保存しました"); } };
$("duplicate").onclick = () => { if (viewerBlock() || !current) return; readForm(); const x = normLesson(structuredClone(current)); x.id = uid(); x.title = (x.title || "授業") + "（複製）"; x.updatedAt = Date.now(); lessons.unshift(x); persist(); selectLesson(x.id); scheduleSync(); toast("教材を複製しました"); };
$("delete").onclick = () => {
  if (viewerBlock() || !current || !confirm(`「${current.title || "名称未設定"}」を削除しますか？（同期している他の端末からも削除されます。必要なら先に書き出してください）`)) return;
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
 "items":[{"type":"古語|助動詞|助詞|敬語|係り結び|接続|表現|文法|その他","line":"その語句が出てくる本文の行番号（数字のみ）","term":"本文中の表記","pos":"品詞","conjType":"活用の種類（例：ラ変型、四段、ク活用。活用しない語は空）","conjForm":"本文中での活用形（例：連体形。活用しない語は空）","meaning":"意味（助動詞は本文中での意味）","explain":"文法上の説明（接続・識別・係り結び・敬語の種類など。1〜2文）"}]}

【条件】
- 各itemには、その語句が出てくる行の番号をlineに必ず入れる。
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
  if (viewerBlock()) return;
  const cfg = rd(AI_KEY, null);
  if (!cfg || !cfg.key) { toast("先に「使い方・同期設定」でAPIキーを登録してください"); document.querySelector('[data-tab="guide"]').click(); return; }
  readForm();
  const lines = lineList(getOrig(), current.view.brk).map(l => l.t.trim());
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
      const n = normItem({ ...it, type: TYPES.includes(it && it.type) ? it.type : "その他", ai: true, line: (Number.isInteger(+it.line) && +it.line >= 1 && +it.line <= lines.length) ? String(+it.line) : "" });
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
  const f = e.target.files[0]; if (!f) return; if (viewerBlock()) { e.target.value = ""; return; }
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
$("reveal-mode").onclick = () => stepBy("b", -1);
$("reveal-next").onclick = () => stepBy("b", 1);
$("reveal-all").onclick = () => revealPage("b");
$("reveal-reset").onclick = () => { S.b.fresh = false; S.b.step = 0; applyStep("b"); };
$("print-board").onclick = () => { revealPage("b"); window.print(); };

function setAuto(on) {
  if (!current) return; const v = current.view;
  if (!on) { v.oPx = Math.round(lastFit.o); v.tPx = Math.round(lastFit.t); v.wPx = Math.round(lastFit.w); }
  v.auto = on; markDirty(); renderAll();
}
function adjust(kind, dir) {
  if (!current) return; const v = current.view, f = dir > 0 ? 1.12 : 0.89;
  if (v.auto) { v.oPx = Math.round(lastFit.o); v.tPx = Math.round(lastFit.t); v.wPx = Math.round(lastFit.w); v.auto = false; }
  if (kind === "o") v.oPx = clamp(Math.round((v.oPx || 64) * f), 24, 340);
  else { v.tPx = clamp(Math.round((v.tPx || 48) * f), 16, 260); v.wPx = clamp(Math.round((v.wPx || 30) * f), 14, 160); }
  markDirty(); renderAll();
}
document.addEventListener("change", e => {
  const c = e.target; if (!current || !c.classList) return;
  if (c.classList.contains("auto-fit")) setAuto(c.checked);
  else if (c.classList.contains("brk-toggle")) { current.view.brk = c.checked; activeLine = -1; S.b.step = null; S.p.step = 0; markDirty(); renderAll(); }
  else if (c.classList.contains("per-select")) { current.view.per = c.value; S.b.step = null; markDirty(); renderAll(); }
});
[["v-opx", "oPx"], ["v-tpx", "tPx"], ["v-wpx", "wPx"], ["v-lh", "lh"], ["v-ls", "ls"]].forEach(([id, k]) => $(id).addEventListener("input", e => { if (!current) return; current.view[k] = +e.target.value; markDirty(); scheduleRender(); }));

// 本文↔現代語訳の対応表示、語句→本文ハイライト、種類の絞り込み
document.addEventListener("click", e => {
  const sel = window.getSelection && window.getSelection().toString();
  const col = e.target.closest(".g-orig, .g-tr");
  if (col && !sel) { const n = +col.dataset.g; activeLine = activeLine === n ? -1 : n; setActiveLine(activeLine); return; }
  const it = e.target.closest(".item");
  if (it && !sel) { const t = it.dataset.term; focusTerm = focusTerm === t ? "" : t; renderOriginalOnly(); return; }
  const ch = e.target.closest("[data-chip]");
  if (ch) { const t = ch.dataset.chip; if (t === "*") hiddenTypes.clear(); else if (hiddenTypes.has(t)) hiddenTypes.delete(t); else hiddenTypes.add(t); renderAll(); }
});

/* ================= 強調（本文の選択範囲） ================= */
function selectionRange() {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0); let n = r.commonAncestorContainer; if (n.nodeType !== 1) n = n.parentElement;
  const host = n && n.closest(".groups"); if (!host) return null;
  let s = Infinity, e = -1;
  host.querySelectorAll(".g-orig [data-i]").forEach(sp => { if (r.intersectsNode(sp)) { const i = +sp.dataset.i; s = Math.min(s, i); e = Math.max(e, i + sp.textContent.length); } });
  return e < 0 ? null : { s, e };
}
document.addEventListener("selectionchange", () => { const r = selectionRange(); if (r) lastSel = r; });
function cutMarks(s, e) {
  const out = [];
  current.marks.forEach(m => { if (m.e <= s || m.s >= e) out.push(m); else { if (m.s < s) out.push({ s: m.s, e: s, c: m.c }); if (m.e > e) out.push({ s: e, e: m.e, c: m.c }); } });
  current.marks = out;
}
function applyMark(kind) {
  if (!current || viewerBlock()) return;
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
/* 全画面の維持・画面スリープ防止・オーバーレイの置き場 */
let wantFull = false, wakeLock = null;
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const fsOK = () => { const el = $("presentation"); return !!(el.requestFullscreen || el.webkitRequestFullscreen); };
function goFull() { const el = $("presentation"), rf = el.requestFullscreen || el.webkitRequestFullscreen; if (rf && !fsEl()) try { const r = rf.call(el); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
function syncFsBtn() { $("pres-fs").hidden = !!fsEl() || !fsOK(); }
async function keepAwake(on) {
  try { if (on) { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } } else if (wakeLock) { await wakeLock.release(); wakeLock = null; } } catch (e) {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !$("presentation").hidden) keepAwake(true); });
function placeOverlays() { const h = $("presentation").hidden ? document.body : $("presentation"); ["picker", "timer", "toast"].forEach(id => { if ($(id).parentElement !== h) h.appendChild($(id)); }); }
function onFsChange() {
  syncFsBtn();
  if (!$("presentation").hidden && !fsEl() && wantFull && fsOK()) toast("全画面が解除されました。画面をタップすると全画面に戻ります");
  setTimeout(() => { if (!$("presentation").hidden) renderSurface("p"); }, 200);
}
document.addEventListener("fullscreenchange", onFsChange); document.addEventListener("webkitfullscreenchange", onFsChange);
// 全画面が解けても、次にタップした時点（ユーザー操作の中）で自動的に全画面へ戻す
document.addEventListener("pointerup", () => { if (!$("presentation").hidden && wantFull && !fsEl() && fsOK()) { goFull(); setTimeout(syncFsBtn, 400); } }, true);
$("pres-fs").onclick = () => { wantFull = true; goFull(); };
function syncPresPaneBtns() { document.querySelectorAll(".pres-pane").forEach(b => b.classList.toggle("on", presShow[+b.dataset.pane])); }
function openPres() {
  if (!current) return; readForm(); persist();
  presShow = [true, true, true, true]; S.p.step = 0; S.p.page = -1;
  $("presentation").hidden = false; document.body.classList.add("projecting"); wantFull = true; placeOverlays(); keepAwake(true);
  setBarMode(0); renderChips(); syncViewUI(); syncTools(); renderSurface("p");
  goFull(); syncFsBtn();
  setTimeout(() => { if (!$("presentation").hidden) renderSurface("p"); }, 250); // 全画面化後のサイズで再計算
}
function exitPres() {
  wantFull = false; keepAwake(false);
  $("presentation").hidden = true; document.body.classList.remove("projecting"); placeOverlays();
  const fe = document.fullscreenElement || document.webkitFullscreenElement;
  if (fe) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }
  renderAll();
}
let presBarMode = 0; // 0=下の操作欄だけ（既定・提示内容が最大） 1=上に詳細設定も表示 2=すべて隠す（右上/左下の小さなボタンだけ）
function setBarMode(m) { presBarMode = m; $("pres-bar").hidden = m !== 1; $("pres-foot").hidden = m === 2; $("pres-bar-toggle").classList.toggle("on", m !== 0); $("pres-bar-toggle").textContent = m === 0 ? "⚙ 設定" : m === 1 ? "⚙ 閉じる" : "⚙ 操作欄を出す"; document.body.classList.toggle("pf-hidden", m === 2); if (!$("presentation").hidden) setTimeout(() => { layoutStage("p"); redrawAll(); }, 30); }
function togglePresBar() { setBarMode((presBarMode + 1) % 3); }
$("project-btn").onclick = openPres;
$("pres-exit").onclick = exitPres;
$("pres-bar-toggle").onclick = togglePresBar;
$("pres-all").onclick = () => revealPage("p");
document.querySelectorAll(".pres-pane").forEach(b => b.onclick = () => { const i = +b.dataset.pane; presShow[i] = !presShow[i]; syncPresPaneBtns(); renderSurface("p"); });
$("pres-osize-up").onclick = () => adjust("o", 1); $("pres-osize-down").onclick = () => adjust("o", -1);
$("pres-lsize-up").onclick = () => adjust("l", 1); $("pres-lsize-down").onclick = () => adjust("l", -1);

document.addEventListener("keydown", e => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" && e.target.type !== "checkbox" && e.target.type !== "range") return;
  if (tag === "textarea" || tag === "select") return;
  const k = e.key, ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && (k === "z" || k === "Z")) { if (!$("presentation").hidden || $("tab-board").classList.contains("active")) { e.preventDefault(); undo(); } return; }
  if ($("presentation").hidden || !$("picker").hidden || !$("tm-panel").hidden) return;
  if (k === "ArrowRight" || k === " " || k === "PageDown" || k === "Enter") { e.preventDefault(); stepBy("p", 1); }
  else if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") { e.preventDefault(); stepBy("p", -1); }
  else if (k === "Home") { S.p.step = 0; applyStep("p"); }
  else if (k === "End" || k === "a" || k === "A") revealPage("p");
  else if (k === "Escape") exitPres();
  else if (k === "+" || k === "=") adjust("o", 1);
  else if (k === "-") adjust("o", -1);
  else if (k >= "1" && k <= "4") { const i = +k - 1; presShow[i] = !presShow[i]; syncPresPaneBtns(); renderSurface("p"); }
  else if (k === "d" || k === "D") setDraw(!drawingEnabled);
  else if (k === "e" || k === "E") toggleEraser();
  else if (k === "t" || k === "T") togglePresBar();
  else if (k === "m" || k === "M") openTimer();
  else if (k === "f" || k === "F") setAuto(!current.view.auto);
  else if (k === "k" || k === "K") { current.view.brk = !current.view.brk; activeLine = -1; S.p.step = 0; markDirty(); renderAll(); }
});

/* ================= 手書き（ステージ座標・Pointer Events） ================= */
const activeSurface = () => ($("presentation").hidden ? "b" : "p");
const LEGACY_KEY = "a1111hb";
function layoutKey(p) { return S[p].key || "none"; } // 表示している画面（文の範囲・表示内容・文字サイズ）ごとに手書きを分けて保存
const strokeKey = s => s.k || LEGACY_KEY;
const myDraw = () => { if (!current) return []; if (!isViewer()) return current.drawings; return vdraw[current.id] || (vdraw[current.id] = []); }; // 閲覧端末の手書きはこの端末だけに保存
const allDraw = () => (!current ? [] : isViewer() ? current.drawings.concat(vdraw[current.id] || []) : current.drawings); // 閲覧端末では編集端末の手書きも見える
const strokesFor = p => allDraw().filter(s => strokeKey(s) === layoutKey(p));
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
  document.querySelectorAll('[data-act="draw"]').forEach(b => { b.textContent = b.dataset.short ? (drawingEnabled ? "✎ ON" : "✎ OFF") : (drawingEnabled ? "✎ 手書き：ON" : "✎ 手書き：OFF"); b.classList.toggle("on", drawingEnabled); });
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
  if (!current) return; const p = activeSurface(), key = layoutKey(p), list = myDraw();
  for (let i = list.length - 1; i >= 0; i--) if (strokeKey(list[i]) === key) { list.splice(i, 1); drawFull(p); markDirty(); return; }
  toast("元に戻す書き込みがありません");
}
function clearDrawings() {
  if (!current) return; const p = activeSurface(), key = layoutKey(p);
  if (!myDraw().some(s => strokeKey(s) === key)) { toast(isViewer() ? "この端末で書いた書き込みはありません" : "この表示の書き込みはありません"); return; }
  if (!confirm("この表示の手書きをすべて消去しますか？（元に戻せません）")) return;
  { const keep = myDraw().filter(s => strokeKey(s) !== key); if (isViewer()) vdraw[current.id] = keep; else current.drawings = keep; } drawFull(p); markDirty(); toast("手書きを消去しました");
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
    myDraw().push(cur);
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
const isViewer = () => { const c = rd(SYNC_KEY, null); return !!(c && c.repo && c.token && c.role === "view"); };
function viewerBlock() { if (isViewer()) { toast("この端末は閲覧専用です。編集は編集端末で行ってください"); return true; } return false; }
function applyRole() {
  const v = isViewer(); document.body.classList.toggle("viewer", v);
  document.querySelector(".brand small").textContent = "高校古典・授業支援システム v5" + (v ? "（閲覧専用）" : "");
  if (v && $("tab-edit").classList.contains("active")) document.querySelector('[data-tab="board"]').click();
}
const syncCfg = () => { const c = rd(SYNC_KEY, null); return c && c.repo && c.token ? c : null; };
let syncing = false, pendingSync = false, syncTimer = 0;
function setSync(t, err) { $("sync-status").textContent = "同期：" + t; $("sync-detail").textContent = t; $("sync-status").classList.toggle("err", !!err); $("sync-detail").classList.toggle("err", !!err); }
function scheduleSync() { const c = syncCfg(); if (!c || c.auto === false || c.role === "view") return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(false), 4000); }
const b64enc = s => { const b = new TextEncoder().encode(s); let bin = ""; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };
const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), ch => ch.charCodeAt(0)));
const ghUrl = (c, p) => `https://api.github.com/repos/${c.repo}${p}`;
const ghHead = c => ({ Authorization: "Bearer " + c.token, Accept: "application/vnd.github+json" });
const ghPath = c => (c.path || "koten-board-data.json").split("/").map(encodeURIComponent).join("/");
function ghErr(status, e) {
  const kind = e && e.kind;
  if (status === 401) return "トークンが無効、または期限切れです。GitHubでトークンを作り直して入力してください";
  if (kind === "branch") return `ブランチ「${e.branch}」がありません。このリポジトリの既定ブランチは「${e.def || "不明"}」です。ブランチ欄を「${e.def || ""}」にするか、空欄にしてください`;
  if (kind === "repo" || status === 404) return "リポジトリが見つかりません。①「所有者/名前」の綴り（例 suganori-hub/koten-data）②トークン作成時の「Only select repositories」にこのリポジトリを入れたか ③Contents を「Read and write」にしたか を確認してください（非公開リポジトリは、権限が足りないと「見つからない」と表示されます）";
  if (status === 403) return "権限不足またはAPI制限です（トークンの Contents 権限を「Read and write」にしてください）";
  if (status === 409 || status === 422) return "保存が競合しました（もう一度同期します）";
  return "同期エラー(" + status + ")";
}
async function ensureBranch(c) { // リポジトリの存在・権限・ブランチを順に確認し、原因を特定する
  const rr = await fetch(ghUrl(c, ""), { headers: ghHead(c), cache: "no-store" });
  if (!rr.ok) throw Object.assign(new Error("gh"), { status: rr.status, kind: rr.status === 404 ? "repo" : undefined });
  const def = (await rr.json()).default_branch || "main";
  if (!c.branch) { c.branch = def; wr(SYNC_KEY, c); return def; }
  const br = await fetch(ghUrl(c, `/branches/${encodeURIComponent(c.branch)}`), { headers: ghHead(c), cache: "no-store" });
  if (br.status === 404) throw Object.assign(new Error("gh"), { status: 404, kind: "branch", branch: c.branch, def });
  if (!br.ok) throw Object.assign(new Error("gh"), { status: br.status });
  return def;
}
async function ghGet(c) {
  if (!c.branch) await ensureBranch(c); // 空欄なら既定ブランチを先に確定
  const br = encodeURIComponent(c.branch || "main");
  const r = await fetch(ghUrl(c, `/contents/${ghPath(c)}?ref=${br}&_=${Date.now()}`), { headers: ghHead(c), cache: "no-store" });
  if (r.status === 404) { // ファイル未作成か、リポジトリ自体にアクセスできないか
    await ensureBranch(c); // リポジトリ・ブランチに問題があればここで具体的なエラーになる
    return { data: null, sha: undefined };
  }
  if (!r.ok) throw Object.assign(new Error("gh"), { status: r.status });
  const meta = await r.json();
  let b64 = meta.content;
  if (!b64) { const br2 = await fetch(meta.git_url, { headers: ghHead(c), cache: "no-store" }); if (!br2.ok) throw Object.assign(new Error("gh"), { status: br2.status }); b64 = (await br2.json()).content; } // 1MB超
  return { data: JSON.parse(b64dec(b64)), sha: meta.sha };
}
async function ghPut(c, payload, sha) {
  const body = { message: "KOTEN BOARD sync " + new Date().toISOString(), content: b64enc(JSON.stringify(payload)) };
  if (c.branch) body.branch = c.branch;
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
function mergeViewer(ll, remote) { // 閲覧端末：編集端末の内容をそのまま表示（この端末側の表示設定は、同じ版の間だけ保持）
  const rl = (remote && Array.isArray(remote.lessons) ? remote.lessons : []).filter(x => x && typeof x === "object").map(normLesson);
  const del = (remote && remote.deleted) || {}, lm = new Map(ll.map(l => [l.id, l]));
  const out = rl.filter(l => !(del[l.id] && del[l.id] >= (l.updatedAt || 0))).map(r => { const l = lm.get(r.id); return l && (l.updatedAt || 0) === (r.updatedAt || 0) ? l : r; });
  return { lessons: out, deleted: del, needsPush: false };
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
    if (current !== prev && (isViewer() || !(Date.now() - lastEditAt < 8000))) fill();
    renderList(); renderAll();
  }
  return true;
}
async function syncNow(manual, force) {
  const c = syncCfg();
  if (!c) { if (manual) { toast("同期はまだ設定されていません。「使い方・同期設定」で設定してください"); document.querySelector('[data-tab="guide"]').click(); } return; }
  if (syncing) { pendingSync = true; return; }
  syncing = true; setSync("同期中…");
  try {
    let changed = false;
    if (isViewer()) {
      const remote = await ghGet(c);
      if (!remote.data || !Array.isArray(remote.data.lessons)) { setSync("編集端末のデータがまだありません", true); if (manual) toast("編集端末から先に同期してください"); return; }
      changed = applyMerged(mergeViewer(lessons, remote.data));
      const sv = remote.data.savedAt ? new Date(remote.data.savedAt) : null, svt = sv ? String(sv.getHours()).padStart(2, "0") + ":" + String(sv.getMinutes()).padStart(2, "0") : "不明";
      setSync(`閲覧専用・最新 ✓ ${hhmm()}（編集端末の教材${remote.data.lessons.length}件・編集端末の最終送信 ${svt}）`);
      if (manual) toast(changed ? "編集端末の最新の内容を表示しました" : "すでに最新です");
      return;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await ghGet(c);
      const editing = Date.now() - lastEditAt < 8000 || strokeActive;
      const m = mergeData(lessons, tombs, remote.data, editing && current ? current.id : null);
      if (applyMerged(m)) changed = true;
      if (!m.needsPush && !force) break;
      try { await ghPut(c, { app: "koten-board", schema: SCHEMA, savedAt: Date.now(), lessons: lessons.filter(l => !(tombs[l.id] >= (l.updatedAt || 0))), deleted: tombs }, remote.sha); break; }
      catch (e) { if ((e.status === 409 || e.status === 422) && attempt < 2) continue; throw e; }
    }
    setSync(`同期済み ✓ ${hhmm()}（この端末の教材${lessons.length}件を保存）`);
    if (manual) toast(changed ? "他の端末の変更を取り込みました" : "同期しました");
  } catch (e) {
    const m = e.status ? ghErr(e.status, e) : "通信できません（オフライン）。接続後に自動で再同期します";
    setSync(m, true); if (manual) toast(m);
  } finally { syncing = false; if (pendingSync) { pendingSync = false; scheduleSync(); } }
}
function fillSyncForm() {
  const c = rd(SYNC_KEY, null) || {};
  $("sync-repo").value = c.repo || ""; $("sync-branch").value = c.branch || ""; $("sync-branch").placeholder = "空欄＝自動（既定ブランチ）"; $("sync-path").value = c.path || ""; $("sync-auto").checked = c.auto !== false;
  $("sync-role").value = c.role === "view" ? "view" : "edit"; $("sync-token").value = ""; $("sync-token").placeholder = c.token ? "登録済み（変更する場合のみ入力）" : "github_pat_…（この端末にだけ保存）";
  if (!c.token) setSync("未設定");
}
function saveSyncForm() {
  const old = rd(SYNC_KEY, {}) || {}; const repo = $("sync-repo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  const token = $("sync-token").value.trim() || old.token || "";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { toast("リポジトリは「所有者/名前」の形式で入力してください"); return false; }
  if (!token) { toast("アクセストークンを入力してください"); return false; }
  wr(SYNC_KEY, { repo, token, branch: $("sync-branch").value.trim(), path: $("sync-path").value.trim() || "koten-board-data.json", auto: $("sync-auto").checked, role: $("sync-role").value });
  return true;
}
$("sync-connect").onclick = () => {
  if ($("sync-role").value === "view" && !isViewer() && !confirm("この端末を「閲覧専用」にします。この端末の教材は、編集端末の内容で置き換わります（置き換え前の内容はこの端末に退避されます）。よろしいですか？")) return;
  if (!saveSyncForm()) return; readForm(); persist(); try { localStorage.setItem(KEY + "-before-sync", JSON.stringify(lessons)); } catch (e) {} fillSyncForm(); applyRole(); syncNow(true); };
$("sync-now").onclick = () => syncNow(true);
$("sync-force").onclick = () => { if (isViewer()) { toast("閲覧専用の端末からは送信できません"); return; } readForm(); persist(); syncNow(true, true); };
$("sync-btn").onclick = () => syncNow(true);
$("sync-auto").onchange = () => { const c = rd(SYNC_KEY, null); if (c) { c.auto = $("sync-auto").checked; wr(SYNC_KEY, c); } };
$("sync-disconnect").onclick = () => { if (!confirm("この端末の同期設定を解除しますか？（教材データは残ります）")) return; try { localStorage.removeItem(SYNC_KEY); } catch (e) {} fillSyncForm(); applyRole(); setSync("未設定"); toast("同期を解除しました"); };
$("sync-code-make").onclick = async () => {
  const c = syncCfg(); if (!c) { toast("先に接続してください"); return; }
  if (c.role === "view") { toast("接続コードは編集端末で作ります"); return; }
  const code = "KB1:" + btoa(unescape(encodeURIComponent(JSON.stringify({ repo: c.repo, branch: c.branch, path: c.path, token: c.token }))));
  $("sync-code").value = code;
  try { await navigator.clipboard.writeText(code); toast("閲覧端末用の接続コードをコピーしました（他人に見せないでください）"); } catch (e) { toast("下の欄に表示しました。コピーして使ってください"); }
};
$("sync-code-apply").onclick = () => {
  try {
    const raw = $("sync-code").value.trim(); if (!raw.startsWith("KB1:")) throw Error("code");
    if (!isViewer() && !confirm("この端末を「閲覧専用」にします。この端末の教材は、編集端末の内容で置き換わります（置き換え前の内容はこの端末に退避されます）。よろしいですか？")) return;
    const o = JSON.parse(decodeURIComponent(escape(atob(raw.slice(4))))); if (!o.repo || !o.token) throw Error("code");
    wr(SYNC_KEY, { repo: o.repo, token: o.token, branch: o.branch || "", path: o.path || "koten-board-data.json", auto: true, role: "view" });
    $("sync-code").value = ""; readForm(); persist(); try { localStorage.setItem(KEY + "-before-sync", JSON.stringify(lessons)); } catch (e) {}
    fillSyncForm(); applyRole(); document.querySelector('[data-tab="board"]').click(); syncNow(true);
  } catch (e) { toast("接続コードを読み取れませんでした"); }
};


/* ================= iPad操作：大きなボタン・スワイプ ================= */
const coarseMQ = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;
const setCoarse = () => document.body.classList.toggle("coarse", !!(coarseMQ && coarseMQ.matches) || navigator.maxTouchPoints > 1);
setCoarse(); if (coarseMQ && coarseMQ.addEventListener) coarseMQ.addEventListener("change", setCoarse);
$("bn-prev").onclick = () => stepBy("b", -1); $("bn-next").onclick = () => stepBy("b", 1);
$("pres-prev2").onclick = () => stepBy("p", -1); $("pres-next2").onclick = () => stepBy("p", 1);
document.querySelectorAll(".auto-reset").forEach(b => b.onclick = () => { if (!current) return; setAuto(true); toast("自動で大きく表示に戻しました"); });
function bindSwipe(el, p) {
  let s = null;
  el.addEventListener("pointerdown", e => { s = e.pointerType === "touch" && !fingerDraw ? { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId } : null; });
  el.addEventListener("pointercancel", () => { s = null; });
  el.addEventListener("pointerup", e => {
    if (!s || e.pointerId !== s.id) return; const dx = e.clientX - s.x, dy = e.clientY - s.y, dt = Date.now() - s.t; s = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && Math.abs(dx) > Math.abs(dy) * 2 && dt < 700) stepBy(p, dx < 0 ? 1 : -1);
  });
}
bindSwipe($("stage-b"), "b"); bindSwipe($("stage-area"), "p");

/* ================= PC編集：ショートカット ================= */
document.addEventListener("keydown", e => {
  if (!(e.ctrlKey || e.metaKey) || isViewer()) return;
  if (e.key === "s" || e.key === "S") { e.preventDefault(); if (current && $("tab-edit").classList.contains("active")) { $("save-lesson").click(); } }
  else if (e.key === "Enter" && $("tab-edit").classList.contains("active") && $("presentation").hidden) { e.preventDefault(); document.querySelector('[data-tab="board"]').click(); }
});

/* ================= 指名（出席番号のランダム抽選） ================= */
const PICK_KEY = "koten-board-picker";
const pk = Object.assign({ from: 1, to: 40, count: 1, skip: "", noRepeat: true, done: [], last: [] }, rd(PICK_KEY, {}));
const savePk = () => wr(PICK_KEY, pk);
const z2h = s => String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
function parseNums(s) {
  const out = new Set();
  z2h(s).replace(/[〜～－ー–—]/g, "-").split(/[,、，\s]+/).forEach(t => { const m = t.match(/^(\d+)(?:-(\d+))?$/); if (!m) return; let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a]; for (let i = a; i <= Math.min(b, a + 999); i++) out.add(i); });
  return out;
}
function rndInt(n) {
  const c = window.crypto && window.crypto.getRandomValues;
  if (!c) return Math.floor(Math.random() * n);
  const a = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n;
  do { window.crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % n;
}
function readPk() {
  let f = Math.round(+z2h($("pk-from").value)) || 1, t = Math.round(+z2h($("pk-to").value)) || f;
  f = clamp(f, 1, 999); t = clamp(t, 1, 999); if (f > t) [f, t] = [t, f];
  Object.assign(pk, { from: f, to: t, skip: $("pk-skip").value, noRepeat: $("pk-norep").checked }); savePk();
}
function pkPool() {
  const skip = parseNums(pk.skip), done = new Set(pk.noRepeat ? pk.done : []), all = [];
  for (let i = pk.from; i <= pk.to; i++) if (!skip.has(i) && !done.has(i)) all.push(i);
  return all;
}
function pkInfo() {
  const total = pk.to - pk.from + 1 - [...parseNums(pk.skip)].filter(n => n >= pk.from && n <= pk.to).length, rest = pkPool().length;
  $("pk-info").textContent = `対象 ${total}人` + (pk.noRepeat ? ` ／ 残り ${rest}人（当選済み ${pk.done.filter(n => n >= pk.from && n <= pk.to).length}人）` : "");
  $("pk-go").disabled = pkBusy;
}
function pkShow(nums, cls) {
  const r = $("pk-result"); r.className = "pk-result n" + Math.min(5, Math.max(1, nums.length)) + (cls ? " " + cls : "");
  r.innerHTML = nums.map(n => `<span class="pk-num">${n}</span>`).join("");
}
function pkFill() {
  $("pk-from").value = pk.from; $("pk-to").value = pk.to; $("pk-skip").value = pk.skip; $("pk-norep").checked = pk.noRepeat;
  document.querySelectorAll(".pk-count").forEach(b => b.classList.toggle("on", +b.dataset.n === pk.count));
  pkInfo();
}
let pkBusy = false;
function pkDraw() {
  if (pkBusy) return; readPk();
  const pool = pkPool();
  if (!pool.length) { toast(pk.noRepeat && pk.done.length ? "全員が当選済みです。「当たり履歴をリセット」を押してください" : "対象の番号がありません"); pkInfo(); return; }
  const n = Math.min(pk.count, pool.length); if (n < pk.count) toast(`残り${pool.length}人のため${n}人を指名します`);
  const res = []; const tmp = pool.slice();
  for (let i = 0; i < n; i++) res.push(tmp.splice(rndInt(tmp.length), 1)[0]);
  res.sort((a, b) => a - b);
  pkBusy = true; $("pk-go").disabled = true;
  const rollPool = pool.length > 1 ? pool : [pool[0]]; let ticks = 0;
  const iv = setInterval(() => {
    ticks++; pkShow(Array.from({ length: n }, () => rollPool[rndInt(rollPool.length)]), "roll");
    if (ticks >= 14) {
      clearInterval(iv); pkBusy = false;
      pkShow(res, "fin"); pk.last = res;
      if (pk.noRepeat) res.forEach(x => { if (!pk.done.includes(x)) pk.done.push(x); });
      savePk(); pkInfo();
    }
  }, 70);
}
function openPicker() {
  placeOverlays(); $("picker").hidden = false; pkFill();
  if (pk.last && pk.last.length) pkShow(pk.last, "fin");
}
function closePicker() { $("picker").hidden = true; }
$("pick-btn").onclick = openPicker; $("pres-pick2").onclick = openPicker; $("pk-close").onclick = closePicker;
$("picker").addEventListener("click", e => { if (e.target === $("picker")) closePicker(); });
$("pk-go").onclick = pkDraw;
$("pk-reset").onclick = () => { pk.done = []; pk.last = []; savePk(); pkInfo(); $("pk-result").className = "pk-result"; $("pk-result").innerHTML = '<span class="pk-ph">履歴をリセットしました</span>'; };
["pk-from", "pk-to", "pk-skip", "pk-norep"].forEach(id => $(id).addEventListener("input", () => { readPk(); pkInfo(); }));
$("pk-from").addEventListener("change", () => { readPk(); pkFill(); }); $("pk-to").addEventListener("change", () => { readPk(); pkFill(); });
document.querySelectorAll(".pk-count").forEach(b => b.onclick = () => { pk.count = +b.dataset.n; savePk(); pkFill(); });
document.addEventListener("keydown", e => {
  if (!$("tm-panel").hidden) { if (e.key === "Escape") { e.stopImmediatePropagation(); closeTimer(); } return; }
  if (!$("picker").hidden) { if (e.key === "Escape") { e.stopImmediatePropagation(); closePicker(); } return; }
  if (($("presentation").hidden) || e.ctrlKey || e.metaKey) return;
  const tag = (e.target.tagName || "").toLowerCase(); if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (e.key === "r" || e.key === "R") openPicker();
}, true);


/* ================= タイマー（最大15分） ================= */
const TM_KEY = "koten-board-timer", TM_MAX = 900;
const tm = Object.assign({ dur: 300, sound: true }, rd(TM_KEY, {})); tm.dur = clamp(+tm.dur || 300, 10, TM_MAX); tm.rem = tm.dur; tm.state = "idle"; // idle / run / pause / done
let tmEnd = 0, tmIv = 0, tmAC = null;
const saveTm = () => wr(TM_KEY, { dur: tm.dur, sound: tm.sound });
const fmtT = s => { s = Math.max(0, Math.ceil(s - 1e-6)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const tmRemain = () => tm.state === "run" ? Math.max(0, (tmEnd - Date.now()) / 1000) : tm.rem;
function tmRender() {
  const r = tmRemain(), t = fmtT(r), st = tm.state;
  $("tm-disp").textContent = t; $("tm-pill-t").textContent = st === "done" ? "時間です" : t;
  $("tm-pill").hidden = st === "idle";
  const lv = st === "done" ? "done" : st === "run" && r <= 10 ? "urgent" : st === "run" && r <= 60 ? "warn" : "";
  [$("tm-pill"), $("tm-disp")].forEach(e => { e.classList.remove("warn", "urgent", "done"); if (lv) e.classList.add(lv); e.classList.toggle("paused", st === "pause"); });
  $("tm-go").textContent = st === "run" ? "⏸ 一時停止" : st === "pause" ? "▶ 再開" : "▶ スタート";
  $("tm-sound").checked = tm.sound;
  $("timer-btn").classList.toggle("on", st === "run" || st === "pause");
}
function tmBeep() {
  if (!tm.sound) return;
  try { const ac = tmAC || new (window.AudioContext || window.webkitAudioContext)(); tmAC = ac; if (ac.resume) ac.resume();
    [0, .35, .7].forEach(d => { const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.value = 880; o.connect(g); g.connect(ac.destination); const t = ac.currentTime + d; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.5, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .28); o.start(t); o.stop(t + .3); });
  } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 250]); } catch (e) {}
}
function tmTick() {
  if (tm.state === "run" && tmEnd - Date.now() <= 0) { tm.state = "done"; tm.rem = 0; clearInterval(tmIv); tmIv = 0; tmBeep(); toast("⏱ 時間です"); openTimer(); }
  tmRender();
}
function tmSet(s) { clearInterval(tmIv); tmIv = 0; tm.dur = clamp(s, 10, TM_MAX); tm.rem = tm.dur; tm.state = "idle"; saveTm(); tmRender(); }
function tmAdd(s) {
  if (tm.state === "run") { const nr = clamp(tmRemain() + s, 0, TM_MAX); tmEnd = Date.now() + nr * 1000; tmTick(); return; }
  if (tm.state === "done") { tmSet(tm.dur + s); return; }
  tm.rem = clamp(tm.rem + s, 10, TM_MAX); if (tm.state === "idle") { tm.dur = tm.rem; saveTm(); } tmRender();
}
function tmGo() {
  try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) { tmAC = tmAC || new AC(); if (tmAC.resume) tmAC.resume(); } } catch (e) {} // 端末の音は、タップ操作の中で用意する必要がある
  if (tm.state === "run") { tm.rem = tmRemain(); tm.state = "pause"; clearInterval(tmIv); tmIv = 0; }
  else { if (tm.state === "idle" || tm.state === "done") tm.rem = tm.dur; tmEnd = Date.now() + tm.rem * 1000; tm.state = "run"; clearInterval(tmIv); tmIv = setInterval(tmTick, 200); keepAwake(true); }
  tmRender();
}
function tmReset() { tmSet(tm.dur); }
function openTimer() { placeOverlays(); $("tm-panel").hidden = false; tmRender(); }
function closeTimer() { $("tm-panel").hidden = true; }
$("timer-btn").onclick = openTimer; $("pres-timer").onclick = openTimer; $("tm-pill").onclick = openTimer; $("tm-close").onclick = closeTimer;
$("tm-panel").addEventListener("click", e => { if (e.target === $("tm-panel")) closeTimer(); });
$("tm-go").onclick = tmGo; $("tm-reset").onclick = tmReset; $("tm-sound").onchange = e => { tm.sound = e.target.checked; saveTm(); };
document.querySelectorAll(".tm-set").forEach(b => b.onclick = () => tmSet(+b.dataset.s));
document.querySelectorAll(".tm-add").forEach(b => b.onclick = () => tmAdd(+b.dataset.s));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && tm.state === "run") tmTick(); });
tmRender();

/* ================= 初期化 ================= */
const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { layoutStage("b"); if (!$("presentation").hidden) layoutStage("p"); redrawAll(); }) : null;
if (ro) { ro.observe($("stage-b").parentElement); ro.observe($("stage-area")); }
window.addEventListener("resize", () => { layoutStage("b"); if (!$("presentation").hidden) layoutStage("p"); redrawAll(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => scheduleRender());
const flush = () => { if (current) { readForm(); persist(); } };
window.addEventListener("beforeunload", flush);
window.addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); else setTimeout(() => syncNow(false), 300); });
window.addEventListener("online", () => syncNow(false));
setInterval(() => { if (document.visibilityState === "visible" && syncCfg() && (syncCfg().auto !== false)) syncNow(false); }, 30000);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const had = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.register("./sw.js").then(r => r.update && r.update()).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (had && !reloaded && $("presentation").hidden) { reloaded = true; flush(); location.reload(); } });
}

fillSyncForm(); fillAiForm(); applyRole();
selectLesson(lessons[0].id);
persist();
if (syncCfg()) setTimeout(() => syncNow(false), 600); else setSync("未設定");
})();
