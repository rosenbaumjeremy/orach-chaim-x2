"""Check a nosei kelim brief against Sefaria, and drop anything that isn't there.

    python3 scripts/check_nk.py BRIEF.json [--min 8]

The brief (see ROUTINE.md) is one siman: an overview and "points", each tied
to a se'if. It is rewritten in place. For every point:

  * every source must be a comment of the nosei kelim on THIS siman, as
    scripts/nk_sources.py gathers them (Sefaria links of category
    "Commentary" anchored to the siman: no Gemara, no halakha works, no
    responsa); it must be anchored to the point's se'if; and its "quote" must
    appear word for word in that comment;
  * sources that fail are removed, and a point left with none is removed;
  * "anchor", if given, must be words of the point's se'if copied exactly
    (letter for letter, punctuation included) from the Shulchan Aruch text on
    the site, within the Mechaber's or the Rema's words; an anchor not found
    is dropped (the point stays, it just isn't underlined in the text).

Then the whole brief: at least --min points survive, at least 4 different
works are cited, the Mishnah Berurah is among them, and no single work holds
more than half the citations. Exits 1 otherwise, after printing every
removal, so the caller can read more and fix it instead of publishing.

Comparison ignores nikud, punctuation, quote marks, and ו/י spelling.
"""

import argparse
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nk_sources import gather  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MARKS = re.compile(r"[֑-ׇ]")
NOISE = re.compile(r"[^\w\s]|_")


def norm(text):
    text = html.unescape(re.sub(r"<[^>]+>", " ", text or ""))
    text = text.replace("־", " ")
    text = MARKS.sub("", text)
    text = NOISE.sub(" ", text)
    text = re.sub(r"[וי]", "", text)
    return " ".join(text.split()).lower()


def found(quote, text):
    """Every part of the quote (joined by "..." or "…") is in the text, in
    order. Parts at least two words; the whole quote at least three."""
    parts = [norm(p) for p in re.split(r"\.\.\.|…", quote or "")]
    parts = [p for p in parts if p]
    if not parts or sum(len(p.split()) for p in parts) < 3 or any(len(p.split()) < 2 for p in parts):
        return False
    hay, at = norm(text), 0
    for part in parts:
        at = hay.find(part, at)
        if at < 0:
            return False
        at += len(part)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("brief")
    ap.add_argument("--min", type=int, default=8)
    args = ap.parse_args()

    brief = json.loads(Path(args.brief).read_text(encoding="utf-8"))
    siman = int(brief["siman"])
    cache = Path(f"/tmp/nk-{siman}.json")
    corpus = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else gather(siman)
    comments = {c["ref"]: c for c in corpus["comments"]}
    sa = json.loads((ROOT / "site" / "data" / "sa" / f"{siman}.json").read_text(encoding="utf-8"))
    seif_text = [" ".join(t for _, t in runs) for runs in sa["seifim"]]

    report, kept = [], []
    for i, point in enumerate(brief.get("points", []), 1):
        tag = f"point {i} ({point.get('title', '')!r})"
        seif = point.get("seif")
        if not isinstance(seif, int) or not 1 <= seif <= len(seif_text):
            report.append(f"{tag}: se'if {seif!r} is not in siman {siman}")
            continue
        sources = []
        for s in point.get("sources", []):
            c = comments.get(s.get("ref"))
            if not c:
                report.append(f"{tag}: {s.get('ref')!r} is not a comment of the nosei kelim on siman {siman}")
            elif c["seif"] != seif:
                report.append(f"{tag}: {s.get('ref')!r} is on se'if {c['seif']}, not {seif}")
            elif not found(s.get("quote"), c["text"]):
                report.append(f"{tag}: quote not found in {s['ref']!r}: {s.get('quote')!r}")
            else:
                s["name"] = s.get("name") or c["name"]
                s["work"] = c["work"]
                sources.append(s)
        if not sources:
            report.append(f"{tag}: REMOVED (no verified source)")
            continue
        point["sources"] = sources
        # the site underlines the anchor by exact match inside one run of the text
        runs = [t for _, t in sa["seifim"][seif - 1]]
        if point.get("anchor") and not any(point["anchor"] in t for t in runs):
            report.append(f"{tag}: anchor not in se'if {seif}, dropped: {point['anchor']!r}")
            point.pop("anchor")
        kept.append(point)

    kept.sort(key=lambda p: p["seif"])
    brief["points"] = kept
    cites = [s["work"] for p in kept for s in p["sources"]]
    works = sorted(set(cites))
    brief["sources_consulted"] = sorted({comments[s["ref"]]["name"] for p in kept for s in p["sources"]})
    Path(args.brief).write_text(json.dumps(brief, ensure_ascii=False, indent=1), encoding="utf-8")

    for line in report:
        print(line)
    print(f"siman {siman}: {len(kept)} points, {len(cites)} citations from {len(works)} works: {', '.join(works)}")

    problems = []
    if len(kept) < args.min:
        problems.append(f"only {len(kept)} points (need {args.min})")
    if len(works) < 4:
        problems.append(f"only {len(works)} works cited (need 4)")
    if "Mishnah Berurah" not in works:
        problems.append("the Mishnah Berurah is not cited")
    for w in works:
        if cites.count(w) * 2 > len(cites):
            problems.append(f"{w} holds {cites.count(w)} of {len(cites)} citations (max half)")
    if not (brief.get("overview") or "").strip():
        problems.append("no overview")
    if problems:
        print("FAIL: " + "; ".join(problems))
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
