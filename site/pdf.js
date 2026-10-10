"use strict";

/* Save the page as a PDF, choosing which sections go in. The same file is in
   every study site (aliyah-yomit, tanach-summaries, mishna-yomit,
   orach-chaim-x2) — change it in one, copy it to the others.

   A site marks what can be printed:
     data-pdf="<label>"  a section; every section with the same label is one choice
     data-pdf-head       a heading that prints with the chosen sections under it
   and may set window.pdfPrepare = async () => [details opened], to load content
   (closed panels) before the choices are listed; those panels close again after.
   The PDF itself comes from the browser's print window ("Save as PDF"). */

(() => {
  const TEXT = {
    he: {
      button: "PDF",
      title: "שמירה כ-PDF",
      ask: "אילו חלקים לכלול ב-PDF?",
      all: "בחר הכל",
      none: "נקה הכל",
      make: "צור PDF",
      cancel: "ביטול",
      hint: "בחלון ההדפסה שייפתח בחרו ביעד \"שמירה כ-PDF\".",
      empty: "אין בעמוד הזה תוכן לשמירה. פתחו פרק, עלייה או סימן ונסו שוב.",
      loading: "טוען…",
    },
    en: {
      button: "PDF",
      title: "Save as PDF",
      ask: "Which sections should the PDF include?",
      all: "Select all",
      none: "Clear all",
      make: "Create PDF",
      cancel: "Cancel",
      hint: "In the print window that opens, choose \"Save as PDF\" as the destination.",
      empty: "There is nothing to save on this page yet. Open a perek, aliyah or siman and try again.",
      loading: "Loading…",
    },
  };
  const tx = () => TEXT[(document.documentElement.lang || "he").startsWith("en") ? "en" : "he"];

  const style = document.createElement("style");
  style.textContent = `
.pdfbtn {
  display: inline-flex; align-items: center; gap: 5px; flex: none;
  border: 1px solid var(--line); background: var(--card); color: var(--accent);
  border-radius: var(--radius, 8px); padding: 5px 10px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.pdfbtn:hover { border-color: var(--accent); }
.pdfbtn svg { width: 15px; height: 15px; }
dialog.pdfdlg {
  border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; width: min(440px, calc(100vw - 32px));
  background: var(--card); color: var(--ink); box-shadow: 0 12px 40px rgba(0, 0, 0, .25);
}
dialog.pdfdlg::backdrop { background: rgba(10, 20, 40, .35); }
.pdfdlg h2 { margin: 0 0 4px; font-size: 18px; color: var(--accent); }
.pdfdlg p { margin: 0 0 10px; font-size: 14px; color: var(--muted); }
.pdfdlg .pdflist { max-height: 50vh; overflow: auto; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; margin-bottom: 10px; }
.pdfdlg label { display: flex; gap: 8px; align-items: baseline; padding: 5px 0; font-size: 15px; cursor: pointer; }
.pdfdlg input { accent-color: var(--accent); }
.pdfdlg .pdfrow { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.pdfdlg .pdfsel { justify-content: flex-start; margin-bottom: 8px; }
.pdfdlg button { border: 1px solid var(--line); background: var(--bg); color: var(--ink); border-radius: 6px; padding: 6px 14px; font: inherit; font-size: 14px; cursor: pointer; }
.pdfdlg .pdfsel button { padding: 2px 9px; font-size: 12.5px; color: var(--muted); }
.pdfdlg button.go { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.pdfdlg button.go:disabled { opacity: .5; cursor: default; }
.pdf-header { display: none; }

@media print {
  html.pdf-mode {
    --bg: #fff; --card: #fff; --ink: #1e1c1a; --muted: #5f5b55; --line: #d9d4ca;
    --accent: #16305c; --accent-soft: #e8edf6; --gold-soft: #f6efe0;
    background: #fff !important;
  }
  html.pdf-mode body { background: #fff !important; }
  html.pdf-mode * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* only the chosen sections, their headings, and what contains them */
  html.pdf-mode body *:not(.pdf-path):not(.pdf-keep):not(.pdf-keep *) { display: none !important; }
  html.pdf-mode .pdf-path { display: block !important; position: static !important; overflow: visible !important;
    max-height: none !important; height: auto !important; box-shadow: none !important; }
  html.pdf-mode main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
  html.pdf-mode .pdf-keep { position: static !important; overflow: visible !important; max-height: none !important; }
  html.pdf-mode .pdf-keep :is(.toolbar, .listen, .more, button.ghost) { display: none !important; }
  html.pdf-mode .pdf-keep .body.collapsed { display: block !important; -webkit-line-clamp: unset !important; overflow: visible !important; }
  html.pdf-mode :is(details.qitem, details.item, .card, .cite, .answer) { break-inside: avoid; }
  html.pdf-mode .pdf-header { display: flex !important; align-items: center; gap: 12px; margin: 0 0 14px;
    padding-bottom: 10px; border-bottom: 2px solid var(--gold, #b8924a); }
  html.pdf-mode .pdf-header .mark { width: 44px; height: 44px; }
  html.pdf-mode .pdf-header h1 { margin: 0; font-size: 20px; color: var(--accent); }
  html.pdf-mode .pdf-header p { margin: 0; font-size: 13px; color: var(--muted); }
}`;
  document.head.appendChild(style);

  const opened = [];   // <details> opened for the PDF, closed again afterwards
  const marked = [];   // elements given pdf-* classes
  let savedTitle = null;

  function cleanup() {
    document.documentElement.classList.remove("pdf-mode");
    marked.splice(0).forEach((el) => el.classList.remove("pdf-keep", "pdf-path"));
    opened.splice(0).forEach((d) => { d.open = false; });
    document.querySelectorAll(".pdf-header").forEach((h) => h.remove());
    if (savedTitle != null) { document.title = savedTitle; savedTitle = null; }
  }
  window.addEventListener("afterprint", cleanup);

  const visible = (el) => el.getClientRects().length > 0;

  function sections() {
    const groups = new Map();
    document.querySelectorAll("[data-pdf]").forEach((el) => {
      if (!visible(el)) return;
      const key = el.dataset.pdf;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
    });
    return groups;
  }

  function open(d) {
    if (d.tagName === "DETAILS" && !d.open) { d.open = true; opened.push(d); }
  }

  function print(groups, chosen) {
    const keep = [];
    for (const [key, els] of groups) if (chosen.has(key)) keep.push(...els);
    const mark = (el, cls) => { el.classList.add(cls); marked.push(el); };
    for (const el of keep) {
      mark(el, "pdf-keep");
      open(el);
      el.querySelectorAll("details").forEach(open);
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (!p.classList.contains("pdf-path")) mark(p, "pdf-path");
        open(p);
      }
    }
    document.querySelectorAll("[data-pdf-head]").forEach((h) => {
      if (h.parentElement && h.parentElement.classList.contains("pdf-path")) mark(h, "pdf-keep");
    });

    // the site's name and logo at the top of the first page
    const brand = document.querySelector(".brand");
    if (brand) {
      const head = document.createElement("div");
      head.className = "pdf-header pdf-keep";
      head.append(...[...brand.cloneNode(true).childNodes]);
      document.body.prepend(head);
    }

    // the file name the browser suggests: site — first headings of the page
    savedTitle = document.title;
    const site = (document.querySelector(".brand h1") || {}).textContent || "";
    const heads = [...document.querySelectorAll("[data-pdf-head].pdf-keep")]
      .map((h) => (h.querySelector("h1, h2, h3, h4") || h).textContent.trim().replace(/\s+/g, " "))
      .filter(Boolean).slice(0, 2);
    if (!heads.length) heads.push(...chosen);
    document.title = [site.trim(), ...heads.slice(0, 2)].filter(Boolean).join(" — ").slice(0, 120);

    document.documentElement.classList.add("pdf-mode");
    setTimeout(() => window.print(), 60);
  }

  async function choose() {
    const t = tx();
    const dlg = document.createElement("dialog");
    dlg.className = "pdfdlg";
    dlg.dir = getComputedStyle(document.body).direction;
    dlg.innerHTML = `<h2></h2><p class="ask"></p>`;
    dlg.querySelector("h2").textContent = t.title;
    dlg.querySelector(".ask").textContent = t.loading;
    document.body.appendChild(dlg);
    dlg.addEventListener("close", () => { dlg.remove(); if (!document.documentElement.classList.contains("pdf-mode")) cleanup(); });
    dlg.showModal();

    if (typeof window.pdfPrepare === "function") {
      try { (await window.pdfPrepare() || []).forEach((d) => opened.push(d)); } catch {}
    }
    const groups = sections();
    const ask = dlg.querySelector(".ask");
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = t.cancel;
    cancel.onclick = () => dlg.close();
    const row = document.createElement("div");
    row.className = "pdfrow";

    if (!groups.size) {
      ask.textContent = t.empty;
      row.append(cancel);
      dlg.append(row);
      return;
    }
    ask.textContent = t.ask;

    const list = document.createElement("div");
    list.className = "pdflist";
    const boxes = [];
    for (const key of groups.keys()) {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = true;
      box.value = key;
      boxes.push(box);
      label.append(box, key);
      list.append(label);
    }
    const go = document.createElement("button");
    go.type = "button";
    go.className = "go";
    go.textContent = t.make;
    const sync = () => { go.disabled = !boxes.some((b) => b.checked); };
    boxes.forEach((b) => b.addEventListener("change", sync));

    const sel = document.createElement("div");
    sel.className = "pdfrow pdfsel";
    for (const [text, on] of [[t.all, true], [t.none, false]]) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.onclick = () => { boxes.forEach((x) => { x.checked = on; }); sync(); };
      sel.append(b);
    }
    const hint = document.createElement("p");
    hint.textContent = t.hint;

    go.onclick = () => {
      const chosen = new Set(boxes.filter((b) => b.checked).map((b) => b.value));
      document.documentElement.classList.add("pdf-mode"); // keep opened panels until printing ends
      dlg.close();
      print(groups, chosen);
    };
    row.append(cancel, go);
    dlg.append(sel, list, hint, row);
  }

  function addButton() {
    const nav = document.querySelector(".sitelinks");
    if (!nav || document.querySelector(".pdfbtn")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pdfbtn";
    b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5.5L13 5v9.5H4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.5 1.5V5H13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg><span></span>';
    const paint = () => { b.lastChild.textContent = tx().button; b.title = tx().title; };
    paint();
    new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    b.onclick = choose;
    nav.prepend(b);
  }
  addButton();
})();
