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
