"""Assign themes to each post via the Batch API.

Reads data/oc.json plus the controlled vocabulary in data/themes.json and
writes data/tags.json. Themes are constrained to the vocabulary by a JSON
schema enum, so the model cannot invent a tag.

Usage:
    python tag_themes.py estimate   # token/cost estimate, no API call
    python tag_themes.py trial      # tag a spread synchronously, judge the prompt
    python tag_themes.py submit     # create the batch, save its id
    python tag_themes.py fetch      # poll, then write results
    python tag_themes.py retry      # only what is still untagged
"""

import json
import sys
import time
from collections import Counter
from pathlib import Path

import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

DATA = Path(__file__).resolve().parent.parent / "data"
MODEL = "claude-opus-4-8"

# batch pricing is half of standard; opus 4.8 is $5/$25 per Mtok
PRICE_IN, PRICE_OUT = 5.00 / 2, 25.00 / 2

INSTRUCTIONS = """\
You are tagging daily study-group posts on Shulchan Aruch Orach Chaim so they can
be filtered on a website.

Return every theme from the controlled vocabulary that the post genuinely develops.
Tag what the post is *about*, not every halacha it mentions in passing: a ruling
cited only as supporting context is not a theme. Most posts have 2-5 themes. Never
invent a theme outside the vocabulary.

Judge the post on its own terms. Do not add a theme because it is common for this
siman range, and do not tag a theme the author only gestures at."""


def load_vocabulary():
    raw = json.loads((DATA / "themes.json").read_text(encoding="utf-8"))
    slugs, lines = [], []
    for category, themes in raw["categories"].items():
        lines.append(f"\n{category}:")
        for theme in themes:
            slugs.append(theme["slug"])
            lines.append(f"  {theme['slug']} = {theme['label']}")
    return slugs, "\n".join(lines)


def build_requests():
    entries = json.loads((DATA / "oc.json").read_text(encoding="utf-8"))
    summaries = [e for e in entries if e["type"] == "summary"]
    slugs, vocabulary = load_vocabulary()

    system = [
        {
            "type": "text",
            "text": f"{INSTRUCTIONS}\n\nControlled theme vocabulary:\n{vocabulary}",
            # every request shares this prefix, so cache it once
            "cache_control": {"type": "ephemeral"},
        }
    ]
    schema = {
        "type": "object",
        "properties": {
            "themes": {
                "type": "array",
                "items": {"type": "string", "enum": slugs},
                "description": "Themes the post genuinely develops.",
            },
        },
        "required": ["themes"],
        "additionalProperties": False,
    }

    requests = []
    for index, entry in enumerate(summaries):
        requests.append(
            Request(
                custom_id=str(index),
                params=MessageCreateParamsNonStreaming(
                    model=MODEL,
                    max_tokens=512,
                    system=system,
                    output_config={
                        "effort": "medium",
                        "format": {"type": "json_schema", "schema": schema},
                    },
                    messages=[
                        {
                            "role": "user",
                            "content": f"{entry['header']}\n\n{entry['text']}",
                        }
                    ],
                ),
            )
        )
    return summaries, requests


def estimate():
    """Price the run before spending anything on it."""
    client = anthropic.Anthropic()
    summaries, requests = build_requests()
    sample = requests[: min(20, len(requests))]

    counted = 0
    for request in sample:
        params = request["params"]
        counted += client.messages.count_tokens(
            model=MODEL, system=params["system"], messages=params["messages"]
        ).input_tokens

    per_request = counted / len(sample)
    total_in = per_request * len(requests)
    total_out = 100 * len(requests)  # themes-only is a short response
    print(f"{len(requests)} posts")
    print(f"  ~{per_request:,.0f} input tokens each, ~{total_in:,.0f} total")
    print(f"  estimated cost at batch rates: "
          f"${total_in / 1e6 * PRICE_IN + total_out / 1e6 * PRICE_OUT:,.2f}")
    print("  (caching the shared vocabulary prefix reduces this further)")


def trial(count=12):
    """Tag a spread of posts synchronously so the prompt can be judged cheaply."""
    from concurrent.futures import ThreadPoolExecutor

    client = anthropic.Anthropic()
    summaries, requests = build_requests()
    step = max(1, len(requests) // count)
    picked = [(summaries[i], requests[i]) for i in range(0, len(requests), step)][:count]

    def run(pair):
        entry, request = pair
        params = request["params"]
        message = client.messages.create(**params)
        text = next(b.text for b in message.content if b.type == "text")
        return entry, json.loads(text)

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(run, picked))

    counts = Counter()
    for entry, parsed in results:
        counts[len(parsed["themes"])] += 1
        print(f"\n{entry['header'][:78]}")
        print(f"  themes: {', '.join(parsed['themes'])}")
    print(f"\nthemes per post: {dict(sorted(counts.items()))}")


def submit():
    client = anthropic.Anthropic()
    _, requests = build_requests()
    batch = client.messages.batches.create(requests=requests)
    (DATA / ".batch-oc").write_text(batch.id, encoding="utf-8")
    print(f"submitted {len(requests)} requests as {batch.id}")
    print(f"run: python {Path(__file__).name} fetch")


def fetch():
    client = anthropic.Anthropic()
    batch_id = (DATA / ".batch-oc").read_text(encoding="utf-8").strip()

    while True:
        batch = client.messages.batches.retrieve(batch_id)
        if batch.processing_status == "ended":
            break
        counts = batch.request_counts
        print(f"  {batch.processing_status}: {counts.succeeded} done, "
              f"{counts.processing} processing, {counts.errored} errored")
        time.sleep(60)

    summaries, _ = build_requests()
    # merge into whatever earlier runs produced; a partial batch (credits ran
    # out, transient errors) should never discard results already paid for
    existing = DATA / "tags.json"
    tags = json.loads(existing.read_text(encoding="utf-8")) if existing.exists() else {}
    failures = []
    for result in client.messages.batches.results(batch_id):
        index = int(result.custom_id)
        if result.result.type != "succeeded":
            failures.append((result.custom_id, result.result.type))
            continue
        message = result.result.message
        if message.stop_reason == "refusal":
            failures.append((result.custom_id, "refusal"))
            continue
        text = next(b.text for b in message.content if b.type == "text")
        parsed = json.loads(text)
        entry = summaries[index]
        tags[result.custom_id] = {
            "simanim": entry["simanim"],
            "title": entry["title"],
            "themes": parsed["themes"],
        }

    (DATA / "tags.json").write_text(
        json.dumps(tags, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"tags.json now holds {len(tags)} of {len(summaries)} posts")
    if failures:
        reasons = Counter(reason for _, reason in failures)
        print(f"  {len(failures)} not tagged this run: {dict(reasons)}")
        print(f"  run: python {Path(__file__).name} retry")


def retry():
    """Submit only the posts that still have no tags."""
    client = anthropic.Anthropic()
    _, requests = build_requests()
    existing = DATA / "tags.json"
    done = set(json.loads(existing.read_text(encoding="utf-8"))) if existing.exists() else set()

    missing = [r for r in requests if r["custom_id"] not in done]
    if not missing:
        print("nothing missing")
        return
    batch = client.messages.batches.create(requests=missing)
    (DATA / ".batch-oc").write_text(batch.id, encoding="utf-8")
    print(f"resubmitted {len(missing)} of {len(requests)} as {batch.id}")
    print(f"run: python {Path(__file__).name} fetch")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("estimate", "trial", "submit", "fetch", "retry"):
        sys.exit(__doc__)
    {"estimate": estimate, "trial": trial, "submit": submit,
     "fetch": fetch, "retry": retry}[sys.argv[1]]()
