"""Let the corpus propose its own themes rather than starting from a list.

Samples posts spread across the siman range, asks for free-text themes with
no vocabulary supplied, and tallies what recurs. The output is raw material
for a curated vocabulary - not the vocabulary itself.

Usage: python discover_themes.py [sample_size]
"""

import json
import re
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic

DATA = Path(__file__).resolve().parent.parent / "data"
MODEL = "claude-opus-4-8"

PROMPT = """הטקסט הבא הוא סיכום-שיעור יומי על סימן (או כמה סימנים) בשולחן ערוך אורח חיים, שנכתב עבור קבוצת לימוד.

מנה בין 3 ל-6 נושאים הלכתיים מרכזיים שהסיכום עוסק בהם. כתוב כל נושא בעברית, בשתיים עד ארבע מילים, כמושג כללי שיכול לחזור גם בסימנים אחרים - לא כתיאור של המקרה הספציפי הנדון.
לדוגמה: "ספק ברכות להקל" ולא "ברכת אשר יצר פעמיים"; "כוונה במצוות" ולא "כוונה בתקיעת שופר".

החזר JSON בלבד: {"themes": ["...", "..."]}"""


def sample(summaries, size):
    """Evenly spaced across the list, which is already siman-ordered."""
    if size >= len(summaries):
        return list(summaries)
    step = len(summaries) / size
    return [summaries[int(i * step)] for i in range(size)]


def ask(client, entry):
    response = client.messages.create(
        model=MODEL,
        max_tokens=400,
        system=PROMPT,
        output_config={
            "effort": "low",
            "format": {
                "type": "json_schema",
                "schema": {
                    "type": "object",
                    "properties": {
                        "themes": {"type": "array", "items": {"type": "string"}}
                    },
                    "required": ["themes"],
                    "additionalProperties": False,
                },
            },
        },
        messages=[{"role": "user", "content": f"{entry['header']}\n\n{entry['text']}"}],
    )
    if response.stop_reason == "refusal":
        return []
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)["themes"]


def main(size):
    client = anthropic.Anthropic()
    entries = json.loads((DATA / "oc.json").read_text(encoding="utf-8"))
    chosen = sample([e for e in entries if e["type"] == "summary"], size)

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda e: ask(client, e), chosen))

    counts = Counter()
    for themes in results:
        for theme in themes:
            counts[re.sub(r"\s+", " ", theme).strip().strip('."')] += 1

    out = DATA / "discovered.json"
    out.write_text(
        json.dumps(counts.most_common(), ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"===== {len(chosen)} posts -> {len(counts)} distinct themes =====")
    for theme, n in counts.most_common(45):
        print(f"  {n:3d}  {theme}")
    print(f"\nfull list written to {out.name}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 60)
