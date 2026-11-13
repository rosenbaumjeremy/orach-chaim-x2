# Orach Chaim x2 — filterable site over the daily shiur

A static site over daily Shulchan Aruch Orach Chaim posts from the WhatsApp
group "אורח חיים בשנה 2", filterable by siman, theme, writer, cited source,
and full text.

> **Private repository.** The posts were written by members of the study
> group, not by the repository owner. Do not make this public without their
> agreement. The raw export is gitignored because it contains phone numbers;
> the committed data identifies writers only as `A`/`B`.

## One corpus, one writer pair

Unlike a multi-group project, this is a single corpus: two people
(תני בדנרש and אמיתי בר תקווה) alternate posting a shiur-style summary of
each day's simanim. Coverage is siman 1 onward — the group is ongoing, so the
site will need periodic rebuilds as more of Orach Chaim's 697 simanim are
covered.

## Layout

```
scripts/     pipeline, run in this order
  clean.py            export      -> data/oc.json           (parse, anonymise)
  extract_sources.py  oc.json     -> data/sources.json       (cited poskim/gemara, no API calls)
  discover_themes.py  oc.json     -> data/discovered.json    (open-ended themes)
  cluster_themes.py   discovered  -> data/themes.json        (vocabulary)
  tag_themes.py       oc.json + themes.json -> data/tags.json
  build_site.py       everything  -> site/data/oc.json
  fetch_shulchan_aruch.py  Sefaria -> site/data/sa/<siman>.json (the text itself)
site/        the site itself: index.html, app.css, app.js
data/        intermediate artefacts
```

## Rebuilding

The export lives outside the repo; point `clean.py` at it, then:

```sh
python scripts/clean.py
python scripts/extract_sources.py
python scripts/build_site.py
```

Tagging needs `ANTHROPIC_API_KEY` and costs a few dollars per full run:

```sh
python scripts/tag_themes.py estimate
python scripts/tag_themes.py trial
python scripts/tag_themes.py submit
python scripts/tag_themes.py fetch   # polls, merges into tags.json
python scripts/tag_themes.py retry   # only what is still untagged
```

`fetch` merges rather than overwrites, so a batch that dies partway through
(credit exhaustion, transient errors) never discards results already paid for.

## Running the site

Any static server — there is no build step and no dependencies:

```sh
python -m http.server 8123 --directory site
```

Deploys as-is to Cloudflare Pages, GitHub Pages, Netlify, or any static host.

## Editing the vocabulary

`data/themes.json` is plain JSON: edit, reorder, or delete freely. The
tagger constrains itself to the slugs present there, and the site hides any
theme that no post uses. After changing it, re-tag to apply.

## Siman sections

`scripts/build_site.py` hard-codes the 29 canonical Orach Chaim sections
(הלכות הנהגת האדם בבוקר, הלכות ציצית, ... הלכות מגילה) as siman ranges, used
to group the siman grid on the site.

## The Shulchan Aruch text

Choosing a siman opens it the way mishna-yomit opens a perek: the Shulchan
Aruch text (Mechaber with the Rema's hagahot, from Sefaria) on the right, the
group's summaries of that siman on the left. Every siman opens, with or
without a summary yet. A "סעיף ו" or "סעיפים ד-ה" in a summary is a link that
marks those se'ifim in the text (or opens the other siman the post was
talking about).

The text is one file per siman, fetched once and committed:

```sh
python scripts/fetch_shulchan_aruch.py        # only what is missing
python scripts/fetch_shulchan_aruch.py --all  # everything again
```

## The nosei kelim and the quizzes

From siman 167 on, a cloud routine adds two simanim a day (167-168 on 2026-11-13,
then 169-170, ... through 697), following [ROUTINE.md](ROUTINE.md):

- a "נושאי הכלים" panel on the siman's page: what the commentaries on the Shulchan
  Aruch say, se'if by se'if, each point quoting its sources word for word from
  Sefaria, with the words it explains underlined in the text
  (`site/data/nk/<siman>.json`);
- a quiz on the siman (`site/data/quiz/<siman>.json`), the same game as the parasha
  quizzes on aliyah-yomit, and a quiz on a whole section of halachot drawn from all of
  its simanim.

Only Sefaria's "Commentary" links on the siman count as sources - no Gemara, halakha
works or responsa. `scripts/nk_sources.py` gathers them, `scripts/check_nk.py` and
`scripts/quiz.py` check every quote before anything is published, and
`scripts/add_nk.py --due <date>` says which simanim are due.
