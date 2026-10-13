"use strict";
// Keep a copy of the site on the device so it opens without a connection (see sw.js).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.ready.then(reg => {
    if (navigator.onLine && reg.active) reg.active.postMessage("sync");
  }).catch(() => {});
}
