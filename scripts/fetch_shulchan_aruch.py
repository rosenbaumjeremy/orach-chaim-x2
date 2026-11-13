"""Put the text of every siman of Shulchan Aruch Orach Chaim on the site.

    python3 scripts/fetch_shulchan_aruch.py          # only simanim not yet fetched
    python3 scripts/fetch_shulchan_aruch.py --all    # fetch everything again

Fetches each siman's Hebrew text (Mechaber with the Rema's hagahot) from
Sefaria and writes site/data/sa/<siman>.json:

    {"siman": 1, "ref": "Shulchan Arukh, Orach Chayim 1",
     "title": "דין השכמת הבוקר. ובו ט סעיפים",
     "seifim": [[["sa", "יתגבר כארי..."], ["rema", "הגה ועכ\"פ..."]], ...]}

Each se'if is a list of runs, so the site never has to trust Sefaria's HTML:
"sa" is the Mechaber, "rema" the Rema's hagah (Sefaria's <small>), "b" a
bolded heading inside a se'if. The empty commentary markers Sefaria puts in
the text (<i data-commentator=...></i>) are dropped. A tag we have not seen
before fails the siman loudly rather than leaking into the page.
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "sa"
BOOK = "Shulchan Arukh, Orach Chayim"
SIMANIM = 697

COMMENTARY_MARK = re.compile(r"<i\b[^>]*>\s*</i>")
TOKEN = re.compile(r"<(/?)(\w+)[^>]*>|([^<]+)")


def fetch(url, tries=4):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "orach-chaim-x2 site builder"})
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.load(res)
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def runs(html):
    """Sefaria's HTML for one se'if -> [[kind, text], ...]."""
    html = COMMENTARY_MARK.sub("", html)
    out, stack = [], []
    for closing, tag, text in TOKEN.findall(html):
        if text:
            text = text.replace("&nbsp;", " ")
            kind = "rema" if "small" in stack else "b" if "b" in stack else "sa"
            if out and out[-1][0] == kind:
                out[-1][1] += text
            else:
                out.append([kind, text])
            continue
        tag = tag.lower()
        if tag == "br":
            if out:
                out[-1][1] += "\n"
            continue
        if tag not in ("small", "b", "i", "big", "span"):
            raise ValueError(f"unexpected tag <{tag}>")
        if tag in ("i", "span", "big"):
            continue  # formatting we don't carry over; its text is kept
        if closing:
            if tag in stack:
                stack.remove(tag)
        else:
            stack.append(tag)
    # tidy whitespace at the run edges, drop runs that were only space
    cleaned = []
    for kind, text in out:
        text = re.sub(r"[ \t]+", " ", text)
        if text.strip():
            cleaned.append([kind, text])
    if cleaned:
        cleaned[0][1] = cleaned[0][1].lstrip()
        cleaned[-1][1] = cleaned[-1][1].rstrip()
    return cleaned


def siman_record(n):
    ref = f"{BOOK} {n}"
    data = fetch("https://www.sefaria.org/api/v3/texts/"
                 + urllib.parse.quote(ref.replace(" ", "_"), safe="_.:,-")
                 + "?version=hebrew")
    version = next(v for v in data["versions"]
                   if v.get("actualLanguage", v.get("language")) == "he")
    seifim = [runs(s) for s in version["text"] if isinstance(s, str) and s.strip()]
    if not seifim:
        raise ValueError("no text")

    # se'if 1 opens with the siman's own heading in bold: "דין ... ובו ט סעיפים:"
    title = ""
    first = seifim[0]
    if first and first[0][0] == "b" and "\n" in first[0][1]:
        title = first[0][1].strip().rstrip(":").strip()
        first.pop(0)
        if first:
            first[0][1] = first[0][1].lstrip()
    return {"siman": n, "ref": ref, "title": title, "seifim": seifim}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    redo = "--all" in sys.argv
    todo = [n for n in range(1, SIMANIM + 1) if redo or not (OUT / f"{n}.json").exists()]
    print(f"{len(todo)} simanim to fetch")

    def one(n):
        try:
            record = siman_record(n)
        except Exception as e:  # report and carry on; a re-run picks it up
            return f"FAILED siman {n}: {e}"
        (OUT / f"{n}.json").write_text(
            json.dumps(record, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        return None

    with ThreadPoolExecutor(max_workers=4) as pool:
        failures = [r for r in pool.map(one, todo) if r]
    for f in failures:
        print(f)
    print(f"fetched {len(todo) - len(failures)}, failed {len(failures)}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
