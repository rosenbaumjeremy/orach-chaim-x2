#!/usr/bin/env python3
"""Build notes.json for the "Ask Claude · אורח חיים בשנה" page from site/data.

Usage: python3 scripts/build_ask_notes.py OUT.json
Writes every shiur summary in site/data/oc.json (ids like e12) and every
nosei kelim brief in site/data/nk (ids like nk207), in the format the Ask page reads.
"""
import json, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / "site" / "data"
MAX = 9000  # the page never reads past this
SKIP = {"siman", "date", "seif", "ref"}


def heb(n):
    out = ""
    for v, c in ((400, "ת"), (300, "ש"), (200, "ר"), (100, "ק")):
        while n >= v:
            out += c; n -= v
    if n == 15: return out + "טו"
    if n == 16: return out + "טז"
    tens = "יכלמנסעפצ"; ones = "אבגדהוזחט"
    if n >= 10: out += tens[n // 10 - 1]; n %= 10
    if n: out += ones[n - 1]
    return out


def flat(v, out):
    if isinstance(v, str):
        if v.strip(): out.append(v)
    elif isinstance(v, list):
        for i in v: flat(i, out)
    elif isinstance(v, dict):
        for k, i in v.items():
            if k in SKIP: continue
            if k == "title" and isinstance(i, str): out.append("## " + i)
            else: flat(i, out)
    return out


def main(out_path):
    notes = []
    for e in json.loads((ROOT / "oc.json").read_text(encoding="utf-8"))["entries"]:
        s = e["simanim"]
        w = f"סימן {heb(s[0])}" if len(s) == 1 else f"סימנים {heb(s[0])}–{heb(s[-1])}"
        notes.append({"id": f'e{e["id"]}', "w": {"he": w}, "t": {"he": e["title"]},
                      "x": {"he": e["text"][:MAX]}, "h": f"s={s[0]}"})
    for f in sorted((ROOT / "nk").glob("*.json"), key=lambda p: (not p.stem.isdigit(), int(p.stem) if p.stem.isdigit() else 0)):
        if not f.stem.isdigit(): continue
        d = json.loads(f.read_text(encoding="utf-8")); n = d["siman"]
        notes.append({"id": f"nk{n}", "w": {"he": f"סימן {heb(n)} · נושאי כלים"},
                      "t": {"he": f"נושאי הכלים על סימן {heb(n)}"},
                      "x": {"he": "\n".join(flat(d, []))[:MAX]}, "h": f"s={n}"})
    pathlib.Path(out_path).write_text(
        "[\n" + ",\n".join(json.dumps(n, ensure_ascii=False) for n in notes) + "\n]\n", encoding="utf-8")
    print(f"{len(notes)} notes -> {out_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "notes.json")
