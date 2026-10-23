#!/usr/bin/env python3
"""Parse src/words-*.txt into a compact JS payload and report counts.
Format:  @id|Name  then  E:/M:/H: lines with ';'-separated entries."""
import glob, json, re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DROP = {"Popsicle stick?", "Tightrope in the wind", "Paddington Bear's Aunt Lucy", "Bookbag"}
def norm_key(w):
    """Duplicate-check key. Keeps Arabic letters; folds alef/hamza forms, taa marbuta,
    alef maqsura and diacritics so spelling variants count as the same word."""
    w = w.lower()
    w = re.sub(r"[\u064B-\u065F\u0670\u0640]", "", w)          # harakat, superscript alef, tatweel
    w = re.sub(r"[\u0622\u0623\u0625\u0671]", "\u0627", w)       # آ أ إ ٱ -> ا
    w = w.replace("\u0629", "\u0647").replace("\u0649", "\u064A")  # ة->ه, ى->ي
    return re.sub(r"[\W_]", "", w)
cats, cur = [], None
for path in sorted(glob.glob(os.path.join(ROOT, "src", "words-*.txt"))):
    for raw in open(path, encoding="utf-8"):
        line = raw.strip()
        if not line: continue
        if line.startswith("@"):
            cid, name = line[1:].split("|", 1)
            cur = {"id": cid.strip(), "name": name.strip(), "E": [], "M": [], "H": []}
            cats.append(cur); continue
        tier, body = line.split(":", 1)
        cur[tier.strip()] += [w.strip() for w in body.split(";") if w.strip()]
report, problems = [], []
for c in cats:
    seen = {}
    for t in "EMH":
        out = []
        for w in c[t]:
            if w in DROP: continue
            k = norm_key(w)
            if not k: problems.append(f"{c['id']}: empty key for '{w}'"); continue
            if k in seen:
                problems.append(f"{c['id']}: dup '{w}' ({seen[k]} & {t}) - kept first")
                continue
            if "|" in w: problems.append(f"{c['id']}: pipe in '{w}'")
            seen[k] = t; out.append(w)
        c[t] = out
    report.append((c["id"], len(c["E"]), len(c["M"]), len(c["H"])))
os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
payload = [{"id": c["id"], "name": c["name"], "e": "|".join(c["E"]), "m": "|".join(c["M"]), "h": "|".join(c["H"])} for c in cats]
open(os.path.join(ROOT, "build", "words.js"), "w", encoding="utf-8").write(
    "const WORDBANK=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n")
tot = 0
for r in report:
    tot += sum(r[1:]); print(f"{r[0]:12s} E{r[1]:4d} M{r[2]:4d} H{r[3]:4d}  = {sum(r[1:])}")
print("TOTAL", tot)
for p in problems: print("NOTE", p)
