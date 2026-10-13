"use strict";
// Keep a copy of the site on the device so it opens without a connection (see sw.js),
// and say so at the foot of the page once the copy is saved.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.ready.then(reg => {
    if (navigator.onLine && reg.active) reg.active.postMessage("sync");
    return caches.match("index.html");
  }).then(hit => {
    if (!hit) return;
    const note = document.createElement("p");
    note.className = "offline-note";
    note.textContent = "✓ שמור במכשיר: עובד גם בלי אינטרנט · Saved on this device: works offline";
    Object.assign(note.style, { textAlign: "center", fontSize: "12px", opacity: "0.6", margin: "28px 0 12px" });
    // at the end of the page's content, or just after it when the content is a grid of panes
    const main = document.querySelector("main");
    if (main && getComputedStyle(main).display === "block") main.appendChild(note);
    else if (main) main.after(note);
    else document.body.appendChild(note);
  }).catch(() => {});
}
