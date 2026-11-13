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
  listen: "הקראה",
  stopListening: "עצור הקראה",
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
  expand: "פתח הכל",
  collapse: "סגור הכל",
};

const state = {
  data: null,
  siman: null,
  // a se'if to flash once the siman's text is on screen (from a link)
  seif: null,
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
    state.siman = state.siman === n ? null : n;
    state.seif = null;
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

/* ---------- read aloud ---------- */

// the browser's own TTS, not a cloud API: no key, no cost, no backend - the
// tradeoff is that Hebrew voice availability and quality vary a lot by OS
let speakingButton = null;

// shared by both lists below: matches the bare form with an optional single-
// letter prefix (ה/ב/ל/כ/ו/מ/ש - "השו"ע", "כאורח חיים" etc.), preserving the
// prefix in the output. Boundary checks keep a fix from also matching inside
// an unrelated longer word that happens to contain the same letters.
function applyReplacements(text, pairs) {
  let result = text;
  for (const [bare, replacement] of pairs) {
    const pattern = new RegExp(`(?<![א-ת])([הובלכמש]?)${bare}(?![א-ת])`, "g");
    result = result.replace(pattern, (match, prefix) => `${prefix}${replacement}`);
  }
  return result;
}

// the source text has no niqqud, so the voice has to guess vowels on
// ambiguous words - this fixes specific ones as they come up. Same word,
// just vowelized; for abbreviations that expand to different words, see
// ACRONYMS below.
const PRONUNCIATION = [
  ["אורח חיים", "אוֹרַח חַיִּים"], // not אוֹרֵחַ (guest) - this is "the way of life"
];

// abbreviations (written with a geresh/gershayim) that would otherwise be
// read as a made-up word instead of what they actually stand for
const ACRONYMS = [
  ["שו\"ע", "שולחן ערוך"],
];

function withPronunciation(text) {
  return applyReplacements(text, PRONUNCIATION);
}

function withAcronyms(text) {
  return applyReplacements(text, ACRONYMS);
}

// Gemara citations like "(סוכה כג.)" cite a daf by gematria letters, not a
// word - "כג" read as a syllable is wrong; it should be spelled out letter
// by letter ("kaf, gimel"). Detected as: a known tractate name, then a short
// letter-only token, ending the parenthetical - and only spelled out if that
// token is actually gematria-shaped (letters non-increasing in value), so an
// ordinary word that happens to end a citation-like parenthetical (e.g.
// "(עיין שם.)") is left alone.
const MASECHTOT = [
  "ברכות", "שבת", "עירובין", "פסחים", "שקלים", "יומא", "סוכה", "ביצה",
  "ראש השנה", "תענית", "מגילה", "מועד קטן", "חגיגה", "יבמות", "כתובות",
  "נדרים", "נזיר", "סוטה", "גיטין", "קידושין", "בבא קמא", "בבא מציעא",
  "בבא בתרא", "סנהדרין", "מכות", "שבועות", "עדיות", "עבודה זרה", "אבות",
  "הוריות", "זבחים", "מנחות", "חולין", "בכורות", "ערכין", "תמורה",
  "כריתות", "מעילה", "תמיד", "מדות", "קנים", "נדה",
];

const GEMATRIA_VALUES = {
  "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9,
  "י": 10, "כ": 20, "ל": 30, "מ": 40, "נ": 50, "ס": 60, "ע": 70, "פ": 80,
  "צ": 90, "ק": 100, "ר": 200, "ש": 300, "ת": 400,
};
const FINAL_LETTERS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const LETTER_NAMES = {
  "א": "אָלֶף", "ב": "בֵּית", "ג": "גִּימֶל", "ד": "דָּלֶת", "ה": "הֵא",
  "ו": "vav", "ז": "זַיִן", "ח": "חֵית", "ט": "טֵית", "י": "יוֹד", // Hebrew spellings of "vav" kept getting reread wrong - literal Latin text instead
  "כ": "כָּף", "ל": "לָמֶד", "מ": "מֵם", "נ": "נוּן", "ס": "סָמֶךְ",
  "ע": "עַיִן", "פ": "פֵּא", "צ": "צַדִי", "ק": "קוֹף", "ר": "רֵישׁ",
  "ש": "שִׁין", "ת": "תָּו",
};

function isGematriaLike(token) {
  const values = [...token].map((ch) => GEMATRIA_VALUES[FINAL_LETTERS[ch] || ch]);
  if (values.some((v) => v === undefined)) return false;
  return values.every((v, i) => i === 0 || v <= values[i - 1]);
}

// gematria-shaped by letter values, but genuinely common words rather than
// numerals in these contexts - "שם" (ibid.), "זה"/"זו" (this), "שני" (second,
// as in "the second paragraph") - each would otherwise get wrongly spelled
// out letter by letter instead of read normally
const NOT_A_NUMERAL_WORD = new Set(["שם", "זה", "זו", "שני"]);

function spellOut(token) {
  return [...token].map((ch) => LETTER_NAMES[FINAL_LETTERS[ch] || ch]).join(" ");
}

function isRealNumeral(token) {
  return isGematriaLike(token) && !NOT_A_NUMERAL_WORD.has(token);
}

const DAF_RE = new RegExp(`(${MASECHTOT.join("|")})\\s+([א-ת]{1,4})[.:]`, "g");
// a citation continuing "op. cit." style, with only the daf inside the
// parens and the tractate named earlier in the sentence - e.g. "בברכות (סב.)"
const BARE_DAF_RE = /\(([א-ת]{1,4})([.:])\)/g;

function withDafRefs(text) {
  return text
    .replace(DAF_RE, (match, masechet, token) =>
      isRealNumeral(token) ? `${masechet} ${spellOut(token)}` : match)
    .replace(BARE_DAF_RE, (match, token) =>
      isRealNumeral(token) ? `(${spellOut(token)})` : match);
}

// "סימן ז", "סעיף יב" - same problem as a daf citation: a gematria numeral
// misread as a word. Bounded so the token can't be the start of a longer
// word (e.g. "בסעיף זהיר..." never happens, but the same guard applies).
// A range ("סעיפים ד-ו") gets the hyphen replaced with "עד" (through) -
// "ד-ו" read as a single dashed token is just as wrong as either half alone.
const SIMAN_REF_RE =
  /(סימנים|סימן|סעיפים|סעיף)\s+([א-ת]{1,4})(?:\s*[-־–—]\s*([א-ת]{1,4}))?(?![א-ת])/g;

function withSimanRefs(text) {
  return text.replace(SIMAN_REF_RE, (match, keyword, first, second) => {
    if (!isRealNumeral(first)) return match;
    if (!second) return `${keyword} ${spellOut(first)}`;
    if (!isRealNumeral(second)) return match;
    return `${keyword} ${spellOut(first)} עַד ${spellOut(second)}`;
  });
}

function hebrewVoice() {
  if (!("speechSynthesis" in window)) return null;
  return window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("he")) || null;
}

function stopSpeaking() {
  if (!speakingButton) return;
  window.speechSynthesis.cancel();
  speakingButton.textContent = UI.listen;
  speakingButton.classList.remove("speaking");
  speakingButton = null;
}

function toggleSpeak(button, text) {
  const wasThisButton = speakingButton === button;
  stopSpeaking();
  if (wasThisButton) return; // clicking the active button just stops it

  const utterance = new SpeechSynthesisUtterance(
    withPronunciation(withAcronyms(withSimanRefs(withDafRefs(text)))));
  utterance.lang = "he-IL";
  const voice = hebrewVoice();
  if (voice) utterance.voice = voice;
  utterance.onend = utterance.onerror = () => {
    if (speakingButton === button) stopSpeaking();
  };

  window.speechSynthesis.speak(utterance);
  speakingButton = button;
  button.textContent = UI.stopListening;
  button.classList.add("speaking");
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

  if ("speechSynthesis" in window) {
    const listen = document.createElement("button");
    listen.type = "button";
    listen.className = "listen";
    listen.textContent = UI.listen;
    listen.onclick = () => toggleSpeak(listen, entry.text);
    head.appendChild(listen);
  }
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

function seifNode(runs, i) {
  const p = node("div", "seif");
  p.id = `seif-${i + 1}`;
  p.append(node("span", "num", hebrewNumber(i + 1).replace(/['"]/g, "")));
  for (const [kind, text] of runs) {
    if (kind === "rema") {
      const span = node("span", "rema");
      // "הגה" opens each of the Rema's glosses
      text.split(/(?<![א-ת])(הגה)(?![א-ת])/).forEach((part, j) => {
        if (j % 2) span.append(node("b", "haga", part));
        else span.append(...withMarks(part));
      });
      p.append(span);
    } else if (kind === "b") {
      const b = node("b");
      b.append(...withMarks(text));
      p.append(b);
    } else {
      p.append(...withMarks(text));
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
  if ("speechSynthesis" in window) {
    const bar = node("div", "postbar");
    const listen = node("button", "listen", UI.listen);
    listen.type = "button";
    listen.onclick = () => toggleSpeak(listen, entry.text);
    bar.append(listen);
    body.append(bar);
  }
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
  box.open = true;
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
    posts.forEach((entry, i) => body.append(postItem(entry, i === 0)));
  }
  box.append(body);
  return box;
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
    state.siman = to; state.seif = null;
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
  try { data = await loadSiman(n); } catch { /* shown below */ }
  if (ticket !== simanRender) return;   // the reader moved on while it loaded

  const link = node("a", null, UI.sefaria);
  link.href = sefariaUrl(n); link.target = "_blank"; link.rel = "noopener";
  if (data && data.title) meta.append(`${data.title} · `);
  meta.append(link);

  card.innerHTML = "";
  if (!data) {
    card.append(node("p", "muted", UI.failed));
    return;
  }
  data.seifim.forEach((runs, i) => card.append(seifNode(runs, i)));
  const legend = node("p", "legend");
  legend.append(node("span", "lr", UI.rema));
  if (posts.length) legend.append(node("span", "ls", UI.seifLegend));
  textCol.append(legend);

  if (state.seif) {
    const seif = state.seif;
    state.seif = null;
    requestAnimationFrame(() => flashSeifim(seif, seif));
  }
}

function hasFilter() {
  return !!(state.siman || state.themes.size || state.sources.size || state.terms.length);
}

function render() {
  // the list is about to be rebuilt, so any card currently reading aloud
  // is seconds from losing its button - stop it rather than leave it orphaned
  stopSpeaking();
  renderChips();
  renderThemes();
  renderSources();
  syncUrl();

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
