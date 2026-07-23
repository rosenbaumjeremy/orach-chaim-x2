"""Turn the WhatsApp export into structured JSON.

Reads the raw .txt export (never modifies it) and writes data/oc.json. Each
entry is one posted message classified as a siman summary or a resource-link
post. Anything else (system messages, admin-only group events, short chatter)
is dropped as noise.

Usage: python clean.py
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

DESKTOP = Path(r"C:\Users\rosen\Desktop")
SOURCE = DESKTOP / "WhatsApp עם אורח חיים בשנה 2.txt"
OUT = Path(__file__).resolve().parent.parent / "data"

# --- message framing ------------------------------------------------------

MSG = re.compile(r"^(\d{1,2}\.\d{1,2}\.\d{4}), (\d{1,2}:\d{2}) - (.*)$")
BIDI = dict.fromkeys(map(ord, "‎‏‪‫‬"), None)

NOISE = re.compile(
    r"^(<Media omitted>|null|This message was deleted|You deleted this message"
    r"|⁨?<[^>]*omitted>⁩?|.{0,40}omitted⁩?)$",
    re.IGNORECASE,
)


def parse_messages(path):
    """Split an export into messages, keeping multi-line bodies intact."""
    messages = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.translate(BIDI)
        m = MSG.match(line)
        if m:
            date, time, rest = m.groups()
            sender, body = rest.split(": ", 1) if ": " in rest else (None, rest)
            messages.append({"date": date, "time": time, "sender": sender, "body": body})
        elif messages:
            messages[-1]["body"] += "\n" + line
    # system lines have no sender: joins, leaves, admin/description changes
    return [m for m in messages if m["sender"]]


# --- siman numbers ----------------------------------------------------------

MAX_SIMAN = 697

GEMATRIA = {"א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9,
            "י": 10, "כ": 20, "ל": 30, "מ": 40, "נ": 50, "ס": 60, "ע": 70, "פ": 80,
            "צ": 90, "ק": 100, "ר": 200, "ש": 300, "ת": 400}
FINALS = {"ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ"}


def gematria(token):
    """'תרכ"ה' -> 625, but a word made of the same letters -> None.

    Unlike Tanach chapter numbers (max 150, at most 3 letters), simanim run to
    697, which needs up to 4 letters (תרצ"ז = ת+ר+צ+ז). A numeral's letters
    still have to run high-to-low, which is what keeps an ordinary word from
    being misread as a number.
    """
    letters = [FINALS.get(ch, ch) for ch in token if ch not in "\"'״׳"]
    if not 0 < len(letters) <= 4:
        return None
    values = []
    for ch in letters:
        if ch not in GEMATRIA:
            return None
        values.append(GEMATRIA[ch])
    if any(a < b for a, b in zip(values, values[1:])):
        return None
    return sum(values) or None


def as_siman(token):
    value = int(token) if token.isdigit() else gematria(token)
    if value and 1 <= value <= MAX_SIMAN:
        return value
    return None


# --- header parsing ---------------------------------------------------------

BOLD_HEAD = re.compile(r"^\*([^*\n]{2,200})\*\s*$")
LINK = re.compile(r"https?://\S+")
# group invites and survey forms aren't "further reading" for a siman - and
# the invite link in particular has no place in a repo of the group's content
NOT_A_RESOURCE = re.compile(r"chat\.whatsapp\.com|forms\.gle")

NUM = r"(?:\d{1,3}|[א-ת][א-ת\"'״׳]{0,4})"
DASH = r"[-־–—]"
RANGE_SEP = rf"(?:{DASH}|עד)"
KEYWORD = r"סימנים|סימן"

# anchored: a header only counts as a siman reference if it starts with the
# keyword, so a resource post that merely *mentions* a siman (e.g. "קישור
# ללימוד הסימן... (סימנים תרכ\"ט)") is never misread as a summary
HEAD_RE = re.compile(rf"^\s*({KEYWORD})\s+({NUM})(?:\s*{RANGE_SEP}\s*({NUM}))?")

# descriptive clauses that follow the siman number(s) before the title -
# stripped in a loop since they can appear in either order. "סעיף" (singular,
# final-pe) and "סעיפים" (plural, regular pe) are different spellings, not
# one word with an optional suffix, so both must be listed explicitly.
SEIF_CLAUSE = re.compile(
    rf"^\s*\(?\s*(?:סעיפים|סעיף)\s*{NUM}(?:\s*{RANGE_SEP}\s*{NUM})?\s*\)?\s*"
)
PART_CLAUSE = re.compile(
    r"^\s*חלק\s+(?:ראשון|שני|שלישי|רביעי|חמישי|א[\"']?|ב[\"']?|ג[\"']?)\s*"
)
# "עד סוף סימן נז" extends the range to the end of another siman entirely -
# seen when a post picks up mid-siman and runs through the next one
END_CLAUSE = re.compile(rf"^\s*עד\s+סוף\s+(?:סימנים|סימן)\s+({NUM})\s*")
TITLE_SEP = re.compile(rf"^\s*(?:{DASH}|:)\s*")

# a second header style used for supplementary "extension" posts: bare
# "siman:seif" refs with no סימן/סימנים keyword at all, e.g.
# "קנב:א-קנג:יא - האם מותר להרוס או למכור בית כנסת?". The colon requirement
# keeps this from ever matching a keyword-based header (סימן has no colon).
COMPACT_RE = re.compile(
    rf"^\s*({NUM}):{NUM}(?:{DASH}({NUM}):{NUM})?\s*{DASH}\s*(.+)$"
)


def parse_compact(head):
    m = COMPACT_RE.match(head)
    if not m:
        return None
    lo, hi, title = m.groups()
    first = as_siman(lo)
    if not first:
        return None
    last = first
    if hi:
        second = as_siman(hi)
        if second and 0 < second - first < 50:
            last = second
    return list(range(first, last + 1)), title.strip(" *")


def parse_head(head):
    """'סימן ד חלק שני (סעיפים יג-כג) - המשך הלכות נטילת ידיים'
    -> ([4], 'המשך הלכות נטילת ידיים')

    Returns None if the head doesn't open with סימן/סימנים at all - the
    caller then falls back to treating the message as a resource post (if it
    has a link) or noise.
    """
    m = HEAD_RE.match(head)
    if not m:
        return None
    keyword, lo, hi = m.groups()
    first = as_siman(lo)
    if not first:
        return None
    last = first
    consumed_end = m.end(2)  # end of the first number only, by default
    if hi:
        # a singular "סימן" is (almost) never followed by a real range - it's
        # the title's first word that happens to also be valid gematria
        # ("סימן לט - מי יכול..." -> מי = 40+10 = 50, descending, valid-looking
        # but wrong). Plural "סימנים" is the actual signal for a range; a
        # plain digit is unambiguous either way.
        ambiguous = keyword == "סימן" and not hi.isdigit()
        second = None if ambiguous else as_siman(hi)
        if second and 0 < second - first < 50:
            last = second
            consumed_end = m.end(3)  # only consume the range if it validated -
            # otherwise "hi" was really the first word of the title (e.g. "רב
            # - ברכת הפירות" structurally fits NUM but fails the gematria check)

    rest = head[consumed_end:]
    changed = True
    while changed:
        changed = False
        end_match = END_CLAUSE.match(rest)
        if end_match:
            second = as_siman(end_match.group(1))
            if second and second > last:
                last = second
            rest = rest[end_match.end():]
            changed = True
            continue
        for pattern in (SEIF_CLAUSE, PART_CLAUSE):
            found = pattern.match(rest)
            if found:
                rest = rest[found.end():]
                changed = True
    rest = TITLE_SEP.sub("", rest)
    return list(range(first, last + 1)), rest.strip(" *")


def classify(body):
    stripped = body.strip()
    first_line = stripped.split("\n")[0].strip()
    head_match = BOLD_HEAD.match(first_line)
    head = head_match.group(1).strip() if head_match else first_line
    has_link = bool(LINK.search(body))

    # most posts bold-wrap the header, but a few don't - parse_head is
    # anchored on the סימן/סימנים keyword either way, so trying it against a
    # plain first line is safe and catches those too
    parsed = parse_head(head) or parse_compact(head)
    if parsed:
        return "summary", head, parsed
    if has_link:
        return "resources", head, None
    return "other", head, None


# --- build ------------------------------------------------------------------

MIN_LEN = 30  # drops stray one-liners; posts here are long-form shiur text


def build(path):
    messages = parse_messages(path)
    entries, skipped = [], Counter()

    for m in messages:
        body = m["body"].strip()
        if not body or NOISE.match(body):
            skipped["noise"] += 1
            continue

        kind, head, parsed = classify(body)

        if kind == "resources":
            links = [link for link in LINK.findall(body) if not NOT_A_RESOURCE.search(link)]
            if links:
                entries.append({
                    "type": "resources", "date": m["date"], "sender": m["sender"],
                    "links": links,
                })
            else:
                skipped["resources with no link found"] += 1
            continue

        if kind == "other":
            if len(body) < MIN_LEN:
                skipped["short, no siman header"] += 1
            else:
                skipped["long, no siman header"] += 1
            continue

        simanim, title = parsed
        entries.append({
            "type": "summary",
            "simanim": simanim,
            "title": title,
            "header": head,
            "date": m["date"],
            "sender": m["sender"],
            "text": body,
        })

    return entries, skipped


def anonymize(entries):
    """Replace names with stable letters - see extract of the same logic in
    tanach-site/scripts/clean.py. Nobody in the group agreed to have their
    name stored in a repository, so only which posts share an author survives.
    """
    counts = Counter(e["sender"] for e in entries if e.get("sender"))
    letters = {s: chr(ord("A") + i) for i, (s, _) in enumerate(counts.most_common())}
    for entry in entries:
        entry["writer"] = letters.get(entry.pop("sender", None))
    return entries


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if not SOURCE.exists():
        sys.exit(f"missing source: {SOURCE}")

    entries, skipped = build(SOURCE)
    entries = anonymize(entries)
    (OUT / "oc.json").write_text(
        json.dumps(entries, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    summaries = [e for e in entries if e["type"] == "summary"]
    multi = [e for e in summaries if len(e["simanim"]) > 1]
    writers = Counter(e["writer"] for e in summaries)
    covered = sorted({s for e in summaries for s in e["simanim"]})

    print(f"summaries        {len(summaries)}")
    print(f"  multi-siman    {len(multi)}")
    print(f"  by writer      {dict(writers)}")
    print(f"resource posts   {sum(1 for e in entries if e['type'] == 'resources')}")
    print(f"skipped          {dict(skipped)}")
    if covered:
        print(f"simanim covered  {covered[0]}-{covered[-1]} ({len(covered)} of {MAX_SIMAN})")
        gaps = [s for s in range(covered[0], covered[-1] + 1) if s not in set(covered)]
        if gaps:
            print(f"  gaps within range: {len(gaps)} simanim not covered")


if __name__ == "__main__":
    main()
