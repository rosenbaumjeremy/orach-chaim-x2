#!/usr/bin/env python3
"""Siman quizzes: check a draft quiz against the text and publish it.

    python3 scripts/quiz.py draft.json [more.json ...]   check, then write site/data/quiz/<siman>.json
    python3 scripts/quiz.py --check draft.json           check only, write nothing

The same game as the parasha quizzes on aliyah-yomit: a siman's quiz is a question bank,
and the site lets the reader choose how many questions to draw at random and which types
(and, for a quiz on a whole section of halachot, from which simanim).

A draft is
    {"siman": 167, "questions": [
       {"q": "לפי השולחן ערוך, מתי מפרידים את הפרוסה מן הככר?",
        "o": ["the right answer", "wrong", "wrong", "wrong"],     # right answer first
        "e": "why, quoting the text: “ואחר שסיים הברכה יפרידנה”",
        "r": "1",                                               # the se'if, or a range "1-2"
        "t": "din",                                             # the type, one of TYPES
        "h": "optional hint"}]}

The questions are on the Shulchan Aruch itself (the Mechaber and the Rema), never on the
nosei kelim. Every “quote” in the question and the explanation must appear word for word
(letters only) in the text of the se'ifim in "r" (site/data/sa/<siman>.json). "..." skips
words and "___" leaves a blank.
A siman gets 12 to 25 questions; a very short siman (three se'ifim or fewer) at least 6.
The answers are shuffled (a fixed order per question) and the right one is recorded in "a".
"""
import hashlib
import json
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "site" / "data"
OUT = DATA / "quiz"
MIN_Q, MAX_Q, MIN_SHORT = 12, 25, 6

# question types (the reader can pick which to play); the site has the labels
TYPES = {
    "din": "מה הדין",
    "taam": "טעמים",
    "rema": "המחבר והרמ\"א",
    "complete": "השלמת הלשון (___)",
}

FINALS = str.maketrans("ךםןףץ", "כמנפצ")
QUOTE = re.compile("“([^”]+)”")


def letters(s):
    return re.sub("[^א-ת]", "", s).translate(FINALS)


def words_of(text):
    return [letters(w) for w in re.split(r"[\s־]+", text) if letters(w)]


def in_text(quote, text):
    """every part of the quote ("..." skips words, "___" is a blank) is in the text, in order"""
    have = words_of(text)
    parts = [p for p in re.split(r"\.\.\.|…|___", quote) if letters(p)]
    if not parts:
        return False
    at = 0
    for part in parts:
        want = words_of(part)
        hit = next((i for i in range(at, len(have) - len(want) + 1) if have[i:i + len(want)] == want), None)
        if hit is None:
            return False
        at = hit + len(want)
    return True


def check(draft):
    siman = int(draft["siman"])
    path = DATA / "sa" / f"{siman}.json"
    if not path.exists():
        return [f"siman {siman}: no text"], None
    sa = json.loads(path.read_text(encoding="utf-8"))
    seifim = [" ".join(t for _, t in runs) for runs in sa["seifim"]]
    problems, out = [], []
    n_q = len(draft["questions"])
    low = MIN_SHORT if len(seifim) <= 3 else MIN_Q
    if not low <= n_q <= MAX_Q:
        problems.append(f"siman {siman}: {n_q} questions (want {low}-{MAX_Q})")
    seen = set()
    for n, q in enumerate(draft["questions"], 1):
        where = f"siman {siman} #{n}"
        try:
            a, _, b = str(q["r"]).partition("-")
            start, end = int(a), int(b or a)
            if not 1 <= start <= end <= len(seifim):
                raise ValueError(f"the siman has {len(seifim)} se'ifim")
        except (ValueError, KeyError) as error:
            problems.append(f"{where}: bad r {q.get('r')!r}: {error}")
            continue
        if q.get("t") not in TYPES:
            problems.append(f"{where}: type {q.get('t')!r} is not one of {', '.join(TYPES)}")
        if len(q.get("o", [])) != 4 or len(set(q["o"])) != 4:
            problems.append(f"{where}: needs 4 different answers")
        if q["q"] in seen:
            problems.append(f"{where}: the same question twice")
        seen.add(q["q"])
        text = " ".join(seifim[start - 1:end])
        if q.get("src"):
            problems.append(f"{where}: questions are on the Shulchan Aruch only, not on a commentary ({q['src']})")
        for field in ("q", "e"):
            for quote in QUOTE.findall(q.get(field, "")):
                if not in_text(quote, text):
                    problems.append(f"{where} ({field}): “{quote}” is not in se'if {q['r']}")
        rng = random.Random(hashlib.sha256(f"oc{siman}#{n}".encode()).hexdigest())
        shuffle = list(range(4))
        rng.shuffle(shuffle)
        item = {"q": q["q"], "o": [q["o"][i] for i in shuffle], "a": shuffle.index(0),
                "e": q["e"], "t": q["t"], "seif": start,
                "ref": f"Shulchan Arukh, Orach Chayim {siman}:{start}" + (f"-{end}" if end != start else "")}
        if q.get("h"):
            item["h"] = q["h"]
        out.append(item)
    return problems, {"siman": siman, "questions": out}


def main(args):
    only_check = "--check" in args
    files = [a for a in args if not a.startswith("--")]
    if not files:
        print(__doc__)
        sys.exit(2)
    failed = False
    for path in files:
        draft = json.loads(Path(path).read_text(encoding="utf-8"))
        problems, quiz = check(draft)
        for p in problems:
            print("✗", p)
        if problems:
            failed = True
            continue
        kinds = {}
        for q in quiz["questions"]:
            kinds[q["t"]] = kinds.get(q["t"], 0) + 1
        print(f"✓ siman {quiz['siman']}: {len(quiz['questions'])} questions "
              f"({', '.join(f'{k} {v}' for k, v in kinds.items())})")
        if not only_check:
            OUT.mkdir(parents=True, exist_ok=True)
            (OUT / f"{quiz['siman']}.json").write_text(
                json.dumps(quiz, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if not only_check:
        have = sorted(int(p.stem) for p in OUT.glob("*.json") if p.stem.isdigit())
        (OUT / "index.json").write_text(json.dumps({"simanim": have}) + "\n", encoding="utf-8")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
