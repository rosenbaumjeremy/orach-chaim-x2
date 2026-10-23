"use strict";

/* "Send on WhatsApp": a button beside PDF / Print (/ Email). It asks which
   sections to send in the same dialog as the PDF (pdf.js, window.pdfChoose),
   writes those sections out as a WhatsApp message (headings in *bold*), adds a
   link to this exact view (the address, with the view in its #hash), and opens
   WhatsApp with it; or sends the link alone. The same file is in every study
   site with pdf.js — change it in one, copy it to the others. Load it after
   pdf.js and mail.js. The message opens with the site's name (.brand h1) and the
   first printable heading on screen ([data-pdf-head]); a site can name that
   heading itself: <script src="share.js" data-head="#list h3">.
   Styles: share.css. */

(() => {
  const HEAD = document.currentScript.dataset.head;
  const AFTER_MAIL = !!document.querySelector('script[src="mail.js"]');   // the button goes after Email
  const TEXT = {
    he: { button: "וואטסאפ", title: "שליחה בוואטסאפ", ask: "אילו חלקים לשלוח?", make: "שליחה בוואטסאפ", linkOnly: "קישור בלבד",
      long: "ההודעה ארוכה מכדי לפתוח אותה ישר בוואטסאפ, אז היא הועתקה. פתחו את וואטסאפ, בחרו שיחה והדביקו.",
      failed: "ההודעה ארוכה מכדי לפתוח אותה ישר בוואטסאפ. בחרו פחות חלקים ונסו שוב.",
      open: "פתיחת וואטסאפ", close: "סגירה" },
    en: { button: "WhatsApp", title: "Send on WhatsApp", ask: "Which sections should be sent?", make: "Send on WhatsApp", linkOnly: "Link only",
      long: "The message is too long to open straight in WhatsApp, so it was copied. Open WhatsApp, pick a chat and paste.",
      failed: "The message is too long to open straight in WhatsApp. Choose fewer sections and try again.",
      open: "Open WhatsApp", close: "Close" },
  };
  const tx = () => TEXT[(document.documentElement.lang || "he").startsWith("en") ? "en" : "he"];

  // left out of the message, as they are left out of the PDF
  // (and the "text on Sefaria" links of the sources, which mean nothing without the link)
  const SKIP = "button:not(.ptext), .toolbar, .chapternav, .pdf-tools, [hidden], svg, script, style, summary .count, .cite a";
  const BLOCK = /^(P|DIV|LI|UL|OL|DETAILS|ARTICLE|SECTION|BLOCKQUOTE)$/;

  // one section as message text; drop = its optional parts the reader left out
  function write(el, drop) {
    const out = [];
    const walk = (n) => {
      if (n.nodeType === 3) { out.push(n.data.replace(/\s+/g, " ")); return; }
      if (n.nodeType !== 1 || n.matches(SKIP)) return;
      if (n.dataset.pdfDetail && drop.includes(n.dataset.pdfDetail)) return;
      if (/^(SUMMARY|H[1-4])$/.test(n.tagName)) {
        // its parts (number, question, pasuk) side by side on screen: spaces between them
        let head = [...n.childNodes].filter((c) => c.nodeType === 3 || !c.matches(SKIP))
          .map((c) => c.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
        // the section's own heading: shorter when a part is left out (as in the PDF),
        // and without the on-screen instructions after a dash
        if (n.parentElement === el)
          head = (drop.length && el.dataset.pdfShort) || head.split(" — ")[0];
        if (head) out.push(`\n*${head}*\n`);
        return;
      }
      if (n.classList.contains("era")) { out.push(` (${n.textContent.trim()})`); return; }
      // links named only by a number ("קישורים: 1 2 3"): the address itself
      if (n.tagName === "A" && /^\d+$/.test(n.textContent.trim())) { out.push(`\n${n.href}\n`); return; }
      // a card's footer line (writer, date, links), spaced apart on screen
      if (n.classList.contains("meta")) {
        out.push("\n");
        n.childNodes.forEach((c, i) => { if (i) out.push(" · "); walk(c); });
        out.push("\n");
        return;
      }
      if (n.classList.contains("pnum")) { out.push(`${n.textContent.trim()} `); return; }
      if (n.classList.contains("pline")) { n.childNodes.forEach(walk); out.push("\n"); return; }   // a pasuk a line
      const block = BLOCK.test(n.tagName) || n.classList.contains("cite");
      if (block) out.push("\n");
      n.childNodes.forEach(walk);
      if (block) out.push("\n");
    };
    walk(el);
    return out.join("").replace(/ ?\( ?\)/g, "").split("\n").map((line) => line.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // the first line: the site and what is on screen ("שופטים פרקים י״ז–י״ח")
  function title() {
    const shown = (el) => el.getClientRects().length > 0;
    const site = ((document.querySelector(".brand h1") || {}).textContent || "").trim();
    const head = HEAD ? document.querySelector(HEAD)
      : [...document.querySelectorAll("[data-pdf-head]")].filter(shown)
        .map((h) => (h.matches("h1, h2, h3, h4") ? h : h.querySelector("h1, h2, h3, h4"))).find(Boolean);
    const name = head && head.textContent.replace(/\s+/g, " ").trim();
    return `*${[site, name].filter(Boolean).join(" — ")}*`;
  }

  // "link only": the first line and the link, without any sections
  const sendLink = () => window.open(`https://wa.me/?text=${encodeURIComponent(`${title()}\n${location.href}`)}`, "_blank", "noopener");

  function send(groups, chosen) {
    const t = tx();
    const parts = [title()];
    for (const [key, els] of groups)
      if (chosen.has(key)) els.forEach((el) => parts.push(write(el, chosen.get(key))));
    parts.push(location.href);
    const text = parts.filter(Boolean).join("\n\n");
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (url.length <= MAX_URL) { window.open(url, "_blank", "noopener"); return; }
    // too long for the link: the phone's share sheet (WhatsApp is in it), else copy and paste
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      navigator.share({ text }).catch(() => {});
      return;
    }
    const copied = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject();
    copied.then(() => tell(t.long, true), () => tell(t.failed, false));
  }

  // wa.me sends the text on to api.whatsapp.com, which refuses addresses much
  // past 60,000 characters (checked 2026-10-23: 62,522 fine, 100,016 "400");
  // a Hebrew letter with nikud is ~6 of them
  const MAX_URL = 55000;

  function tell(message, open) {
    const t = tx();
    const dlg = document.createElement("dialog");
    dlg.className = "pdfdlg";
    dlg.dir = getComputedStyle(document.body).direction;
    const p = document.createElement("p");
    p.className = "ask";
    p.textContent = message;
    const row = document.createElement("div");
    row.className = "pdfrow";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = t.close;
    close.onclick = () => dlg.close();
    row.append(close);
    if (open) {
      const go = document.createElement("button");
      go.type = "button";
      go.className = "go";
      go.textContent = t.open;
      go.onclick = () => { window.open("https://wa.me/", "_blank", "noopener"); dlg.close(); };
      row.append(go);
    }
    dlg.append(p, row);
    document.body.append(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    dlg.showModal();
  }

  const ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.2a6.7 6.7 0 0 0-5.8 10.1L1.2 14.8l3.6-.9A6.7 6.7 0 1 0 8 1.2zm0 12.2a5.5 5.5 0 0 1-2.9-.8l-.2-.1-2.1.6.6-2.1-.1-.2A5.5 5.5 0 1 1 8 13.4zm3-4.1c-.2-.1-1-.5-1.1-.5s-.3-.1-.4.1l-.5.6c-.1.1-.2.1-.3 0-.2-.1-.7-.3-1.3-.8-.5-.4-.8-.9-.9-1.1s0-.2.1-.3l.2-.3.2-.3v-.3l-.5-1.2c-.1-.3-.3-.3-.4-.3h-.3a.6.6 0 0 0-.4.2 1.8 1.8 0 0 0-.6 1.3c0 .8.6 1.6.7 1.7s1.1 1.7 2.7 2.4c1.3.5 1.6.5 2.1.4.4 0 1-.4 1.1-.8.1-.4.1-.7.1-.8l-.3-.1z"/></svg>';

  // a button in every [data-pdf-tools] spot, after PDF / Print (pdf.js) and Email (mail.js)
  function refresh() {
    document.querySelectorAll("[data-pdf-tools]").forEach((spot) => {
      if (spot.querySelector(".sharebtn") || !spot.querySelector(AFTER_MAIL ? ".mailbtn" : ".pdfbtn")) return;
      const b = document.createElement("button");
      b.className = "sharebtn";
      b.type = "button";
      b.innerHTML = ICON + "<span></span>";
      b.onclick = () => window.pdfChoose({ ...tx(), extra: [[tx().linkOnly, sendLink]] }, send);
      spot.append(b);
    });
    document.querySelectorAll(".sharebtn").forEach((b) => {
      if (b.lastChild.textContent !== tx().button) b.lastChild.textContent = tx().button;
      b.title = tx().title;
    });
  }
  let queued = false;
  const later = () => { if (!queued) { queued = true; setTimeout(() => { queued = false; refresh(); }, 0); } };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  refresh();
})();
