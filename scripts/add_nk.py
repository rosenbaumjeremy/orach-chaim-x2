"""Publish a nosei kelim brief, and say which simanim are due.

    python3 scripts/add_nk.py --due 2026-11-14     # simanim due by that date and not yet published
    python3 scripts/add_nk.py /tmp/nk-brief.json   # file a checked brief

The schedule: two simanim a day, starting with 167-168 on 2026-11-13
(169-170 on the 14th, and so on through siman 697). --due lists, in order,
every siman whose day has come and that has no file yet - normally today's
two, more if a day was missed (at most 6, so one run never balloons).

Filing writes site/data/nk/<siman>.json (what the site reads) and adds the
siman to site/data/nk/index.json. Run scripts/check_nk.py first.
"""

import datetime
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NK = ROOT / "site" / "data" / "nk"
START_DATE = datetime.date(2026, 11, 13)
START_SIMAN = 167
PER_DAY = 2
LAST = 697
MAX_PER_RUN = 6


def due_date(siman):
    return START_DATE + datetime.timedelta(days=(siman - START_SIMAN) // PER_DAY)


def index():
    path = NK / "index.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"simanim": []}


def due(date):
    done = {s["siman"] for s in index()["simanim"]}
    out = []
    for siman in range(START_SIMAN, LAST + 1):
        if due_date(siman) > date:
            break
        if siman not in done:
            out.append(siman)
    return out[:MAX_PER_RUN]


def publish(path):
    brief = json.loads(Path(path).read_text(encoding="utf-8"))
    siman = int(brief["siman"])
    record = {
        "siman": siman,
        "date": brief.get("date") or due_date(siman).isoformat(),
        "overview": brief["overview"].strip(),
        "points": brief["points"],
        "sources_consulted": brief.get("sources_consulted", []),
    }
    NK.mkdir(parents=True, exist_ok=True)
    (NK / f"{siman}.json").write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
    idx = index()
    idx["simanim"] = sorted([s for s in idx["simanim"] if s["siman"] != siman]
                            + [{"siman": siman, "date": record["date"]}], key=lambda s: s["siman"])
    (NK / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"filed siman {siman}: {len(record['points'])} points -> site/data/nk/{siman}.json")


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--due":
        date = datetime.date.fromisoformat(sys.argv[2])
        simanim = due(date)
        print(json.dumps({"date": date.isoformat(), "due": simanim}))
        return
    if len(sys.argv) == 2:
        publish(sys.argv[1])
        return
    print(__doc__)
    sys.exit(2)


if __name__ == "__main__":
    main()
