# Nosei kelim routine

Instructions for the cloud routine that runs every morning at 03:00 Israel time. Two
simanim a day (167-168 on 2026-11-13, 169-170 on the 14th, and so on to 697), it
studies what the nosei kelim on Sefaria say on each siman, writes a brief for the
"נושאי הכלים" panel on the siman's page, writes the siman's quiz (חידון), and
publishes both to the site.

## The rule

**Only the nosei kelim, only from Sefaria, only with words that are actually there.**
The sources are the commentaries on the Shulchan Aruch that Sefaria links to the siman
as "Commentary": Mishnah Berurah, Biur Halacha, Magen Avraham, Turei Zahav, Beur
HaGra, Ba'er Hetev, Sha'arei Teshuvah, Kaf HaChayim, Eliyah Rabbah, Levushei Serad,
Machatzit HaShekel, Rabbi Akiva Eiger, Chatam Sofer, Be'er HaGolah and the like.
**Not** the Gemara, the Rambam, the Tur, the Shulchan Arukh HaRav, Aruch HaShulchan,
responsa, Peninei Halakhah or anything else under Sefaria's Talmud, Halakhah or
Responsa sections. `scripts/nk_sources.py` gathers exactly the allowed comments, and
`scripts/check_nk.py` removes anything that is not one of them or whose quote is not
in it. Nothing you did not read goes in: no explanations of your own, no paraphrased
"quotes".

## Modes

- **Daily** (the normal run): steps 0-6 for today's date.
- **Backfill** (when the prompt lists simanim): steps 2-6 for each listed siman, no time guard.

## Step 0 - time guard (daily only)

The schedule fires at 00:17 and 01:17 UTC so one firing lands at about 03:17 in Israel
year-round. Run `TZ=Asia/Jerusalem date +%H`; if it is not `03`, print "Off-hour
scheduled firing - skipping" and stop.

## Step 1 - which simanim

`python3 scripts/add_nk.py --due $(TZ=Asia/Jerusalem date +%Y-%m-%d)` prints the simanim
whose day has come and that have no brief yet (normally today's two; more if a day was
missed). If the list is empty, print "Already published" and stop. Do steps 2-5 for each
siman in turn.

## Step 2 - read

1. The text: `site/data/sa/<siman>.json` (the Mechaber as "sa", the Rema as "rema",
   se'if by se'if). Read every se'if.
2. The nosei kelim: `python3 scripts/nk_sources.py <siman>` writes `/tmp/nk-<siman>.json`
   and prints every comment, se'if by se'if, with its Sefaria ref. Read all of the
   Mishnah Berurah, Magen Avraham, Turei Zahav and Biur Halacha on the siman, and of the
   others (Beur HaGra, Sha'arei Teshuvah, Ba'er Hetev, Rabbi Akiva Eiger, Chatam Sofer,
   Eliyah Rabbah, Kaf HaChayim...) at least what they say on the se'ifim you write about.
   Look for where they disagree (חולק, מפקפק, תמה, צ"ע, ולא נהירא, ודלא כ...), where they
   limit or explain the ruling, and what the Mishnah Berurah concludes.

## Step 3 - write the brief

Write `/tmp/nk-brief-<siman>.json` with python `json.dump(..., ensure_ascii=False)`,
all in Hebrew, plain text only (no Markdown, no HTML):

```
{"siman": 167, "date": "YYYY-MM-DD",
 "overview": "3-4 sentences: what the siman is about and where the nosei kelim
              mainly explain or disagree",
 "points": [{
   "seif": 6,
   "title": "short title",
   "anchor": "<words of that se'if, copied exactly from site/data/sa/<siman>.json>",
   "text": "2-5 sentences of study prose: what each of them says, who disagrees with
            whom, what the Mishnah Berurah concludes",
   "sources": [{"name": "ט\"ז", "ref": "Turei Zahav on Shulchan Arukh, Orach Chayim 167:8",
                "quote": "<his own words, copied exactly from that comment>"}]}]}
```

- **12-18 points** a siman (a short siman fewer, never under 8), in the order of the
  se'ifim, spread over the siman, favouring the machlokot and the explanations a
  learner needs. Two or three sources on a point where several of them speak.
- Every source's `ref` is a comment from `/tmp/nk-<siman>.json` **on the point's se'if**;
  its quote is at least three words in a row from that comment (two excerpts may be
  joined with "…", each at least two words).
- `anchor` is optional; when given, copy it letter for letter from one run of the se'if
  (within the Mechaber's words or within the Rema's, not across both). The site
  underlines it in the text and links it to the point.
- Name the works in Hebrew as the learner knows them (משנה ברורה, ביאור הלכה, מגן
  אברהם, ט"ז, ביאור הגר"א, שערי תשובה, באר היטב, רבי עקיבא איגר...).

## Step 4 - write the quiz

The same game as the parasha quizzes on aliyah-yomit (see its ROUTINE-QUIZ.md): a
question bank the reader draws from by number and type. **The questions are on the
Shulchan Aruch only - the words of the Mechaber and the Rema - never on the nosei
kelim** (they have their own panel). Write
`/tmp/quiz/<siman>.json`:

```
{"siman": 167, "questions": [
  {"r": "1", "t": "din",
   "q": "בחול – מתי מפרידים את פרוסת הבציעה מן הככר?",
   "o": ["אחרי שסיים את הברכה", "לפני שמתחיל לברך", "באמצע הברכה", "אחרי שטעם"],
   "e": "“ואחר שסיים הברכה יפרידנה כדי שתכלה הברכה בעוד שהפת שלם”.",
   "h": "optional hint"}]}
```

- **15-25 questions a siman** (a siman of three se'ifim or fewer: at least 6), in the
  order of the se'ifim and spread over all of them, none repeating another.
- `"t"`, the type: `din` (מה הדין), `taam` (the reason the text gives), `rema` (what the
  Rema adds or rules, or who says what), `complete` (השלמת הלשון, a ___ blank in the
  quote). Roughly: two thirds `din`, 3-5 each of `taam` and `rema`, 1-2 `complete`.
- `"o"`: exactly 4 different answers, **the right one first** (the script shuffles them).
  Distractors are plausible - often the ruling of the next case, or of the other
  opinion - and clearly wrong by the text for what is asked. None of them may also be true.
- `"r"`: the se'if (`"6"`) or se'ifim (`"4-5"`) that answer it.
- `"e"`: the answer in the text's own words, in “ ”. Every quote in `q` and `e` must
  appear word for word in the se'ifim of `r`.
- Ask about the content, never about where something is in the text ("בסעיף ז", "בסוף
  הסימן"). No question whose answer everyone knows without learning the siman.

## Step 5 - check

```sh
python3 scripts/check_nk.py /tmp/nk-brief-<siman>.json
python3 scripts/quiz.py --check /tmp/quiz/<siman>.json
```

`check_nk.py` removes every source that is not a nosei kelim comment on that se'if or
whose quote is not in it, drops points left with none and anchors not found, and exits 1
under 8 points, under 4 works, without the Mishnah Berurah, or when one work holds more
than half the citations. `quiz.py --check` refuses a quote not in its text, a bad `r`
, a question on a commentary, a wrong type, or the wrong number of questions. On exit 1: read more, copy
quotes exactly, fix, and run again. Then reread every quiz question against its se'if
and make sure the answer is right and no distractor is also true.

## Step 6 - publish

1. `git pull --rebase origin main`.
2. For each siman: `python3 scripts/add_nk.py /tmp/nk-brief-<siman>.json`, then
   `python3 scripts/quiz.py /tmp/quiz/<siman>.json` (writes `site/data/nk/` and
   `site/data/quiz/` and their index files).
3. `git add site/data/nk site/data/quiz` - nothing else - and commit as
   `git -c user.name="Orach Chaim routine" -c user.email="rosenbaum.jeremy@gmail.com" commit -m "Nosei kelim and quiz: simanim <a>-<b> (<date>)"`.
4. `git push origin main`; if rejected because main moved, pull --rebase and retry
   (3 tries). Cloudflare deploys on push.

Finish with one line per siman: points and works in the brief, questions in the quiz,
and whether the commit was pushed. Send no email and change no other file.
