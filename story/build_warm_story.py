#!/usr/bin/env python3
"""research/warm-data.json.gz -> site/story/story.json: does "warmer than usual" still mean 3 days in 10?

    python3 build_warm_story.py        # BUILD_OUT=... writes elsewhere (publish.sh compares)

For the Date ranks a day against the 450 days around its date in 1991-2020 (the 15 days
centred on it, each of 30 years) and calls it warmer than usual at the 70th percentile and
up, cooler at the 30th and below. By construction, then, 3 days in 10 of those 30 years were
"warmer than usual" and 3 "cooler". This counts how the days since then fall, with the
page's own rule (clim-logic.js sameDates / percentile / verdict, re-done here in python):

  cities    [name, country, n, warm, cool, much_warm, record, n_lo, warm_lo, cool_lo]  2021-2025
  years     [year, n, warm, cool]  every city's highs pooled, 1991-2025
  stations  [name, n, warm, cool, n_lo, warm_lo, cool_lo]  2021-2025, thermometers (GHCN)
            against their own 1991-2020; a date needs >= MIN_ST of its 450 days on record
  seam      [name, var, first year, [annual means], [annual means], [n, warm, cool]]  the
            archive without a model ('best match': ERA5-Land to 2016, IFS 9 km from 2017) and
            pinned to <model>; the tally is 2021-2025 as the page used to rank it (best match)

test/warm-story.test.mjs recomputes every count from the same file with the page's own
clim-logic.js and requires the `check` block below, computed here, to agree.
"""
import datetime as dt
import gzip
import json
import os
import statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
# in the sandbox the data sits in research/; in the published repo, beside this file (story/)
SRC = next(p for p in (os.path.join(HERE, "research", "warm-data.json.gz"), os.path.join(HERE, "warm-data.json.gz")) if os.path.exists(p))
OUT = os.environ.get("BUILD_OUT", os.path.join(HERE, "site", "story", "story.json"))
FROM, TO, HALF = 1991, 2020, 7
SINCE, UNTIL = dt.date(2021, 1, 1), dt.date(2025, 12, 31)
MIN_ST = 300


def leap(y):
    return y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)


def index(s, key):
    t0 = dt.date.fromisoformat(s["start"])
    return {(t0 + dt.timedelta(i)).isoformat(): v for i, v in enumerate(s[key]) if v is not None}


def window(S, m, d):
    out = []
    for y in range(FROM, TO + 1):
        c = dt.date(y, 2, 28) if (m == 2 and d == 29 and not leap(y)) else dt.date(y, m, d)
        for k in range(-HALF, HALF + 1):
            v = S.get((c + dt.timedelta(k)).isoformat())
            if v is not None:
                out.append(v)
    return out


def pct(sm, x):
    return 100 * (sum(s < x for s in sm) + sum(s == x for s in sm) / 2) / len(sm)


def tally(S, a, b, minn=1):
    """-> {year: [n, warm, cool, much_warm, record]} over the days a..b"""
    memo, out, t = {}, {}, a
    while t <= b:
        x = S.get(t.isoformat())
        if x is not None:
            k = (t.month, t.day)
            if k not in memo:
                memo[k] = window(S, *k)
            sm = memo[k]
            if len(sm) >= minn:
                p = pct(sm, x)
                r = out.setdefault(t.year, [0, 0, 0, 0, 0])
                r[0] += 1; r[1] += p >= 70; r[2] += p <= 30; r[3] += p >= 90; r[4] += x > max(sm)
        t += dt.timedelta(1)
    return out


def total(by):
    return [sum(r[i] for r in by.values()) for i in range(5)]


def annual(s, key):
    by = {}
    for t, v in index(s, key).items():
        by.setdefault(int(t[:4]), []).append(v)
    ys = [y for y in sorted(by) if FROM <= y <= 2025 and len(by[y]) >= 360]
    return ys[0], [round(st.fmean(by[y]) / 10, 2) for y in ys]


def check(D):
    C, S = D["cities"], D["stations"]
    n, w, c = (sum(r[i] for r in C) for i in (2, 3, 4))
    nl, wl, cl = (sum(r[i] for r in C) for i in (7, 8, 9))
    sn, sw, sc = (sum(r[i] for r in S) for i in (1, 2, 3))
    base = [y for y in D["years"] if y[0] <= TO]
    return {
        "warm": w / n, "cool": c / n, "warm_lo": wl / nl, "cool_lo": cl / nl,
        "much_warm": sum(r[5] for r in C) / n, "record": sum(r[6] for r in C) / n,
        "cities_more_warm": sum(r[3] > r[4] for r in C),
        "st_warm": sw / sn, "st_cool": sc / sn,
        "st_warm_lo": sum(r[5] for r in S) / sum(r[4] for r in S), "st_cool_lo": sum(r[6] for r in S) / sum(r[4] for r in S),
        "st_more_warm": sum(r[2] > r[3] for r in S),
        "base_warm": sum(y[2] for y in base) / sum(y[1] for y in base),
    }


def main():
    with gzip.open(SRC) as f:
        R = json.load(f)
    D = {"model": R["model"], "since": [SINCE.isoformat(), UNTIL.isoformat()], "cities": [], "years": [], "stations": [], "seam": []}
    pooled = {}
    for s in R["cities"]:
        hi, lo = index(s, "hi"), index(s, "lo")
        th = tally(hi, dt.date(FROM, 1, 1), UNTIL)
        for y, r in th.items():
            p = pooled.setdefault(y, [0, 0, 0])
            for i in range(3):
                p[i] += r[i]
        a = total({y: r for y, r in th.items() if y >= SINCE.year})
        b = total(tally(lo, SINCE, UNTIL))
        D["cities"].append([s["name"], s["country"], *a, b[0], b[1], b[2]])
    D["years"] = [[y, *pooled[y]] for y in sorted(pooled)]
    for s in R["stations"]:
        a = total(tally(index(s, "hi"), SINCE, UNTIL, MIN_ST))
        b = total(tally(index(s, "lo"), SINCE, UNTIL, MIN_ST))
        D["stations"].append([s["name"], a[0], a[1], a[2], b[0], b[1], b[2]])
    pin = {s["name"]: s for s in R["cities"]}
    for s in R["seam"]:
        for key in ("hi", "lo"):
            y0, best = annual(s, key)
            y1, pinned = annual(pin[s["name"]], key)
            assert y0 == y1 == FROM, (s["name"], key, y0, y1)
            n, w, c, *_ = total(tally(index(s, key), SINCE, UNTIL))
            D["seam"].append([s["name"], key, y0, best, pinned, [n, w, c]])
    D["check"] = check(D)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(D, f, ensure_ascii=False, separators=(",", ":"))
    print("  ".join(f"{k} {v:.3f}" if isinstance(v, float) else f"{k} {v}" for k, v in D["check"].items()))


if __name__ == "__main__":
    main()
