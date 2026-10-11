"use strict";

/* Save the page as a PDF or print it, choosing which sections go in. The same file is in
   every study site (aliyah-yomit, tanach-summaries, mishna-yomit,
   orach-chaim-x2) — change it in one, copy it to the others.

   A site marks what can be printed:
     data-pdf="<label>"  a section; every section with the same label is one choice
     data-pdf-head       a heading that prints with the chosen sections under it
     data-pdf-detail="answers" | "explain"
                         a part inside a section that the reader may leave out
                         (the answers to the questions, the explanation of a term)
     data-pdf-short      the section's heading to print when a part is left out
                         ("שאלות" for a box headed "שאלות ותשובות")
     data-pdf-tools      where the PDF and Print buttons go (filled in here; hidden
                         while the page has nothing to print)
     data-pdf-lazy       a closed panel whose content loads on demand (counts as printable)
   and may set window.pdfPrepare = async () => [details opened], to load content
   (closed panels) before the choices are listed; those panels close again after.
   The PDF itself comes from the browser's print window ("Save as PDF").
   Its styles are in pdf.css (a real file: the sites' Content-Security-Policy
   allows only style-src 'self', so a <style> added from here is ignored). */

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
      printButton: "הדפסה",
      printTitle: "הדפסה",
      printAsk: "אילו חלקים להדפיס?",
      printMake: "הדפס",
      empty: "אין בעמוד הזה תוכן לשמירה. פתחו פרק, עלייה או סימן ונסו שוב.",
      loading: "טוען…",
      details: { answers: "תשובות", explain: "הסברי המושגים" },
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
      printButton: "Print",
      printTitle: "Print",
      printAsk: "Which sections should be printed?",
      printMake: "Print",
      empty: "There is nothing to save on this page yet. Open a perek, aliyah or siman and try again.",
      loading: "Loading…",
      details: { answers: "Answers", explain: "Explanations of the terms" },
    },
  };
  const tx = () => TEXT[(document.documentElement.lang || "he").startsWith("en") ? "en" : "he"];


  const opened = [];   // <details> opened for the PDF, closed again afterwards
  const marked = [];   // elements given pdf-* classes
  const retitled = []; // [text node, its own text] for headings shortened in the PDF
  let savedTitle = null;

  function cleanup() {
    document.documentElement.classList.remove("pdf-mode");
    marked.splice(0).forEach((el) => el.classList.remove("pdf-keep", "pdf-path", "pdf-drop"));
    opened.splice(0).forEach((d) => { d.open = false; });
    retitled.splice(0).forEach(([text, was]) => { text.data = was; });
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

  // the optional parts found inside a group of sections, e.g. ["answers"]
  const detailsOf = (els) => [...new Set(els.flatMap((el) =>
    [...el.querySelectorAll("[data-pdf-detail]")].map((d) => d.dataset.pdfDetail)))];

  // chosen: section label -> the optional parts to leave out of it
  function print(groups, chosen) {
    const keep = [];
    const mark = (el, cls) => { el.classList.add(cls); marked.push(el); };
    for (const [key, els] of groups) {
      if (!chosen.has(key)) continue;
      keep.push(...els);
      for (const part of chosen.get(key))
        els.forEach((el) => el.querySelectorAll(`[data-pdf-detail="${part}"]`).forEach((d) => mark(d, "pdf-drop")));
      // a part was left out: print the shorter heading if the section has one
      if (chosen.get(key).length) els.forEach((el) => {
        const summary = el.querySelector(":scope > summary");
        const text = summary && [...summary.childNodes].find((n) => n.nodeType === 3 && n.data.trim());
        if (el.dataset.pdfShort && text) { retitled.push([text, text.data]); text.data = el.dataset.pdfShort; }
      });
    }
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

    // the file name the browser suggests: site — first headings of the page
    savedTitle = document.title;
    const site = (document.querySelector(".brand h1") || {}).textContent || "";
    const heads = [...document.querySelectorAll("[data-pdf-head].pdf-keep")]
      .map((h) => (h.querySelector("h1, h2, h3, h4") || h).textContent.trim().replace(/\s+/g, " "))
      .filter(Boolean).slice(0, 2);
    if (!heads.length) heads.push(...chosen.keys());
    document.title = [site.trim(), ...heads.slice(0, 2)].filter(Boolean).join(" — ").slice(0, 120);

    document.documentElement.classList.add("pdf-mode");
    // straight from the click: Safari on iPhone/iPad only prints from a tap
    window.print();
  }

  // mode "pdf" or "print": the same choice of sections, worded for each
  async function choose(mode) {
    const all = tx();
    const t = mode === "print"
      ? { ...all, title: all.printTitle, ask: all.printAsk, make: all.printMake, hint: "" }
      : all;
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
    const subs = new Map();   // section label -> [[part, its checkbox]]
    const checkbox = (text, cls) => {
      const label = document.createElement("label");
      if (cls) label.className = cls;
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = true;
      label.append(box, text);
      list.append(label);
      return box;
    };
    for (const [key, els] of groups) {
      const box = checkbox(key);
      box.value = key;
      boxes.push(box);
      const parts = detailsOf(els).filter((part) => t.details[part])
        .map((part) => [part, checkbox(t.details[part], "sub")]);
      subs.set(key, parts);
      // an option belongs to its section: greyed out while the section is not chosen
      const dim = () => parts.forEach(([, b]) => {
        b.disabled = !box.checked;
        b.parentElement.classList.toggle("off", !box.checked);
      });
      box.addEventListener("change", dim);
      box.dim = dim;
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
      b.onclick = () => {
        boxes.forEach((x) => { x.checked = on; });
        subs.forEach((parts) => parts.forEach(([, x]) => { x.checked = on; }));
        boxes.forEach((x) => x.dim());
        sync();
      };
      sel.append(b);
    }
    const hint = document.createElement("p");
    hint.textContent = t.hint;
    hint.hidden = !t.hint;

    go.onclick = () => {
      const chosen = new Map(boxes.filter((b) => b.checked).map((b) =>
        [b.value, subs.get(b.value).filter(([, sub]) => !sub.checked).map(([part]) => part)]));
      document.documentElement.classList.add("pdf-mode"); // keep opened panels until printing ends
      dlg.close();
      print(groups, chosen);
    };
    row.append(cancel, go);
    dlg.append(sel, list, hint, row);
  }

  const ICONS = {
    pdf: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5.5L13 5v9.5H4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.5 1.5V5H13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    print: '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M4.5 6V1.5h7V6"/><rect x="1.5" y="6" width="13" height="5.5" rx="1.2"/><path d="M4.5 9.5h7v5h-7z"/></g></svg>',
  };

  const LABELS = { pdf: ["button", "title"], print: ["printButton", "printTitle"] };

  function button(mode) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pdfbtn";
    b.dataset.mode = mode;
    b.innerHTML = ICONS[mode] + "<span></span>";
    b.onclick = () => choose(mode);
    return b;
  }

  // fill every [data-pdf-tools] spot with the two buttons, label them in the
  // page's language, and show them only when there is something to print
  function refresh() {
    const printable = !!document.querySelector("[data-pdf], [data-pdf-lazy]");
    document.querySelectorAll("[data-pdf-tools]").forEach((spot) => {
      if (!spot.querySelector(".pdfbtn")) spot.append(button("pdf"), button("print"));
      spot.classList.add("pdf-tools");
      spot.hidden = !printable;
    });
    document.querySelectorAll(".pdfbtn").forEach((b) => {
      const [label, title] = LABELS[b.dataset.mode];
      if (b.lastChild.textContent !== tx()[label]) b.lastChild.textContent = tx()[label];
      b.title = tx()[title];
    });
  }
  let queued = false;
  const later = () => { if (!queued) { queued = true; setTimeout(() => { queued = false; refresh(); }, 0); } };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  refresh();
})();
