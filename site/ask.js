"use strict";
// "Ask Claude" link: opens this site's Q&A page in Claude, which answers only from this site's content
// on each visitor's own Claude account. Keeps the label and the page's language in step with the site.
(() => {
  const a = document.getElementById("asklink");
  if (!a) return;
  const set = () => {
    const he = (document.documentElement.lang || "he").startsWith("he");
    a.textContent = he ? "שאלו את Claude ↗" : "Ask Claude ↗";
    a.href = "https://claude.ai/artifact/GQNCY47FDiRyJSHudZQ9gF#" + (he ? "he" : "en");
  };
  set();
  new MutationObserver(set).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
