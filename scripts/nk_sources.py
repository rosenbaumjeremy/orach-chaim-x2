"""Gather what the nosei kelim on Sefaria say on one siman, se'if by se'if.

    python3 scripts/nk_sources.py 167            # writes /tmp/nk-167.json, prints a reading copy
    python3 scripts/nk_sources.py 167 --quiet    # just the file

Asks Sefaria for every link to "Shulchan Arukh, Orach Chayim <siman>", keeps
the ones of category "Commentary" (the nosei kelim: Mishnah Berurah, Magen
Avraham, Turei Zahav, Beur HaGra, Ba'er Hetev, Sha'arei Teshuvah, Biur
Halacha, Kaf HaChayim, Eliyah Rabbah, Levushei Serad, Be'er HaGolah ...), and
fetches each comment's text. Each comment carries the se'if it is anchored to.

The output is also what scripts/check_nk.py checks a brief against: a
source is allowed only if its ref is in this file, and its quote must be in
that ref's text.
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BOOK = "Shulchan Arukh, Orach Chayim"

# Hebrew names for the works, as the site shows them
HEBREW = {
    "Mishnah Berurah": "משנה ברורה",
    "Biur Halacha": "ביאור הלכה",
    "Magen Avraham": "מגן אברהם",
    "Turei Zahav": "טורי זהב",
    "Beur HaGra": "ביאור הגר\"א",
    "Ba'er Hetev": "באר היטב",
    "Sha'arei Teshuvah": "שערי תשובה",
    "Be'er HaGolah": "באר הגולה",
    "Kaf HaChayim": "כף החיים",
    "Eliyah Rabbah": "אליה רבה",
    "Levushei Serad": "לבושי שרד",
    "Machatzit HaShekel": "מחצית השקל",
    "Peri Megadim": "פרי מגדים",
    "Ateret Zekenim": "עטרת זקנים",
    "Eshel Avraham": "אשל אברהם",
    "Yad Ephraim": "יד אפרים",
    "Rabbi Akiva Eiger": "רבי עקיבא איגר",
    "Chatam Sofer": "חתם סופר",
    "Dagul MeRevava": "דגול מרבבה",
    "Chok Yaakov": "חק יעקב",
    "Netiv Chayim": "נתיב חיים",
    "Chokhmat Shlomo": "חכמת שלמה",
    "Pri Megadim": "פרי מגדים",
}


def fetch(url, tries=5):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "orach-chaim-x2 nosei kelim"})
            with urllib.request.urlopen(req, timeout=90) as res:
                return json.load(res)
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def api_ref(ref):
    return urllib.parse.quote(ref.replace(" ", "_"), safe="_.:,-'")


def work_of(link):
    title = link.get("collectiveTitle")
    if isinstance(title, dict):
        title = title.get("en")
    title = title or link["index_title"]
    return re.sub(r" on (Shulchan Arukh, )?Orach Chay?im$", "", title)


def seif_of(link, siman):
    for anchor in [link.get("anchorRef", "")] + list(link.get("anchorRefExpanded") or []):
        m = re.match(rf"^{re.escape(BOOK)} {siman}:(\d+)", anchor)
        if m:
            return int(m.group(1))
    return None


def section_and_index(ref):
    """'Mishnah Berurah 167:3' -> ('Mishnah Berurah 167', 3)"""
    m = re.match(r"^(.*?)[ :](\d+)(?:-\d+)?$", ref)
    return (m.group(1), int(m.group(2))) if m else (ref, None)


_sections = {}


def section_text(section):
    if section not in _sections:
        data = fetch(f"https://www.sefaria.org/api/v3/texts/{api_ref(section)}?version=hebrew")
        version = next((v for v in data.get("versions", [])
                        if v.get("actualLanguage", v.get("language")) == "he"), None)
        _sections[section] = version["text"] if version else []
    return _sections[section]


def flatten(x):
    if isinstance(x, str):
        return x
    if isinstance(x, list):
        return " ".join(flatten(y) for y in x)
    return ""


def clean(html):
    text = re.sub(r"<br\s*/?>", "\n", html)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def comment_text(ref):
    section, index = section_and_index(ref)
    if index is None:
        return clean(flatten(section_text(ref)))
    items = section_text(section)
    if isinstance(items, list) and 0 < index <= len(items):
        return clean(flatten(items[index - 1]))
    # odd structure: ask for the ref itself
    data = fetch(f"https://www.sefaria.org/api/v3/texts/{api_ref(ref)}?version=hebrew")
    version = next((v for v in data.get("versions", [])
                    if v.get("actualLanguage", v.get("language")) == "he"), None)
    return clean(flatten(version["text"])) if version else ""


def gather(siman):
    links = fetch(f"https://www.sefaria.org/api/links/{api_ref(f'{BOOK} {siman}')}?with_text=0")
    keep = {}
    for link in links:
        if link.get("category") != "Commentary":
            continue
        seif = seif_of(link, siman)
        if seif is None:
            continue
        keep.setdefault(link["ref"], {"work": work_of(link), "ref": link["ref"], "seif": seif})

    comments = list(keep.values())
    # one request per commentary section, then pick each comment out of it
    sections = sorted({section_and_index(c["ref"])[0] for c in comments})
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda s: _safe(section_text, s), sections))
    for c in comments:
        c["text"] = _safe(comment_text, c["ref"]) or ""
        c["name"] = HEBREW.get(c["work"], c["work"])
    comments = [c for c in comments if c["text"]]

    def order(c):
        nums = [int(n) for n in re.findall(r"\d+", c["ref"].split(" ")[-1])]
        return (c["seif"], c["work"], nums)
    comments.sort(key=order)
    return {"siman": siman, "comments": comments}


def _safe(fn, arg):
    try:
        return fn(arg)
    except Exception as e:
        print(f"  (could not fetch {arg}: {e})", file=sys.stderr)
        return None


def main():
    siman = int(sys.argv[1])
    data = gather(siman)
    path = f"/tmp/nk-{siman}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    works = {}
    for c in data["comments"]:
        works[c["work"]] = works.get(c["work"], 0) + 1
    print(f"siman {siman}: {len(data['comments'])} comments -> {path}")
    print("  " + ", ".join(f"{w} {n}" for w, n in sorted(works.items(), key=lambda x: -x[1])))
    if "--quiet" in sys.argv:
        return
    seif = None
    for c in data["comments"]:
        if c["seif"] != seif:
            seif = c["seif"]
            print(f"\n===== se'if {seif} =====")
        print(f"\n[{c['ref']}]\n{c['text']}")


if __name__ == "__main__":
    main()
