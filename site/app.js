"use strict";

const UI = {
  subtitle: "סיכומי הלימוד היומי, סימן אחר סימן",
  placeholder: "חיפוש לפי נושא, מקור, או טקסט חופשי…",
  clear: "נקה הכל",
  results: (n) => (n === 1 ? "רשומה אחת" : `${n} רשומות`),
  none: "לא נמצאו רשומות מתאימות. נסו להסיר סינון.",
  start: "בחרו סימן, נושא או מקור מהתפריט — או חפשו למעלה.",
  browseThemes: "עיון בנושאים",
  expandAll: "הרחב הכל",
  collapseAll: "כווץ הכל",
  flatView: "כל הסימנים ברצף",
  groupedView: "חזרה לתצוגה לפי נושא",
  more: "המשך קריאה",
  less: "הצג פחות",
  theme: "נושא",
  source: "מקור",
  text: "טקסט חופשי",
  browseSources: "עיון במקורות",
  classical: "פוסקים וגמרא",
  modern: "רבנים בני זמננו",
  untagged: "הנושאים עדיין לא סומנו — הסינון לפי סימן, מקור וטקסט חופשי פעיל.",
  links: "קישורים",
  by: "נכתב על ידי",
  saText: "שולחן ערוך",
  posts: "סיכומי הלימוד",
  noPosts: "עדיין אין סיכום לסימן הזה — הטקסט לפניכם.",
  noMatchingPosts: "אין סיכומים לסימן הזה שמתאימים לסינון.",
  sefaria: "הטקסט בספריא",
  loading: "טוען את הטקסט…",
  failed: "לא הצלחנו לטעון את הטקסט. אפשר לקרוא אותו בספריא.",
  siman: (n) => `סימן ${hebrewNumber(n)}`,
  prev: (n) => `→ סימן ${hebrewNumber(n)}`,
  next: (n) => `סימן ${hebrewNumber(n)} ←`,
  rema: "הגה — דברי הרמ״א",
  seifLegend: "לחיצה על הפניה לסעיף בסיכום מסמנת אותו בטקסט",
  nk: "נושאי הכלים",
  nkSeif: (n) => `סעיף ${hebrewNumber(n).replace(/['"]/g, "")}`,
  nkLegend: "מילים שנושאי הכלים מבארים",
  nkSources: "מקורות",
  quiz: "חידון על הסימן",
  sectionQuiz: (name) => `חידון על ${name}`,
  expand: "פתח הכל",
  collapse: "סגור הכל",
};

const state = {
  data: null,
  siman: null,
  // a se'if to flash once the siman's text is on screen (from a link)
  seif: null,
  // simanim with a nosei kelim brief / a quiz (data/nk/index.json, data/quiz/index.json)
  nkSimanim: new Set(),
  quizSimanim: new Set(),
  // the open quiz: a siman number as a string, or "sec:<first siman>" for a section of halachot
  quiz: null,
  themes: new Set(),
  sources: new Set(),
  terms: [],
  // section names the reader has collapsed; renderSections re-runs on every
  // click, so this has to live outside the DOM or the panels snap back open
  closedSections: new Set(),
  // false = grouped by halachic section, true = one flat grid of every siman
  flatView: false,
  // same idea as closedSections, for the classical/modern source groups
  closedSourceCategories: new Set(),
};

const el = (id) => document.getElementById(id);

/* ---------- loading ---------- */

async function load() {
  const response = await fetch("data/oc.json");
  state.data = await response.json();
  const optional = (url, fallback) => fetch(url).then((r) => (r.ok ? r.json() : fallback)).catch(() => fallback);
  const [nk, quiz] = await Promise.all([
    optional("data/nk/index.json", { simanim: [] }), optional("data/quiz/index.json", { simanim: [] })]);
  state.nkSimanim = new Set(nk.simanim.map((x) => x.siman));
  state.quizSimanim = new Set(quiz.simanim);

  el("subtitle").textContent = UI.subtitle;
  el("q").placeholder = UI.placeholder;
  el("clear").textContent = UI.clear;

  renderSections();
  applyUrl();
}

const HUNDREDS = [[400, "ת"], [300, "ש"], [200, "ר"], [100, "ק"]];
const HEB_TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HEB_ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];

/** 13 -> י"ג, 15 -> ט"ו, 625 -> תרכ"ה. Matches how the posts cite simanim. */
function hebrewNumber(n) {
  let letters = "";
  let remaining = n;
  for (const [value, letter] of HUNDREDS) {
    while (remaining >= value) { letters += letter; remaining -= value; }
  }
  if (remaining === 15 || remaining === 16) {
    letters += "ט" + HEB_ONES[remaining - 9];
  } else {
    letters += HEB_TENS[Math.floor(remaining / 10)] + HEB_ONES[remaining % 10];
  }
  return letters.length > 1
    ? letters.slice(0, -1) + '"' + letters.slice(-1)
    : letters + "'";
}

function findSection(n) {
  return state.data.sections.find((s) => n >= s.start && n <= s.end) || null;
}

function simanRef(entry) {
  const nums = entry.simanim;
  const span = nums.length > 1
    ? `${hebrewNumber(nums[0])}–${hebrewNumber(nums[nums.length - 1])}`
    : hebrewNumber(nums[0]);
  const word = nums.length > 1 ? "סימנים" : "סימן";
  const section = findSection(nums[0]);
  return section ? `${section.name} · ${word} ${span}` : `${word} ${span}`;
}

function writerLabel(letter) {
  const writer = (state.data.writers || []).find((w) => w.letter === letter);
  return writer ? writer.label : letter;
}

/* ---------- filtering ---------- */

function sectionEntryCount(section) {
  const ids = new Set();
  for (const entry of state.data.entries)
    if (entry.simanim.some((s) => s >= section.start && s <= section.end)) ids.add(entry.id);
  return ids.size;
}

function matches(entry) {
  if (state.siman && !entry.simanim.includes(state.siman)) return false;
  for (const slug of state.themes) if (!entry.themes.includes(slug)) return false;
  for (const name of state.sources) if (!entry.sources.includes(name)) return false;
  if (state.terms.length) {
    const haystack = `${entry.header} ${entry.text}`.toLowerCase();
    for (const term of state.terms) if (!haystack.includes(term.toLowerCase())) return false;
  }
  return true;
}

function filtered() {
  return state.data.entries.filter(matches);
}

/* ---------- suggestions ---------- */

function suggestions(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const theme of state.data.themes) {
    if (state.themes.has(theme.slug)) continue;
    if (theme.label.toLowerCase().includes(q))
      out.push({ kind: "theme", label: theme.label, value: theme.slug });
  }
  for (const source of state.data.sources || []) {
    if (state.sources.has(source.name)) continue;
    if (source.name.toLowerCase().includes(q))
      out.push({ kind: "source", label: source.name, value: source.name, n: source.count });
  }
  out.length = Math.min(out.length, 9);
  out.push({ kind: "text", label: query.trim(), value: query.trim() });
  return out;
}

function accept(item) {
  if (item.kind === "theme") state.themes.add(item.value);
  else if (item.kind === "source") state.sources.add(item.value);
  else if (item.value) state.terms.push(item.value);
  el("q").value = "";
  el("suggest").hidden = true;
  state.quiz = null;
  render();
}

/* ---------- rendering ---------- */

function simanButton(n, covered) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = hebrewNumber(n);
  // every siman opens - its Shulchan Aruch text is always there; the ones
  // with a summary from the group stand out
  button.classList.toggle("has", covered.has(n));
  button.title = covered.has(n) ? "" : "טקסט בלבד — עדיין אין סיכום";
  button.classList.toggle("on", state.siman === n);
  button.onclick = () => {
    state.siman = state.siman === n && !state.quiz ? null : n;
    state.seif = null;
    state.quiz = null;
    renderSections();
    render();
    if (state.siman) toSimanTop();
  };
  return button;
}

function renderSections() {
  const host = el("sections");
  host.innerHTML = "";
  renderViewToggle();
  el("toggleSections").hidden = state.flatView;

  if (state.flatView) {
    const covered = new Set();
    for (const section of state.data.sections)
      for (const n of section.covered) covered.add(n);
    const grid = document.createElement("div");
    grid.className = "simangrid flat";
    for (let n = 1; n <= state.data.max_siman; n++) grid.appendChild(simanButton(n, covered));
    host.appendChild(grid);
    return;
  }

  for (const section of state.data.sections) {
    const wrap = document.createElement("details");
    wrap.className = "section";
    // purely the reader's choice - forcing the section holding the selection
    // open would make it spring back the moment they collapsed it, and the
    // chip above already shows which siman is active
    wrap.open = !state.closedSections.has(section.name);
    wrap.ontoggle = () => {
      if (wrap.open) state.closedSections.delete(section.name);
      else state.closedSections.add(section.name);
    };

    const heading = document.createElement("summary");
    heading.innerHTML = `<span></span><span class="n">${sectionEntryCount(section)}</span>`;
    heading.firstChild.textContent = section.name;
    wrap.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "simangrid";
    const covered = new Set(section.covered);
    for (let n = section.start; n <= section.end; n++) grid.appendChild(simanButton(n, covered));
    wrap.appendChild(grid);
    host.appendChild(wrap);
  }
  renderToggleSections();
}

function renderViewToggle() {
  const button = el("viewMode");
  button.textContent = state.flatView ? UI.groupedView : UI.flatView;
  button.onclick = () => {
    state.flatView = !state.flatView;
    renderSections();
  };
}

function renderToggleSections() {
  const button = el("toggleSections");
  const allOpen = state.closedSections.size === 0;
  button.textContent = allOpen ? UI.collapseAll : UI.expandAll;
  button.onclick = () => {
    if (allOpen) for (const s of state.data.sections) state.closedSections.add(s.name);
    else state.closedSections.clear();
    renderSections();
  };
}

function renderThemes() {
  const wrap = el("themesWrap");
  if (!state.data.themes.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  el("themesLabel").textContent = UI.browseThemes;

  // count each theme against the other filters, so the number shown is what
  // you would actually get by adding it - not a global total that then yields 0
  const pool = state.data.entries.filter((entry) => {
    const saved = state.themes;
    state.themes = new Set();
    const ok = matches(entry);
    state.themes = saved;
    return ok;
  });
  const counts = {};
  for (const entry of pool)
    for (const slug of entry.themes) counts[slug] = (counts[slug] || 0) + 1;

  const byCategory = new Map();
  for (const theme of state.data.themes) {
    if (!byCategory.has(theme.category)) byCategory.set(theme.category, []);
    byCategory.get(theme.category).push(theme);
  }

  const host = el("themeList");
  host.innerHTML = "";
  for (const [category, themes] of byCategory) {
    const available = themes.filter((x) => counts[x.slug] || state.themes.has(x.slug));
    if (!available.length) continue;

    const details = document.createElement("details");
    details.open = available.some((x) => state.themes.has(x.slug));
    const summary = document.createElement("summary");
    summary.textContent = category;
    details.appendChild(summary);

    for (const theme of available) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "themerow";
      button.classList.toggle("on", state.themes.has(theme.slug));
      button.innerHTML = `<span></span><span class="n">${counts[theme.slug] || 0}</span>`;
      button.firstChild.textContent = theme.label;
      button.onclick = () => {
        if (state.themes.has(theme.slug)) state.themes.delete(theme.slug);
        else state.themes.add(theme.slug);
        render();
      };
      details.appendChild(button);
    }
    host.appendChild(details);
  }
}

function renderSources() {
  const wrap = el("sourcesWrap");
  const all = state.data.sources || [];
  if (!all.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  el("sourcesLabel").textContent = UI.browseSources;

  // counted against the other filters, same as themes
  const pool = state.data.entries.filter((entry) => {
    const saved = state.sources;
    state.sources = new Set();
    const ok = matches(entry);
    state.sources = saved;
    return ok;
  });
  const counts = {};
  for (const entry of pool)
    for (const name of entry.sources || []) counts[name] = (counts[name] || 0) + 1;

  const host = el("sourceList");
  host.innerHTML = "";
  const shownKinds = [];
  for (const kind of ["classical", "modern"]) {
    const available = all.filter(
      (s) => s.kind === kind && (counts[s.name] || state.sources.has(s.name)));
    if (!available.length) continue;
    shownKinds.push(kind);

    const details = document.createElement("details");
    // a manual collapse is remembered, but an active filter in this group
    // always forces it back open so the selection stays visible
    details.open = !state.closedSourceCategories.has(kind)
      || available.some((s) => state.sources.has(s.name));
    details.ontoggle = () => {
      if (details.open) state.closedSourceCategories.delete(kind);
      else state.closedSourceCategories.add(kind);
    };
    const summary = document.createElement("summary");
    summary.textContent = UI[kind];
    details.appendChild(summary);

    for (const source of available) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "themerow";
      button.classList.toggle("on", state.sources.has(source.name));
      button.innerHTML = `<span></span><span class="n">${counts[source.name] || 0}</span>`;
      button.firstChild.textContent = source.name;
      button.onclick = () => {
        if (state.sources.has(source.name)) state.sources.delete(source.name);
        else state.sources.add(source.name);
        render();
      };
      details.appendChild(button);
    }
    host.appendChild(details);
  }
  renderToggleSources(shownKinds);
}

function renderToggleSources(shownKinds) {
  const button = el("toggleSources");
  if (!shownKinds.length) { button.hidden = true; return; }
  button.hidden = false;
  const allOpen = shownKinds.every((k) => !state.closedSourceCategories.has(k));
  button.textContent = allOpen ? UI.collapseAll : UI.expandAll;
  button.onclick = () => {
    if (allOpen) for (const k of shownKinds) state.closedSourceCategories.add(k);
    else for (const k of shownKinds) state.closedSourceCategories.delete(k);
    render();
  };
}

function renderChips() {
  const host = el("chips");
  host.innerHTML = "";
  const add = (cls, label, remove) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `chip ${cls}`;
    chip.innerHTML = `<span></span><span class="x">×</span>`;
    chip.firstChild.textContent = label;
    chip.onclick = () => { remove(); render(); };
    host.appendChild(chip);
  };

  if (state.siman) {
    add("place", `${findSection(state.siman)?.name ?? ""} ${hebrewNumber(state.siman)}`.trim(),
      () => { state.siman = null; renderSections(); });
  }
  const labelOf = (slug) => (state.data.themes.find((x) => x.slug === slug) || {}).label || slug;
  for (const slug of state.themes) add("theme", labelOf(slug), () => state.themes.delete(slug));
  for (const name of state.sources) add("source", name, () => state.sources.delete(name));
  state.terms.forEach((term, i) =>
    add("text", `"${term}"`, () => state.terms.splice(i, 1)));

  el("clear").hidden = host.children.length === 0;
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function formatBody(text, entry) {
  // which siman a "סעיף ז" refers to: the last siman the post named before
  // it, or the post's first siman. Carried across paragraphs.
  let context = entry ? entry.simanim[0] : null;
  return text.split(/\n{2,}/).map((block) => {
    let html = escapeHtml(block).replace(/\n/g, " ");
    if (entry) {
      [html, context] = linkSeifim(html, entry, context);
    }
    html = html.replace(/https?:\/\/[^\s<]+/g,
      (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
    html = html.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>"); // whatsapp bold
    for (const term of state.terms) {
      if (!term.trim()) continue;
      const pattern = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      // only in the text between tags, never inside a tag's attributes
      html = html.replace(/(<[^>]*>)|([^<]+)/g, (m, tag, text) =>
        tag || text.replace(pattern, "<mark>$1</mark>"));
    }
    return `<p>${html}</p>`;
  }).join("");
}

function card(entry) {
  const node = document.createElement("article");
  node.className = "card";
  node.dataset.pdf = simanRef(entry) + (entry.date ? ` (${entry.date})` : "");

  const head = document.createElement("div");
  head.className = "cardhead";

  // built from the parsed fields, not the raw header: the header's own
  // dashes are unreliable separators
  const heading = document.createElement("h3");
  heading.textContent = simanRef(entry);
  head.appendChild(heading);

  node.appendChild(head);

  if (entry.title) {
    const subtitle = document.createElement("p");
    subtitle.className = "subtitle";
    subtitle.textContent = entry.title;
    node.appendChild(subtitle);
  }

  const body = document.createElement("div");
  body.className = "body collapsed";
  body.innerHTML = formatBody(entry.text);
  node.appendChild(body);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "more";
  toggle.textContent = UI.more;
  toggle.onclick = () => {
    const open = body.classList.toggle("collapsed");
    toggle.textContent = open ? UI.more : UI.less;
  };

  const actions = document.createElement("div");
  actions.className = "cardactions";
  actions.appendChild(toggle);
  node.appendChild(actions);

  if (entry.themes.length || entry.sources.length) {
    const tags = document.createElement("div");
    tags.className = "tags";
    for (const name of entry.sources || []) {
      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = "tag source";
      tag.textContent = name;
      tag.onclick = () => { state.sources.add(name); render(); };
      tags.appendChild(tag);
    }
    for (const slug of entry.themes) {
      const theme = state.data.themes.find((x) => x.slug === slug);
      if (!theme) continue;
      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = "tag theme";
      tag.textContent = theme.label;
      tag.onclick = () => { state.themes.add(slug); render(); };
      tags.appendChild(tag);
    }
    node.appendChild(tags);
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  if (entry.writer) meta.append(`${UI.by} ${writerLabel(entry.writer)}`);
  if (entry.date) meta.append(entry.date);
  if (entry.links.length) {
    const span = document.createElement("span");
    span.textContent = `${UI.links}: `;
    entry.links.slice(0, 4).forEach((url, i) => {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = i + 1;
      span.append(a, " ");
    });
    meta.appendChild(span);
  }
  if (meta.childNodes.length) node.appendChild(meta);

  return node;
}

/* ---------- the siman view: Shulchan Aruch text beside the summaries ---------- */

const HEB_VALUE = {
  "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9,
  "י": 10, "כ": 20, "ך": 20, "ל": 30, "מ": 40, "ם": 40, "נ": 50, "ן": 50,
  "ס": 60, "ע": 70, "פ": 80, "ף": 80, "צ": 90, "ץ": 90, "ק": 100, "ר": 200,
  "ש": 300, "ת": 400,
};

// gematria-shaped but ordinary words ("שם" = ibid., "זה", "זו", "שני")
const NOT_A_NUMERAL_WORD = new Set(["שם", "זה", "זו", "שני"]);

/** י"ג -> 13; null for anything that isn't a numeral (letters must not increase) */
function hebrewValue(token) {
  const letters = [...token.replace(/&quot;|["'״׳]/g, "")];
  if (!letters.length || letters.length > 4) return null;
  const values = letters.map((ch) => HEB_VALUE[ch]);
  if (values.some((v) => !v)) return null;
  if (!values.every((v, i) => i === 0 || v <= values[i - 1] || (values[i - 1] === 9 && v <= 7))) return null;
  const word = letters.join("");
  if (NOT_A_NUMERAL_WORD.has(word)) return null;
  return values.reduce((a, b) => a + b, 0);
}

// a numeral as the posts write it: letters, maybe with a geresh/gershayim
const NUM = String.raw`[א-ת]{1,3}(?:(?:&quot;|["״])[א-ת])?['׳]?`;
const REF_RE = new RegExp(
  String.raw`(?<![א-ת])([ובלה]?)(סימנים|סימן|סעיפים|סעיף|סע['׳])\s+(${NUM})(?:\s*[-–־]\s*(${NUM}))?(?![א-ת])`, "g");

// "סעיף ו" / "סעיפים ד-ה" in a post -> a button that marks that se'if in the
// text beside it. Returns the html and the siman in context afterwards.
function linkSeifim(html, entry, context) {
  let current = context;
  const out = html.replace(REF_RE, (match, prefix, keyword, first, second) => {
    const a = hebrewValue(first);
    if (!a) return match;
    if (keyword.startsWith("סימ")) {
      if (entry.simanim.includes(a)) current = a;
      return match;
    }
    const b = second ? hebrewValue(second) : a;
    if (!b || b < a || b - a > 12) return match;
    return `${prefix}<button type="button" class="seifref" data-siman="${current}" data-from="${a}" data-to="${b}">${match.slice(prefix.length)}</button>`;
  });
  return [out, current];
}

const textCache = new Map();

function loadSiman(n) {
  if (!textCache.has(n)) {
    textCache.set(n, fetch(`data/sa/${n}.json`).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).catch((err) => { textCache.delete(n); throw err; }));
  }
  return textCache.get(n);
}

function sefariaUrl(n, seif) {
  return `https://www.sefaria.org/Shulchan_Arukh%2C_Orach_Chayim.${n}${seif ? "." + seif : ""}?lang=he`;
}

function node(tag, cls, text) {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  if (text != null) x.textContent = text;
  return x;
}

/** text with the search terms marked, as DOM nodes (never innerHTML) */
function withMarks(text) {
  const terms = state.terms.filter((t) => t.trim());
  if (!terms.length) return [document.createTextNode(text)];
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(pattern).map((part, i) =>
    i % 2 ? node("mark", null, part) : document.createTextNode(part));
}

// a run of text with the nosei kelim's anchors underlined (exact words of the
// run; see scripts/check_nk.py) and the search terms marked
function decorate(text, anchors) {
  const out = [];
  let rest = text;
  while (rest) {
    let best = null;
    for (const a of anchors) {
      const at = rest.indexOf(a.text);
      if (at >= 0 && (!best || at < best.at)) best = { at, a };
    }
    if (!best) { out.push(...withMarks(rest)); break; }
    if (best.at) out.push(...withMarks(rest.slice(0, best.at)));
    const mark = node("mark", "hl");
    mark.dataset.points = best.a.ids.join(" ");
    mark.append(...withMarks(best.a.text));
    out.push(mark);
    rest = rest.slice(best.at + best.a.text.length);
  }
  return out;
}

function seifNode(runs, i, anchors = []) {
  const p = node("div", "seif");
  p.id = `seif-${i + 1}`;
  p.append(node("span", "num", hebrewNumber(i + 1).replace(/['"]/g, "")));
  for (const [kind, text] of runs) {
    if (kind === "rema") {
      const span = node("span", "rema");
      // "הגה" opens each of the Rema's glosses
      text.split(/(?<![א-ת])(הגה)(?![א-ת])/).forEach((part, j) => {
        if (j % 2) span.append(node("b", "haga", part));
        else span.append(...decorate(part, anchors));
      });
      p.append(span);
    } else if (kind === "b") {
      const b = node("b");
      b.append(...decorate(text, anchors));
      p.append(b);
    } else {
      p.append(...decorate(text, anchors));
    }
  }
  return p;
}

// Bring a node into view: inside its own scrolling column on wide screens,
// in the page when the columns are stacked (same as the Mishnah site).
function reveal(target) {
  const col = target.closest(".text-col, .side-col");
  if (col && col.scrollHeight > col.clientHeight + 1) {
    const top = target.getBoundingClientRect().top - col.getBoundingClientRect().top + col.scrollTop - 8;
    col.scrollTo({ top, behavior: "smooth" });
    const lay = col.closest(".layout").getBoundingClientRect().top;
    if (lay > 140 || lay < 70) window.scrollBy({ top: lay - 90 });
  } else {
    window.scrollTo({ top: target.getBoundingClientRect().top + scrollY - 96, behavior: "smooth" });
  }
}

function seifRange(from, to) {
  const out = [];
  for (let i = from; i <= to; i++) {
    const x = el(`seif-${i}`);
    if (x) out.push(x);
  }
  return out;
}

function flashSeifim(from, to) {
  const nodes = seifRange(from, to);
  if (!nodes.length) return;
  reveal(nodes[0]);
  for (const x of nodes) {
    x.classList.remove("flash"); void x.offsetWidth; x.classList.add("flash");
  }
}

function postItem(entry, open) {
  const d = node("details", "item post");
  d.open = open;
  d.dataset.pdf = UI.posts;
  const s = node("summary");
  s.append(node("span", "ttl", entry.title || simanRef(entry)));
  if (entry.simanim.length > 1) {
    const span = entry.simanim.length > 1
      ? `${hebrewNumber(entry.simanim[0])}–${hebrewNumber(entry.simanim[entry.simanim.length - 1])}` : "";
    s.append(node("span", "span", span));
  }
  if (entry.date) s.append(node("span", "date", entry.date));
  d.append(s);

  const body = node("div", "body");
  const text = node("div", "posttext");
  text.innerHTML = formatBody(entry.text, entry);
  body.append(text);

  if (entry.themes.length || entry.sources.length) {
    const tags = node("div", "tags");
    for (const name of entry.sources || []) {
      const tag = node("button", "tag source", name);
      tag.type = "button";
      tag.onclick = () => { state.sources.add(name); render(); };
      tags.append(tag);
    }
    for (const slug of entry.themes) {
      const theme = state.data.themes.find((x) => x.slug === slug);
      if (!theme) continue;
      const tag = node("button", "tag theme", theme.label);
      tag.type = "button";
      tag.onclick = () => { state.themes.add(slug); render(); };
      tags.append(tag);
    }
    body.append(tags);
  }

  const meta = node("div", "meta");
  if (entry.writer) meta.append(`${UI.by} ${writerLabel(entry.writer)}`);
  if (entry.links.length) {
    const span = node("span", null, `${UI.links}: `);
    entry.links.slice(0, 4).forEach((url, i) => {
      const a = node("a", null, String(i + 1));
      a.href = url; a.target = "_blank"; a.rel = "noopener";
      span.append(a, " ");
    });
    meta.append(span);
  }
  if (meta.childNodes.length) body.append(meta);
  d.append(body);
  return d;
}

function postsBox(posts, totalForSiman) {
  const box = node("details", "box");
  box.open = false;   // closed until the reader opens it
  const s = node("summary", null, UI.posts);
  s.append(node("span", "count", String(posts.length)));
  box.append(s);
  const body = node("div", "body");
  if (!posts.length) {
    body.append(node("p", "muted", totalForSiman ? UI.noMatchingPosts : UI.noPosts));
  } else {
    if (posts.length > 1) {
      const bar = node("div", "toolbar");
      const ex = node("button", null, UI.expand), co = node("button", null, UI.collapse);
      ex.type = co.type = "button";
      ex.onclick = () => body.querySelectorAll("details.item").forEach((x) => (x.open = true));
      co.onclick = () => body.querySelectorAll("details.item").forEach((x) => (x.open = false));
      bar.append(ex, co);
      body.append(bar);
    }
    posts.forEach((entry) => body.append(postItem(entry, false)));
  }
  box.append(body);
  return box;
}

/* ---------- the nosei kelim on the siman (scripts/check_nk.py, add_nk.py) ---------- */

const nkCache = new Map();

function loadNk(n) {
  if (!state.nkSimanim.has(n)) return Promise.resolve(null);
  if (!nkCache.has(n)) {
    nkCache.set(n, fetch(`data/nk/${n}.json`).then((r) => (r.ok ? r.json() : null))
      .catch(() => { nkCache.delete(n); return null; }));
  }
  return nkCache.get(n);
}

function sefariaRef(ref) {
  return `https://www.sefaria.org/${encodeURIComponent(ref.replace(/ /g, "_")).replace(/%3A/g, ":").replace(/%2C/g, ",")}?lang=he`;
}

function seifButton(n) {
  const b = node("button", "mref", UI.nkSeif(n));
  b.type = "button";
  b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); flashSeifim(n, n); };
  return b;
}

function lightPoint(id, on) {
  document.querySelectorAll("mark.hl").forEach((m) => {
    if (m.dataset.points.split(" ").includes(id)) m.classList.toggle("lit", on);
  });
}

function nkItem(point, id) {
  const d = node("details", "item nkpoint");
  d.id = id;
  const s = node("summary");
  s.append(node("span", "ttl", point.title), seifButton(point.seif));
  const body = node("div", "body");
  body.append(node("p", null, point.text));
  for (const src of point.sources) {
    const cite = node("div", "cite");
    cite.append(node("b", null, src.name), " (");
    const a = node("a", null, "ספריא");
    a.href = sefariaRef(src.ref); a.target = "_blank"; a.rel = "noopener";
    cite.append(a, "): ", node("span", "quote", `"${src.quote}"`));
    body.append(cite);
  }
  d.append(s, body);
  d.addEventListener("mouseenter", () => lightPoint(id, true));
  d.addEventListener("mouseleave", () => lightPoint(id, false));
  return d;
}

function nkBox(nk) {
  const box = node("details", "box nkbox");
  box.open = false;   // closed until the reader opens it
  box.dataset.pdf = UI.nk;
  const s = node("summary", null, UI.nk);
  s.append(node("span", "count", String(nk.points.length)));
  box.append(s);
  const body = node("div", "body");
  body.append(node("p", "overview", nk.overview));
  const bar = node("div", "toolbar");
  const ex = node("button", null, UI.expand), co = node("button", null, UI.collapse);
  ex.type = co.type = "button";
  ex.onclick = () => body.querySelectorAll("details.item").forEach((x) => (x.open = true));
  co.onclick = () => body.querySelectorAll("details.item").forEach((x) => (x.open = false));
  bar.append(ex, co);
  body.append(bar);
  nk.points.forEach((point, i) => body.append(nkItem(point, `nk${i}`)));
  if (nk.sources_consulted && nk.sources_consulted.length) {
    body.append(node("p", "sources", `${UI.nkSources}: ${nk.sources_consulted.join(" · ")}`));
  }
  box.append(body);
  return box;
}

// clicking underlined words opens the points that explain them
function openPoints(ids) {
  let first = null;
  for (const id of ids) {
    const d = el(id);
    if (!d) continue;
    d.closest("details.box").open = true;
    d.open = true;
    d.classList.add("lit");
    setTimeout(() => d.classList.remove("lit"), 1600);
    first = first || d;
  }
  if (first) reveal(first);
}

/* anchors per se'if: [{text, ids}] */
function anchorsBySeif(nk) {
  const by = new Map();
  (nk ? nk.points : []).forEach((point, i) => {
    if (!point.anchor) return;
    if (!by.has(point.seif)) by.set(point.seif, []);
    const list = by.get(point.seif);
    const same = list.find((a) => a.text === point.anchor);
    if (same) same.ids.push(`nk${i}`);
    else list.push({ text: point.anchor, ids: [`nk${i}`] });
  });
  return by;
}

function quizButtons(n) {
  const bar = node("div", "quizlinks");
  if (state.quizSimanim.has(n)) {
    const b = node("button", "button quizlink", UI.quiz);
    b.type = "button";
    b.onclick = () => openQuiz(String(n));
    bar.append(b);
  }
  const section = findSection(n);
  if (section && sectionQuizSimanim(section).length) {
    const b = node("button", "button ghost quizlink", UI.sectionQuiz(section.name));
    b.type = "button";
    b.onclick = () => openQuiz(`sec:${section.start}`);
    bar.append(b);
  }
  return bar.childNodes.length ? bar : null;
}

// wide screens: back to the top; phones, where the siman grid sits above the
// results, straight to the text
function toSimanTop() {
  if (matchMedia("(max-width: 780px)").matches) el("results").scrollIntoView();
  else window.scrollTo({ top: 0 });
}

function simanNav(n) {
  const nav = node("div", "simannav");
  const go = (to) => () => {
    state.siman = to; state.seif = null; state.quiz = null;
    renderSections(); render(); toSimanTop();
  };
  if (n > 1) {
    const prev = node("button", "ghost small prev", UI.prev(n - 1));
    prev.type = "button"; prev.onclick = go(n - 1);
    nav.append(prev);
  }
  if (n < state.data.max_siman) {
    const next = node("button", "ghost small next", UI.next(n + 1));
    next.type = "button"; next.onclick = go(n + 1);
    nav.append(next);
  }
  return nav;
}

let simanRender = 0;

async function renderSiman() {
  const n = state.siman;
  const ticket = ++simanRender;
  const list = el("list");
  list.innerHTML = "";
  el("empty").hidden = true;

  const allPosts = state.data.entries.filter((e) => e.simanim.includes(n));
  const posts = filtered();
  el("count").textContent = "";

  const head = node("div", "siman-head");
  head.dataset.pdfHead = "";
  const section = findSection(n);
  if (section) head.append(node("p", "section-name", section.name));
  head.append(node("h2", null, UI.siman(n)));
  const meta = node("p", "siman-meta");
  head.append(meta);
  const quizzes = quizButtons(n);
  if (quizzes) head.append(quizzes);
  list.append(simanNav(n), head);

  const layout = node("div", "layout");
  const textCol = node("div", "text-col");
  textCol.dataset.pdf = UI.saText;
  const card = node("div", "sa-card");
  card.append(node("p", "muted", UI.loading));
  textCol.append(card);
  const side = node("div", "side-col");
  side.append(postsBox(posts, allPosts.length));
  layout.append(textCol, side);
  list.append(layout);

  let data = null;
  const nkPromise = loadNk(n);
  try { data = await loadSiman(n); } catch { /* shown below */ }
  const nk = await nkPromise;
  if (ticket !== simanRender) return;   // the reader moved on while it loaded
  if (nk) side.prepend(nkBox(nk));

  const link = node("a", null, UI.sefaria);
  link.href = sefariaUrl(n); link.target = "_blank"; link.rel = "noopener";
  if (data && data.title) meta.append(`${data.title} · `);
  meta.append(link);

  card.innerHTML = "";
  if (!data) {
    card.append(node("p", "muted", UI.failed));
    return;
  }
  const anchors = anchorsBySeif(nk);
  data.seifim.forEach((runs, i) => card.append(seifNode(runs, i, anchors.get(i + 1) || [])));
  card.addEventListener("click", (e) => {
    const mark = e.target.closest("mark.hl");
    if (mark) openPoints(mark.dataset.points.split(" "));
  });
  const legend = node("p", "legend");
  legend.append(node("span", "lr", UI.rema));
  if (anchors.size) legend.append(node("span", "lt", UI.nkLegend));
  if (posts.length) legend.append(node("span", "ls", UI.seifLegend));
  textCol.append(legend);

  if (state.seif) {
    const seif = state.seif;
    state.seif = null;
    requestAnimationFrame(() => flashSeifim(seif, seif));
  }
}

/* ---------- quiz: multiple-choice questions on a siman (scripts/quiz.py) ----------
   The same game as the parasha quizzes on aliyah-yomit: a siman is a parasha, a section of
   halachot (הלכות ...) a sefer. */

const QUIZ_UI = {
  back: "חזרה לסימן",
  title: (n) => `חידון — סימן ${hebrewNumber(n)}`,
  sectionTitle: (name) => `חידון — ${name}`,
  sub: "שאלות אמריקאיות על לשון השולחן ערוך",
  sectionSub: "שאלות מכל הסימנים בהלכות אלו, מתוך מאגר השאלות של החידונים על הסימנים",
  rules: (p, from, bonus) => `${p} נקודות על כל תשובה נכונה, ועוד ${bonus} נקודות בונוס מהתשובה ה־${from} ברצף.`,
  points: (n) => `${n} נק׳`,
  count: (right, done, total) => `${right}/${done} נכונות · ${done} מתוך ${total}`,
  streakToast: (n, total) => (n === total ? `🏆 ${n} ברצף — בלי אף טעות!` : n >= 10 ? `🔥🔥 ${n} ברצף! מדהים!` : `🔥 ${n} ברצף!`),
  rank: (right, total) => right === total ? "מושלם! בקיא בהלכה כמו תלמיד חכם" : right / total >= 0.9 ? "תלמיד חכם!" : right / total >= 0.7 ? "בקיא בהלכה!" : right / total >= 0.5 ? "בדרך הנכונה" : "כדאי לחזור על הסימן ולנסות שוב",
  longest: (n) => `הרצף הארוך ביותר: ${n}`,
  best: "השיא שלך",
  bestShort: (right, total) => `${right} מתוך ${total}`,
  newBest: "🎉 שיא אישי חדש!",
  review: "לחזרה על הטעויות:",
  right: ["נכון!", "יפה מאוד!", "מצוין!", "בדיוק!", "כל הכבוד!", "אלוף!"],
  wrong: ["לא בדיוק.", "כמעט.", "לא הפעם.", "טעות קטנה."],
  hintBtn: (n) => `רמז (השאלה תהיה שווה ${n} נק׳)`,
  toText: "לסעיף בספריא",
  howMany: "כמה שאלות?",
  from: "מאילו סימנים?",
  all: "כולם",
  clear: "נקה",
  pickSiman: "בחרו לפחות סימן אחד.",
  pickType: "בחרו לפחות סוג שאלות אחד.",
  willDraw: (n, max) => `ייבחרו ${n} שאלות באקראי מתוך ${max} שבמאגר.`,
  willDrawSection: (n, k, max) => `ייבחרו ${n} שאלות באקראי, מחולקות באופן שווה בין ${k === 1 ? "סימן אחד" : `${k} סימנים`} (יש במאגר ${max}).`,
  partial: (have, all) => `יש חידון ל־${have} מתוך ${all} הסימנים בהלכות אלו; השאר יתווספו כשיתפרסמו.`,
  none: "עדיין אין חידונים על הסימנים האלה.",
  start: "התחילו את החידון",
  order: "סדר השאלות",
  inOrder: "לפי סדר הסעיפים",
  inSimanOrder: "לפי סדר הסימנים",
  mixed: "מעורבב",
  again: "שאלות חדשות",
  change: "שינוי ההגדרות",
  allN: (n) => `כולן (${n})`,
  typesLabel: "אילו סוגי שאלות?",
  allTypes: "כל הסוגים",
  types: { din: "מה הדין", taam: "טעמים", rema: "המחבר והרמ״א", complete: "השלמת הלשון" },
  loading: "טוען…",
  failed: "לא הצלחנו לטעון את החידון.",
};

// Scoring: 10 points for a right answer (5 if the hint was opened), +5 for every right answer
// that is the 3rd or more in a row.
const QUIZ_POINTS = 10, QUIZ_HINTED = 5, QUIZ_STREAK_BONUS = 5, QUIZ_STREAK_FROM = 3;
const SECTION_SIZES = [10, 20, 30, 50, 100];
const SECTION_DEFAULT = 20;
const SIMAN_SIZES = [5, 10, 15];
const SIMAN_DEFAULT = 10;
const QUIZ_ALL = 1e9;
const QUIZ_TYPES = ["din", "taam", "rema", "complete"];
const typeOf = (q) => (QUIZ_TYPES.includes(q.t) ? q.t : "din");
const playable = (q) => QUIZ_TYPES.includes(q.t);

const quizFiles = new Map();  // siman -> fetch promise
const quizRuns = new Map();   // quiz key -> this visit's run
const quizSetups = new Map(); // quiz key -> {count, simanim: Set, types: Set, mix}

function loadQuiz(n) {
  if (!quizFiles.has(n)) {
    quizFiles.set(n, fetch(`data/quiz/${n}.json`)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch((error) => { quizFiles.delete(n); throw error; }));
  }
  return quizFiles.get(n);
}

const sectionOf = (key) => (key && key.startsWith("sec:")
  ? state.data.sections.find((x) => x.start === Number(key.slice(4))) || null : null);
function sectionQuizSimanim(section) {
  const out = [];
  for (let n = section.start; n <= section.end; n++) if (state.quizSimanim.has(n)) out.push(n);
  return out;
}

function quizBest(key) {
  try { return JSON.parse(localStorage.getItem(`oc-quiz-best:${key}`)) || null; } catch { return null; }
}
function saveQuizBest(key, result) {
  try { localStorage.setItem(`oc-quiz-best:${key}`, JSON.stringify(result)); } catch { /* not saved */ }
}

const calm = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const shuffled = (list) => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** Draw `count` questions spread evenly over the simanim, in order or all mixed together. */
function drawQuestions(banks, count, mix) {
  const want = banks.map(() => 0);
  let left = Math.min(count, banks.reduce((s, b) => s + b.questions.length, 0));
  const order = shuffled(banks.map((_, i) => i));
  while (left > 0) {
    for (const i of order) {
      if (left > 0 && want[i] < banks[i].questions.length) { want[i]++; left--; }
    }
  }
  const out = [];
  banks.forEach((bank, i) => {
    const picks = shuffled(bank.questions.map((_, k) => k)).slice(0, want[i]).sort((x, y) => x - y);
    picks.forEach((k) => out.push({ ...bank.questions[k], siman: bank.siman }));
  });
  return mix ? shuffled(out) : out;
}

function withShuffledOptions(q) {
  const order = shuffled(q.o.map((_, i) => i));
  return { ...q, o: order.map((i) => q.o[i]), a: order.indexOf(q.a) };
}

function quizTally(questions, run) {
  let points = 0, right = 0, streak = 0, longest = 0;
  const missed = [];
  questions.forEach((q, i) => {
    if (!run.chosen.has(i)) return;
    if (run.chosen.get(i) === q.a) {
      right++; streak++; longest = Math.max(longest, streak);
      points += run.hinted.has(i) ? QUIZ_HINTED : QUIZ_POINTS;
      if (streak >= QUIZ_STREAK_FROM) points += QUIZ_STREAK_BONUS;
    } else { streak = 0; missed.push(i); }
  });
  return { points, right, streak, longest, missed, done: run.chosen.size };
}

function confetti() {
  if (calm()) return;
  const layer = node("div", "confetti");
  layer.setAttribute("aria-hidden", "true");
  const colors = ["#b8924a", "#16305c", "#2e7d4f", "#d0675c", "#6f93cf", "#e8c46a"];
  for (let n = 0; n < 90; n++) {
    const bit = node("i");
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = colors[n % colors.length];
    bit.style.animationDelay = `${Math.random() * 0.6}s`;
    bit.style.animationDuration = `${2.2 + Math.random() * 1.6}s`;
    bit.style.setProperty("--drift", `${(Math.random() - 0.5) * 220}px`);
    bit.style.setProperty("--spin", `${(Math.random() - 0.5) * 1440}deg`);
    layer.appendChild(bit);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 4600);
}

function floatUp(anchor, text, cls) {
  if (calm()) return;
  const tag = node("span", `quizfloat ${cls || ""}`, text);
  tag.dir = "ltr";
  anchor.appendChild(tag);
  setTimeout(() => tag.remove(), 1300);
}

function quizToast(host, text) {
  const old = host.querySelector(".quiztoast");
  if (old) old.remove();
  const toast = node("div", "quiztoast", text);
  toast.setAttribute("role", "status");
  host.appendChild(toast);
  setTimeout(() => toast.classList.add("out"), 1800);
  setTimeout(() => toast.remove(), 2400);
}

function openQuiz(key) {
  state.quiz = key;
  render();
  toSimanTop();
}

function closeQuiz() {
  const section = sectionOf(state.quiz);
  if (!state.siman) state.siman = section ? (sectionQuizSimanim(section)[0] || section.start) : Number(state.quiz) || null;
  state.quiz = null;
  renderSections();
  render();
  toSimanTop();
}

function renderQuiz() {
  const list = el("list");
  list.innerHTML = "";
  el("empty").hidden = true;
  el("count").textContent = "";
  const key = state.quiz;
  const section = sectionOf(key);
  const siman = section ? null : Number(key);
  if (!section && !(siman >= 1 && siman <= state.data.max_siman)) { state.quiz = null; render(); return; }
  const view = node("div", "quizview");
  const back = node("button", "back", `→ ${QUIZ_UI.back}`);
  back.type = "button";
  back.onclick = closeQuiz;
  const head = node("div", "quizhead");
  head.append(node("h2", null, section ? QUIZ_UI.sectionTitle(section.name) : QUIZ_UI.title(siman)),
    node("p", "muted", section ? QUIZ_UI.sectionSub : QUIZ_UI.sub));
  const host = node("div", "quizbody");
  view.append(back, head, host);
  list.append(view);

  const available = section ? sectionQuizSimanim(section) : (state.quizSimanim.has(siman) ? [siman] : []);
  if (!available.length) { host.append(node("p", "empty", QUIZ_UI.none)); return; }
  const run = quizRuns.get(key);
  if (run && run.questions) { renderQuizRun(host, key, run.questions, { section }); return; }

  const slot = node("p", "muted", QUIZ_UI.loading);
  host.append(slot);
  Promise.all(available.map((n) => loadQuiz(n).then((r) => ({ siman: n, questions: (r.questions || []).filter(playable) }))))
    .then((banks) => {
      if (state.quiz !== key) return;
      const form = node("div", "quizsetup");
      slot.replaceWith(form);
      buildQuizSetup(form, key, section, banks);
    })
    .catch(() => { slot.textContent = QUIZ_UI.failed; });
}

function buildQuizSetup(form, key, section, banks) {
  const ui = QUIZ_UI;
  const kinds = QUIZ_TYPES.filter((type) => banks.some((b) => b.questions.some((q) => typeOf(q) === type)));
  if (!quizSetups.has(key)) {
    quizSetups.set(key, {
      count: section ? SECTION_DEFAULT : SIMAN_DEFAULT,
      simanim: new Set(banks.map((b) => b.siman)),
      types: new Set(kinds),
      mix: true,
    });
  }
  const setup = quizSetups.get(key);
  setup.simanim = new Set([...setup.simanim].filter((n) => banks.some((b) => b.siman === n)));
  setup.types = new Set([...setup.types].filter((type) => kinds.includes(type)));
  const chosenBanks = () => banks.filter((b) => !section || setup.simanim.has(b.siman));
  const pool = () => chosenBanks().reduce((n, b) => n + b.questions.filter((q) => setup.types.has(typeOf(q))).length, 0);

  form.append(node("p", "quizintro", ui.rules(QUIZ_POINTS, QUIZ_STREAK_FROM, QUIZ_STREAK_BONUS)));

  form.append(node("div", "label", ui.howMany));
  const sizes = node("div", "qchips");
  const sizeButtons = [];
  for (const n of section ? SECTION_SIZES : SIMAN_SIZES) {
    const b = node("button", "qchip", String(n));
    b.type = "button";
    b.dataset.n = n;
    b.onclick = () => { setup.count = n; refresh(); };
    sizeButtons.push(b);
    sizes.append(b);
  }
  const allButton = node("button", "qchip");
  allButton.type = "button";
  allButton.onclick = () => { setup.count = QUIZ_ALL; refresh(); };
  sizes.append(allButton);
  const input = node("input");
  input.type = "number";
  input.min = "1";
  input.inputMode = "numeric";
  input.setAttribute("aria-label", ui.howMany);
  input.oninput = () => { const n = Math.floor(Number(input.value)); if (n > 0) { setup.count = n; refresh(true); } };
  sizes.append(input);
  form.append(sizes);

  let simanButtons = [];
  if (section) {
    const head = node("div", "label qhead");
    head.append(node("span", null, ui.from));
    const all = node("button", "linkish", ui.all);
    all.type = "button";
    all.onclick = () => { setup.simanim = new Set(banks.map((b) => b.siman)); refresh(); };
    const none = node("button", "linkish", ui.clear);
    none.type = "button";
    none.onclick = () => { setup.simanim = new Set(); refresh(); };
    head.append(all, none);
    form.append(head);
    const chips = node("div", "qchips");
    simanButtons = banks.map((bank) => {
      const b = node("button", "qchip", hebrewNumber(bank.siman));
      b.type = "button";
      b.onclick = () => { setup.simanim.has(bank.siman) ? setup.simanim.delete(bank.siman) : setup.simanim.add(bank.siman); refresh(); };
      chips.append(b);
      return [bank.siman, b];
    });
    form.append(chips);
    const size = section.end - section.start + 1;
    if (size > banks.length) form.append(node("p", "muted small", ui.partial(banks.length, size)));
  }

  const typeHead = node("div", "label qhead");
  typeHead.append(node("span", null, ui.typesLabel));
  const allTypes = node("button", "linkish", ui.allTypes);
  allTypes.type = "button";
  allTypes.onclick = () => { setup.types = new Set(kinds); refresh(); };
  const noTypes = node("button", "linkish", ui.clear);
  noTypes.type = "button";
  noTypes.onclick = () => { setup.types = new Set(); refresh(); };
  typeHead.append(allTypes, noTypes);
  form.append(typeHead);
  const typeChips = node("div", "qchips");
  const typeButtons = kinds.map((type) => {
    const b = node("button", "qchip");
    b.type = "button";
    const count = node("span", "chipcount");
    b.append(node("span", null, ui.types[type] || type), count);
    b.onclick = () => { setup.types.has(type) ? setup.types.delete(type) : setup.types.add(type); refresh(); };
    typeChips.append(b);
    return [type, b, count];
  });
  form.append(typeChips);

  form.append(node("div", "label", ui.order));
  const orders = node("div", "qchips");
  const orderButtons = [[true, ui.mixed], [false, section ? ui.inSimanOrder : ui.inOrder]].map(([mix, label]) => {
    const b = node("button", "qchip", label);
    b.type = "button";
    b.onclick = () => { setup.mix = mix; refresh(); };
    orders.append(b);
    return [mix, b];
  });
  form.append(orders);

  const best = node("p", "quizbestline");
  const note = node("p", "qnote");
  const start = node("button", "button", ui.start);
  start.type = "button";
  form.append(best, note, start);

  function refresh(typing) {
    const max = pool();
    const n = Math.min(setup.count, max);
    sizeButtons.forEach((b) => b.classList.toggle("on", Number(b.dataset.n) === setup.count));
    allButton.textContent = ui.allN(max);
    allButton.classList.toggle("on", setup.count >= max && !sizeButtons.some((b) => Number(b.dataset.n) === setup.count));
    if (!typing) input.value = setup.count >= QUIZ_ALL ? "" : String(setup.count);
    simanButtons.forEach(([s, b]) => b.classList.toggle("on", setup.simanim.has(s)));
    typeButtons.forEach(([type, b, count]) => {
      b.classList.toggle("on", setup.types.has(type));
      count.textContent = String(chosenBanks().reduce((k, bank) => k + bank.questions.filter((q) => typeOf(q) === type).length, 0));
    });
    orderButtons.forEach(([mix, b]) => b.classList.toggle("on", setup.mix === mix));
    start.disabled = !max;
    note.textContent = section && !setup.simanim.size ? ui.pickSiman
      : !setup.types.size ? ui.pickType
      : section ? ui.willDrawSection(n, setup.simanim.size, max) : ui.willDraw(n, max);
    const record = max ? quizBest(quizBestKey(key, n, setup, kinds, banks)) : null;
    best.textContent = record ? `${ui.best} (${n}): ${ui.bestShort(record.right, record.total)} · ${ui.points(record.points)}` : "";
    best.hidden = !record;
  }
  refresh();

  start.onclick = () => {
    if (!pool()) return;
    startQuiz(key, banks, setup, kinds, section);
    renderQuiz();
    toSimanTop();
  };
}

function quizBestKey(key, size, setup, kinds, banks) {
  let k = `${key}:${size}`;
  if (setup.types.size < kinds.length) k += `:${[...setup.types].sort().join("+")}`;
  if (banks.length > 1 && setup.simanim.size < banks.length) k += `:${[...setup.simanim].sort((a, b) => a - b).join("+")}`;
  return k;
}

function startQuiz(key, banks, setup, kinds, section) {
  const chosen = banks.filter((b) => !section || setup.simanim.has(b.siman))
    .map((b) => ({ siman: b.siman, questions: b.questions.filter((q) => setup.types.has(typeOf(q))) }));
  const questions = drawQuestions(chosen, setup.count, setup.mix).map(withShuffledOptions);
  quizRuns.set(key, {
    chosen: new Map(), hinted: new Set(), questions,
    bestKey: quizBestKey(key, questions.length, setup, kinds, banks),
    again: () => startQuiz(key, banks, setup, kinds, section),
  });
}

function renderQuizRun(host, key, questions, { section }) {
  const run = quizRuns.get(key);
  const total = questions.length;
  const ui = QUIZ_UI;
  const wrap = node("div", "quizwrap");

  const intro = node("div", "quizintro");
  intro.append(node("p", null, ui.rules(QUIZ_POINTS, QUIZ_STREAK_FROM, QUIZ_STREAK_BONUS)));
  const best = quizBest(run.bestKey);
  if (best) intro.append(node("p", "quizbestline", `${ui.best}: ${ui.bestShort(best.right, best.total)} · ${ui.points(best.points)}`));
  wrap.append(intro);

  const bar = node("div", "quizbar");
  const stats = node("div", "quizstats");
  const pointsBox = node("span", "quizpts");
  const streakBox = node("span", "quizstreak");
  const countBox = node("span", "quizcount");
  stats.append(pointsBox, streakBox, countBox);
  const restart = () => { quizRuns.delete(key); renderQuiz(); toSimanTop(); };
  const reset = node("button", null, ui.change);
  reset.type = "button";
  reset.onclick = restart;
  const track = node("div", "quizprogress");
  const fill = node("div", "fill");
  track.append(fill);
  bar.append(stats, reset, track);
  wrap.append(bar);

  const list = node("ol", "quizlist");
  const items = [];
  const results = node("div", "quizresults");
  results.hidden = true;

  const update = () => {
    const tally = quizTally(questions, run);
    pointsBox.textContent = ui.points(tally.points);
    streakBox.textContent = tally.streak >= 2 ? `🔥 ${tally.streak}` : "";
    streakBox.classList.toggle("hot", tally.streak >= QUIZ_STREAK_FROM);
    countBox.textContent = ui.count(tally.right, tally.done, total);
    fill.style.width = `${(tally.done / total) * 100}%`;
    return tally;
  };

  const finish = (fresh) => {
    const tally = quizTally(questions, run);
    const prior = quizBest(run.bestKey);
    const record = !prior || tally.points > prior.points;
    if (fresh && record) saveQuizBest(run.bestKey, { right: tally.right, total, points: tally.points });
    results.innerHTML = "";
    results.hidden = false;
    results.append(node("h3", null, ui.rank(tally.right, total)));
    results.append(node("p", "quizfinal", `${ui.bestShort(tally.right, total)} · ${ui.points(tally.points)}`));
    results.append(node("p", "quizfacts", ui.longest(tally.longest)));
    if (fresh && record && prior) results.append(node("p", "quizrecord", ui.newBest));
    else if (prior && !record) results.append(node("p", "muted", `${ui.best}: ${ui.points(prior.points)}`));
    if (tally.missed.length) {
      const again = node("div", "quizmissed");
      again.append(node("span", null, ui.review));
      tally.missed.forEach((i) => {
        const b = node("button", null, String(i + 1));
        b.type = "button";
        b.onclick = () => items[i].scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "center" });
        again.append(b);
      });
      results.append(again);
    }
    const replay = node("button", "button", ui.again);
    replay.type = "button";
    replay.onclick = () => { run.again(); renderQuiz(); toSimanTop(); };
    const change = node("button", "button ghost", ui.change);
    change.type = "button";
    change.onclick = restart;
    results.append(replay, change);
    if (fresh) {
      if (tally.right / total >= 0.7) confetti();
      setTimeout(() => results.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "center" }), 350);
    }
  };

  questions.forEach((q, i) => {
    const li = node("li", "quizq");
    items.push(li);
    const tags = node("div", "quiztags");
    if (section) tags.append(node("span", "quiztag", `סימן ${hebrewNumber(q.siman)}`));
    tags.append(node("span", "quiztag kind", ui.types[typeOf(q)] || ""));
    li.append(tags, node("p", "quizprompt", q.q));
    const opts = node("div", "quizopts");
    const after = node("div", "quizafter");
    const buttons = q.o.map((text, k) => {
      const b = node("button", "quizopt", text);
      b.type = "button";
      b.onclick = () => {
        if (run.chosen.has(i)) return;
        run.chosen.set(i, k);
        show(true);
        const tally = update();
        if (k === q.a) {
          let gained = run.hinted.has(i) ? QUIZ_HINTED : QUIZ_POINTS;
          if (tally.streak >= QUIZ_STREAK_FROM) gained += QUIZ_STREAK_BONUS;
          floatUp(b, `+${gained}`, "good");
          if (tally.streak === total || [3, 5, 10, 15, 20, 25, 50].includes(tally.streak)) quizToast(bar, ui.streakToast(tally.streak, total));
        }
        if (tally.done === total) finish(true);
      };
      opts.append(b);
      return b;
    });
    let hint = null;
    if (q.h) {
      hint = node("button", "quizhint", ui.hintBtn(QUIZ_HINTED));
      hint.type = "button";
      hint.onclick = () => { run.hinted.add(i); hint.replaceWith(node("p", "quizhinttext", q.h)); };
    }
    const show = (fresh) => {
      const pick = run.chosen.get(i);
      const good = pick === q.a;
      buttons.forEach((b, k) => {
        b.disabled = true;
        b.classList.toggle("right", k === q.a);
        b.classList.toggle("wrong", k === pick && !good);
      });
      li.classList.add(good ? "got" : "missed");
      if (fresh && !calm()) {
        li.classList.add(good ? "pop" : "shake");
        setTimeout(() => li.classList.remove("pop", "shake"), 600);
      }
      if (hint && hint.isConnected) hint.remove();
      after.innerHTML = "";
      const verdict = node("p", "quizverdict " + (good ? "ok" : "no"));
      verdict.append(node("b", null, good ? ui.right[i % ui.right.length] : ui.wrong[i % ui.wrong.length]), " ", q.e);
      after.append(verdict);
      const ref = node("p", "quizref");
      const seifNum = Number(String(q.ref).split(":")[1]) || q.seif;
      const a = node("a", null, `סימן ${hebrewNumber(q.siman)} סעיף ${hebrewNumber(seifNum).replace(/['"]/g, "")} — ${ui.toText}`);
      a.href = sefariaUrl(q.siman, seifNum); a.target = "_blank"; a.rel = "noopener";
      ref.append(a);
      after.append(ref);
    };
    li.append(opts);
    if (hint) li.append(hint);
    li.append(after);
    if (run.chosen.has(i)) show(false);
    list.append(li);
  });
  wrap.append(list, results);
  const tally = update();
  if (tally.done === total) finish(false);
  host.append(wrap);
}

function hasFilter() {
  return !!(state.siman || state.themes.size || state.sources.size || state.terms.length);
}

function render() {
  renderChips();
  renderThemes();
  renderSources();
  syncUrl();

  if (state.quiz) { simanRender++; renderQuiz(); return; }
  document.querySelectorAll(".confetti").forEach((layer) => layer.remove());
  if (state.siman) { renderSiman(); return; }
  simanRender++;

  // nothing chosen yet: leave the reading area empty rather than dumping all
  // 300-odd posts, which is neither a useful default nor quick to paint
  if (!hasFilter()) {
    el("count").textContent = "";
    el("list").innerHTML = "";
    el("empty").hidden = false;
    el("empty").textContent = UI.start;
    return;
  }

  const results = filtered();
  el("count").textContent = state.data.tagged
    ? UI.results(results.length)
    : `${UI.results(results.length)} · ${UI.untagged}`;

  const list = el("list");
  list.innerHTML = "";
  el("empty").hidden = results.length > 0;
  el("empty").textContent = UI.none;

  // full text is heavy; render a page at a time
  const slice = results.slice(0, 40);
  const fragment = document.createDocumentFragment();
  for (const entry of slice) fragment.appendChild(card(entry));
  list.appendChild(fragment);

  if (results.length > slice.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "ghost";
    more.textContent = `+ ${results.length - slice.length}`;
    more.onclick = () => {
      more.remove();
      const rest = document.createDocumentFragment();
      for (const entry of results.slice(40)) rest.appendChild(card(entry));
      list.appendChild(rest);
    };
    list.appendChild(more);
  }
}

/* ---------- shareable state ---------- */

let selfWrite = "";

function syncUrl() {
  const params = new URLSearchParams();
  if (state.siman) params.set("s", state.siman);
  if (state.siman && state.seif) params.set("seif", state.seif);
  if (state.themes.size) params.set("t", [...state.themes].join("|"));
  if (state.sources.size) params.set("src", [...state.sources].join("|"));
  if (state.terms.length) params.set("q", state.terms.join("|"));
  if (state.quiz) params.set("quiz", state.quiz);
  selfWrite = `#${params}`;
  history.replaceState(null, "", selfWrite);
}

function applyUrl() {
  const params = new URLSearchParams(location.hash.slice(1));
  state.themes.clear();
  state.sources.clear();

  const siman = Number(params.get("s"));
  state.siman = siman >= 1 && siman <= state.data.max_siman ? siman : null;
  const seif = Number(params.get("seif"));
  state.seif = state.siman && seif > 0 ? seif : null;

  const split = (key) => (params.get(key) ? params.get(key).split("|") : []);
  for (const slug of split("t"))
    if (state.data.themes.some((x) => x.slug === slug)) state.themes.add(slug);
  for (const name of split("src")) state.sources.add(name);
  state.terms = split("q");
  state.quiz = params.get("quiz") || null;

  renderSections();
  render();
}

/* ---------- events ---------- */

function wire() {
  const input = el("q");
  const box = el("suggest");
  let cursor = -1;

  const paint = () => {
    const items = suggestions(input.value);
    box.innerHTML = "";
    box.hidden = items.length === 0;
    cursor = -1;
    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      const kind = item.kind === "theme" ? UI.theme
        : item.kind === "source" ? UI.source : UI.text;
      button.innerHTML = `<span></span><span class="kind">${kind}</span>`;
      button.firstChild.textContent = item.label;
      button.onmousedown = (event) => { event.preventDefault(); accept(item); };
      box.appendChild(button);
    });
  };

  input.addEventListener("input", paint);
  input.addEventListener("focus", paint);
  input.addEventListener("blur", () => setTimeout(() => { box.hidden = true; }, 120));
  input.addEventListener("keydown", (event) => {
    const buttons = [...box.querySelectorAll("button")];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      cursor += event.key === "ArrowDown" ? 1 : -1;
      cursor = Math.max(0, Math.min(buttons.length - 1, cursor));
      buttons.forEach((b, i) => b.classList.toggle("cursor", i === cursor));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const items = suggestions(input.value);
      if (items.length) accept(items[cursor >= 0 ? cursor : items.length - 1]);
    } else if (event.key === "Escape") {
      box.hidden = true;
    }
  });

  const list = el("list");
  list.addEventListener("click", (event) => {
    const ref = event.target.closest("button.seifref");
    if (!ref) return;
    const siman = Number(ref.dataset.siman), from = Number(ref.dataset.from), to = Number(ref.dataset.to);
    if (siman === state.siman) { flashSeifim(from, to); return; }
    state.siman = siman; state.seif = from;
    renderSections(); render(); toSimanTop();
  });
  const lightRef = (event, on) => {
    const ref = event.target.closest("button.seifref");
    if (!ref || Number(ref.dataset.siman) !== state.siman) return;
    for (const x of seifRange(Number(ref.dataset.from), Number(ref.dataset.to))) x.classList.toggle("lit", on);
  };
  list.addEventListener("mouseover", (event) => lightRef(event, true));
  list.addEventListener("mouseout", (event) => lightRef(event, false));

  el("clear").onclick = () => {
    state.siman = null;
    state.quiz = null;
    state.themes.clear(); state.sources.clear(); state.terms = [];
    input.value = "";
    renderSections();
    render();
  };
}

/* ---------- sidebar resize ---------- */

const SIDEBAR_WIDTH_KEY = "oc-sidebar-width";
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;

function wireResizer() {
  const resizer = el("sidebarResizer");
  const root = document.documentElement;

  const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (stored) root.style.setProperty("--sidebar-width", `${stored}px`);

  let dragging = false;

  resizer.addEventListener("pointerdown", (event) => {
    dragging = true;
    resizer.classList.add("active");
    // capture is a nice-to-have (keeps the drag going if the pointer leaves
    // the handle); losing it should never block saving the width below
    try { resizer.setPointerCapture(event.pointerId); } catch { /* ignore */ }
  });

  resizer.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    // the sidebar is the rightmost column in this RTL layout, so its fixed
    // (outer) edge is the right edge - width is just the distance back to it
    const right = el("sidebar").getBoundingClientRect().right;
    const width = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, right - event.clientX));
    root.style.setProperty("--sidebar-width", `${width}px`);
  });

  const stop = (event) => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("active");
    try { resizer.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
    const width = parseInt(getComputedStyle(root).getPropertyValue("--sidebar-width"), 10);
    if (width) localStorage.setItem(SIDEBAR_WIDTH_KEY, width);
  };
  resizer.addEventListener("pointerup", stop);
  resizer.addEventListener("pointercancel", stop);
}

const SIDEBAR_COLLAPSED_KEY = "oc-sidebar-collapsed";

function wireSidebarToggle() {
  const button = el("sidebarToggle");
  const main = document.querySelector("main");

  const apply = (collapsed) => {
    main.classList.toggle("sidebar-collapsed", collapsed);
    button.textContent = collapsed ? "›" : "‹";
    button.title = collapsed ? "הצג את תפריט הסימנים" : "הסתר את תפריט הסימנים";
  };

  apply(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");

  button.onclick = () => {
    const collapsed = !main.classList.contains("sidebar-collapsed");
    apply(collapsed);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  };
}

// a pasted link, or the back button, should reconstruct the view
window.addEventListener("hashchange", () => {
  if (location.hash !== selfWrite) applyUrl();
});

wireResizer();
wireSidebarToggle();
wire();
load();
