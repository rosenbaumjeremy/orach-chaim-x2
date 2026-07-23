"""Extract the poskim, gemara, and modern rabbis each post cites.

Two kinds:
  classical - רש"י, רמב"ם, משנה ברורה, גמרא ... a fixed, well-known set of
              halachic sources
  modern    - introduced by a title: הרב עזרא ביק, הרב שמואל אריאל ...

The modern names are the awkward ones. A title is followed by anywhere from
one to three words, and there is no way to tell "הרב עזרא ביק מסביר"
(name + verb) from "הרב יוסף צבי רימון" (a three-word name) by shape alone.
So the corpus decides: a word sequence is treated as a name only if it
recurs across several posts. Verbs trailing a name do not recur; the name
does. (Same approach as tanach-site's extract_sources.py.)

Writes data/sources.json. No API calls.

Usage: python extract_sources.py
"""

import json
import re
import sys
import io
from collections import Counter
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
DATA = Path(__file__).resolve().parent.parent / "data"

# a sequence must appear in at least this many posts to count as a name
MIN_MENTIONS = 3

CLASSICAL = [
    (r'רש"?[יי]\b', 'רש"י'),
    (r"תוספות|תוס'", "תוספות"),
    (r'רמב"ם', 'רמב"ם'),
    (r'רמב"ן', 'רמב"ן'),
    (r'רשב"א', 'רשב"א'),
    (r'ריטב"א', 'ריטב"א'),
    (r'ר"ן\b', 'ר"ן'),
    (r'רי"ף', 'רי"ף'),
    (r'הרא"ש', 'רא"ש'),
    (r"מאירי", "מאירי"),
    (r"רבינו תם", "רבינו תם"),
    (r"הגהות מיימוניות", "הגהות מיימוניות"),
    (r"מרדכי", "מרדכי"),
    (r"(?:^|\s)הטור\b|\bהטור\b", "טור"),
    (r"בית יוסף", "בית יוסף"),
    (r'הרמ"א|\bרמ"א', 'רמ"א'),
    (r"מגן אברהם", "מגן אברהם"),
    (r'ט"ז\b', 'ט"ז'),
    (r"משנה ברורה", "משנה ברורה"),
    (r"ביאור הלכה", "ביאור הלכה"),
    (r"שער הציון", "שער הציון"),
    (r"ערוך השולחן", "ערוך השולחן"),
    (r"כף החיים", "כף החיים"),
    (r"בן איש חי", "בן איש חי"),
    (r"חיי אדם", "חיי אדם"),
    (r"חזון איש", "חזון איש"),
    (r"פרי מגדים", "פרי מגדים"),
    (r"הלבוש|\bלבוש\b", "לבוש"),
    (r"ירושלמי", "ירושלמי"),
    (r'הגאונים|הגאון\b', "גאונים"),
    (r'חז"ל', 'חז"ל'),
    (r"הגמרא|התלמוד", "גמרא"),
    (r"המשנה\b", "משנה"),
]

# up to three words after a title; the frequency pass trims what is not a name
TITLED = re.compile(
    r"(?:הרב|הרבנית|פרופ'|ד\"ר|מו\"ר)\s+((?:[א-ת][א-ת'\"]*)(?:\s+[א-ת][א-ת'\"]*){0,2})"
)

# words that follow a name often enough to survive the frequency test on
# their own ("הרב מדן פוסק" recurs), so they have to be named and trimmed -
# extends tanach-site's list with halachic-ruling verbs
STOPWORDS = {
    "מסביר", "מציע", "מדגיש", "כותב", "מבאר", "טוען", "מציין", "מראה",
    "מסכם", "מבחין", "עומד", "קורא", "מפרש", "מלמד", "מעיר", "דן",
    "עמד", "הציע", "כתב", "הסביר", "מתאר", "שואל", "משיב", "אמר",
    "סבור", "גורס", "מנתח", "עוסק", "הראה", "ציין", "מזכיר", "מוסיף",
    "במאמרו", "בספרו", "בשיעורו", "בפירושו", "שליט", "זצ",
    "עונה", "מונה", "מנין", "הביא", "מביא", "העיר", "חולק", "משווה",
    "פוסק", "פוסקים", "מכריע", "מתיר", "אוסר", "מחמיר", "מקל",
    "מסתפק", "סובר", "סוברים", "דוחה", "מקבל", "מחלק",
}


def trim(name):
    """Cut at the first non-name word - see tanach-site's extract_sources.py
    for why trailing-only trimming isn't enough."""
    words = []
    for word in name.split():
        if word in STOPWORDS:
            break
        words.append(word)
    return " ".join(words)


def prefixes(name):
    words = name.split()
    return [" ".join(words[:n]) for n in range(1, len(words) + 1)]


def build_name_vocabulary(candidates):
    counts = Counter()
    for name in candidates:
        for prefix in prefixes(name):
            counts[prefix] += 1
    return {p for p, n in counts.items() if n >= MIN_MENTIONS}


def canonical(name, vocabulary):
    best = None
    for prefix in prefixes(name):
        if prefix in vocabulary:
            best = prefix
    return best


def merge_short_forms(names):
    """'ביק' -> 'עזרא ביק' when exactly one longer name contains it as a word."""
    full = [n for n in names if " " in n]
    mapping, dropped = {}, []
    for name in names:
        if " " in name:
            continue
        matches = [f for f in full if name in f.split()]
        if len(matches) == 1:
            mapping[name] = matches[0]
        elif len(matches) > 1:
            mapping[name] = None
            dropped.append(name)
    return mapping, dropped


def extract():
    entries = json.loads((DATA / "oc.json").read_text(encoding="utf-8"))
    summaries = [e for e in entries if e["type"] == "summary"]

    raw = [[trim(n) for n in TITLED.findall(e["text"])] for e in summaries]
    vocabulary = build_name_vocabulary([n for hits in raw for n in hits if n])

    per_entry = []
    for hits in raw:
        names = {canonical(n, vocabulary) for n in hits if n}
        per_entry.append({n for n in names if n})

    aliases, dropped = merge_short_forms({n for names in per_entry for n in names})
    per_entry = [{aliases.get(n, n) for n in names} - {None} for names in per_entry]

    result, counts = {}, Counter()
    for index, (entry, modern) in enumerate(zip(summaries, per_entry)):
        found = [{"name": n, "kind": "modern"} for n in sorted(modern)]
        for pattern_text, label in CLASSICAL:
            if re.search(pattern_text, entry["text"]):
                found.append({"name": label, "kind": "classical"})
        if found:
            result[str(index)] = found
        for source in found:
            counts[(source["name"], source["kind"])] += 1

    (DATA / "sources.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"===== {len(result)} of {len(summaries)} posts cite someone =====")
    for kind in ("classical", "modern"):
        top = [(n, c) for (n, k), c in counts.most_common() if k == kind][:20]
        print(f"\n  {kind}:")
        for name, count in top:
            print(f"    {count:4d}  {name}")
    merged = {k: v for k, v in aliases.items() if v}
    if merged:
        print("\n  merged short forms: "
              + ", ".join(f"{k}->{v}" for k, v in list(merged.items())[:8]))
    if dropped:
        print(f"  dropped as ambiguous: {', '.join(dropped)}")


if __name__ == "__main__":
    extract()
