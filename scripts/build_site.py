"""Merge cleaned posts, tags, and sources into one payload for the site.

Writes site/data/oc.json - everything the page needs in a single fetch. Tags
are optional: if the tagging batch hasn't been fetched yet the site still
works, just without the theme filter.

Usage: python build_site.py
"""

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "site" / "data"

MAX_SIMAN = 697

# The 29 canonical Orach Chaim sections, as siman ranges (start, end
# inclusive). This is the standard division used in printed editions -
# supplied directly rather than inferred, since there's no way to derive it
# reliably from the data itself.
SECTIONS = [
    ("הלכות הנהגת האדם בבוקר", 1, 7),
    ("הלכות ציצית", 8, 24),
    ("הלכות תפילין", 25, 45),
    ("הלכות ברכות השחר ושאר ברכות", 46, 57),
    ("הלכות קריאת שמע", 58, 88),
    ("הלכות תפילה", 89, 126),
    ("הלכות נשיאת כפים", 127, 135),
    ("הלכות קריאת התורה", 136, 149),
    ("הלכות בית הכנסת", 150, 156),
    ("הלכות נטילת ידים", 157, 165),
    ("הלכות סעודה", 166, 201),
    ("הלכות ברכת הפירות", 202, 214),
    ("הלכות שאר ברכות", 215, 241),
    ("הלכות שבת", 242, 344),
    ("הלכות עירובין", 345, 395),
    ("הלכות תחומין", 396, 407),
    ("הלכות עירובי תחומין", 408, 416),
    ("הלכות ראש חודש", 417, 428),
    ("הלכות פסח", 429, 494),
    ("הלכות יום טוב", 495, 529),
    ("הלכות חול המועד", 530, 548),
    ("הלכות תשעה באב", 549, 561),
    ("הלכות תענית", 562, 580),
    ("הלכות ראש השנה", 581, 603),
    ("הלכות יום הכיפורים", 604, 624),
    ("הלכות סוכה", 625, 644),
    ("הלכות לולב", 645, 669),
    ("הלכות חנוכה", 670, 685),
    ("הלכות מגילה", 686, 697),
]

WRITER_LABELS = {"A": "כותב א", "B": "כותב ב", "C": "כותב ג", "D": "כותב ד"}


def load(name):
    path = DATA / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def build():
    entries = load("oc.json")
    tags = load("tags.json") or {}
    sources = load("sources.json") or {}
    vocabulary = load("themes.json")

    summaries = [e for e in entries if e["type"] == "summary"]

    # the daily resource-link post shares a date with the summary it supports
    links_by_date = defaultdict(list)
    for entry in entries:
        if entry["type"] == "resources":
            links_by_date[entry["date"]].extend(entry["links"])

    theme_label = {}
    themes = []
    if vocabulary:
        for category, group in vocabulary["categories"].items():
            for theme in group:
                theme_label[theme["slug"]] = theme["label"]
                themes.append({**theme, "category": category})

    records = []
    writer_counts, theme_counts = defaultdict(int), defaultdict(int)
    source_counts, source_kind = defaultdict(int), {}
    for index, entry in enumerate(summaries):
        tag = tags.get(str(index), {})
        cited = sources.get(str(index), [])
        for source in cited:
            source_counts[source["name"]] += 1
            source_kind[source["name"]] = source["kind"]
        # a theme dropped from the vocabulary after tagging should not break the page
        applied = [t for t in tag.get("themes", []) if t in theme_label]
        for slug in applied:
            theme_counts[slug] += 1
        writer_counts[entry["writer"]] += 1

        # the first line is the bolded header, already shown as the card title
        body = entry["text"].split("\n", 1)
        body = body[1].lstrip() if len(body) > 1 and entry["header"] in body[0] else entry["text"]

        records.append({
            "id": index,
            "simanim": entry["simanim"],
            "title": entry["title"],
            "header": entry["header"],
            "text": body,
            "date": entry["date"],
            "writer": entry.get("writer"),
            "themes": applied,
            "sources": [s["name"] for s in cited],
            "links": links_by_date.get(entry["date"], [])[:8],
        })

    covered = defaultdict(set)
    for record in records:
        for siman in record["simanim"]:
            covered[siman].add(record["id"])

    sections = []
    for name, start, end in SECTIONS:
        have = sorted(s for s in covered if start <= s <= end)
        if have:
            sections.append({"name": name, "start": start, "end": end, "covered": have})

    payload = {
        "dir": "rtl",
        "max_siman": MAX_SIMAN,
        "sections": sections,
        "themes": [t for t in themes if theme_counts[t["slug"]]],
        "writers": sorted(
            ({"letter": w, "label": WRITER_LABELS.get(w, w), "count": c}
             for w, c in writer_counts.items() if w),
            key=lambda w: -w["count"],
        ),
        "sources": sorted(
            ({"name": n, "count": c, "kind": source_kind[n]}
             for n, c in source_counts.items()),
            key=lambda s: (s["kind"] != "classical", -s["count"], s["name"]),
        ),
        "entries": records,
        "tagged": bool(tags),
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "oc.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    size = (OUT / "oc.json").stat().st_size / 1024
    covered_simanim = sorted(covered)
    print(f"{len(records)} entries, {len(payload['themes'])} themes in use, "
          f"{len(payload['writers'])} writers, {size:,.0f} KB"
          + ("" if tags else "  [UNTAGGED - run tag_themes.py fetch]"))
    if covered_simanim:
        print(f"simanim {covered_simanim[0]}-{covered_simanim[-1]} "
              f"across {len(sections)} sections")


if __name__ == "__main__":
    build()
