"""Consolidate a discovered theme list into a curated vocabulary.

Reads data/discovered.json (free-text themes plus counts) and merges
near-synonyms into canonical themes, writing data/themes.json.

Usage: python cluster_themes.py
"""

import json
import sys
from pathlib import Path

import anthropic

DATA = Path(__file__).resolve().parent.parent / "data"
MODEL = "claude-opus-4-8"

INSTRUCTIONS = """\
Below is a list of halachic themes that were independently extracted from daily
study-group posts on Shulchan Aruch Orach Chaim, with the number of posts each
appeared in. The list is fragmented: the same idea often appears under several
near-synonymous names.

Consolidate it into a filter vocabulary for a website, following the grain of THIS
list rather than any standard set of halachic topics.

- Merge near-synonyms into one canonical theme. Where the list makes a distinction
  repeatedly, keep the distinction; where it scatters across paraphrases of one idea,
  collapse them.
- Set granularity by what the list supports. A theme so broad it would tag half the
  posts is useless as a filter, and so is one that fits a single post.
- Drop themes that describe a specific case rather than a recurring halachic concept.
- Group the result into 8-14 categories.
- Write labels in Hebrew. Slugs are lowercase latin ASCII with hyphens, and must
  be unique.

Return between 40 and 80 themes total - however many this particular list justifies."""

SCHEMA = {
    "type": "object",
    "properties": {
        "categories": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "category": {"type": "string"},
                    "themes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "slug": {"type": "string"},
                                "label": {"type": "string"},
                                "merged_from": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Input themes folded into this one.",
                                },
                            },
                            "required": ["slug", "label", "merged_from"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["category", "themes"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["categories"],
    "additionalProperties": False,
}


def main():
    client = anthropic.Anthropic()
    discovered = json.loads((DATA / "discovered.json").read_text(encoding="utf-8"))
    listing = "\n".join(f"{count}  {theme}" for theme, count in discovered)

    with client.messages.stream(
        model=MODEL,
        max_tokens=32000,
        system=INSTRUCTIONS,
        thinking={"type": "adaptive"},
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": listing}],
    ) as stream:
        response = stream.get_final_message()

    text = next((b.text for b in response.content if b.type == "text"), None)
    if text is None:
        sys.exit(f"no text block returned (stop_reason={response.stop_reason})")
    result = json.loads(text)

    vocabulary = {
        "_comment": (
            "Derived from discovered.json by clustering. Edit freely; the tagger "
            "re-reads this file, and re-tagging is needed after changing it."
        ),
        "categories": {
            group["category"]: [
                {"slug": t["slug"], "label": t["label"]} for t in group["themes"]
            ]
            for group in result["categories"]
        },
    }
    (DATA / "themes.json").write_text(
        json.dumps(vocabulary, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    total = sum(len(v) for v in vocabulary["categories"].values())
    print(f"{len(discovered)} raw -> {total} themes in {len(vocabulary['categories'])} categories")
    for group in result["categories"]:
        print(f"\n{group['category']}")
        for t in group["themes"]:
            merged = ", ".join(t["merged_from"][:4])
            print(f"  {t['label']:<34} <- {merged}")


if __name__ == "__main__":
    main()
