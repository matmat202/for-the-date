#!/usr/bin/env python3
"""site/at-sea/data -> site/at-sea/story/story.json: did sailing ships get faster?

    python3 build_story.py          # BUILD_OUT=... writes elsewhere (publish.sh compares)

Everything comes from the files At Sea already ships: the 366 day files and voyages.json.
A day's run is the great-circle distance between one voyage's noon positions on two
consecutive calendar days. Runs under 5 nm (at anchor) and over 350 nm (a position
error: 350 nm is 14.6 knots held for 24 hours) are left out. The eras compared:

  EARLY 1750-1779   LATE 1830-1855   (and, for British ships, which stop in 1830, 1800-1829)

  decades   per fleet, [decade, runs, median nm]
  cells     10-degree squares with >= 100 runs in both eras: [lat0, lon0, nE, medE, nL, medL]
  passages  Dutch voyages logged from home to Batavia whole: first position north of 45N,
            last within 6 deg lat / 12 deg lon of Batavia, >= 80% of days logged:
            [year, ship, company, days, days under sail]

test/story.test.mjs recomputes every quoted number from these arrays with the page's own
layout.js stats() and requires the `check` block below, computed here in python, to agree.
"""
import datetime as dt
import glob
import json
import math
import os
import statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "site", "at-sea", "data")
OUT = os.environ.get("BUILD_OUT", os.path.join(HERE, "site", "at-sea", "story", "story.json"))
NM = 3440.065
EARLY, LATE, BRIT_LATE = (1750, 1779), (1830, 1855), (1800, 1829)
FLEETS = ["ALL", "BRITISH", "DUTCH", "SPANISH"]
HOME = ("TEXEL", "NEDERLAND", "ROTTERDAM", "NIEUWEDIEP", "AMSTERDAM", "MIDDELBURG", "RAMMEKENS",
        "VLISSINGEN", "HELLEVOETSLUIS", "WIELINGEN", "GOEREE", "DEN HELDER", "MAAS")


def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * NM * math.asin(min(1, math.sqrt(h)))


def load():
    pos = {}
    files = sorted(glob.glob(os.path.join(DATA, "[01][0-9]-[0-3][0-9].json")))
    assert len(files) == 366, len(files)
    for f in files:
        d = json.load(open(f))
        m, dd = map(int, d["date"].split("-"))
        for y, v, la, lo, w, *_ in d["rows"]:
            try:
                t = dt.date(y, m, dd)
            except ValueError:  # a 29 February in a non-leap year
                continue
            assert (v, t) not in pos, (v, t)
            pos[(v, t)] = (la, lo, w)
    return pos


def in_era(y, e): return e[0] <= y <= e[1]
def r1(x): return round(x, 1)


def runs(pos, V):
    out = []
    for (v, t), p in pos.items():
        q = pos.get((v, t + dt.timedelta(days=1)))
        if q and None not in (p[0], p[1], q[0], q[1]):
            d = hav(p, q)
            if 5 <= d <= 350:
                out.append((t.year, V[v][1], p[0], p[1], p[2], d))
    return out


def cells(rs, early, late, minn=100):
    c = {}
    for y, nat, la, lo, w, d in rs:
        e = 0 if in_era(y, early) else 1 if in_era(y, late) else None
        if e is not None:
            c.setdefault((math.floor(la / 10) * 10, math.floor(lo / 10) * 10), ([], []))[e].append(d)
    return sorted([k[0], k[1], len(a), r1(st.median(a)), len(b), r1(st.median(b))]
                  for k, (a, b) in c.items() if len(a) >= minn and len(b) >= minn)


def passages(pos, V):
    byv = {}
    for (v, t), p in pos.items():
        byv.setdefault(v, []).append((t, p))
    out = []
    for v, lst in byv.items():
        s = V[v]
        if s[1] != "DUTCH" or "BATAVIA" not in s[5] or not any(h in s[4] for h in HOME):
            continue
        lst.sort()
        (t0, p0), (t1, p1) = lst[0], lst[-1]
        if p0[0] is None or p1[0] is None:
            continue
        days = (t1 - t0).days + 1
        if not (p0[0] > 45 and abs(p1[0] + 6.1) < 6 and abs(p1[1] - 106.8) < 12 and len(lst) / days >= 0.8):
            continue
        sail = sum(1 for (a, p), (b, q) in zip(lst, lst[1:])
                   if (b - a).days == 1 and None not in (p[0], q[0]) and hav(p, q) >= 5)
        out.append([t0.year, s[0], s[3], days, sail])
    return sorted(out)


def wmean_ratio(cs):
    """the early fleet's map: each square's late/early median ratio, weighted by its early runs"""
    num = sum(math.log(c[5] / c[3]) * c[2] for c in cs)
    return math.exp(num / sum(c[2] for c in cs))


def check(D):
    """layout.js stats(), done again here from the same arrays: the test requires agreement."""
    def era_med(fleet, e):
        return D["era"][fleet][e][1]
    P = D["passages"]
    old = [p for p in P if p[0] < 1810]
    new = [p for p in P if p[0] >= 1820]
    c, cb, cs = D["cells"]["ALL"], D["cells"]["BRITISH"], D["cells"]["SPANISH"]
    return {
        "early": era_med("ALL", "early"), "late": era_med("ALL", "late"),
        "ratio": era_med("ALL", "late") / era_med("ALL", "early"),
        "cells": len(c), "cells_up": sum(1 for x in c if x[5] > x[3]), "cell_ratio": wmean_ratio(c),
        "brit_early": era_med("BRITISH", "early"), "brit_late": era_med("BRITISH", "late"),
        "brit_cells": len(cb), "brit_up": sum(1 for x in cb if x[5] > x[3]),
        "span_early": era_med("SPANISH", "early"), "span_late": era_med("SPANISH", "late"),
        "span_cells": len(cs), "span_up": sum(1 for x in cs if x[5] > x[3]),
        "wind_early": D["wind"][0], "wind_late": D["wind"][1],
        "old_n": len(old), "old_voc": sum(1 for p in old if p[2] == "VOC"), "old_days": st.median(p[3] for p in old), "old_sail": st.median(p[4] for p in old),
        "new_n": len(new), "new_days": st.median(p[3] for p in new), "new_sail": st.median(p[4] for p in new),
    }


def main():
    V = json.load(open(os.path.join(DATA, "voyages.json")))["voyages"]
    pos = load()
    rs = runs(pos, V)
    eras = {"ALL": (EARLY, LATE), "BRITISH": (EARLY, BRIT_LATE), "DUTCH": (EARLY, LATE), "SPANISH": ((1750, 1774), (1790, 1815))}
    D = {
        "source": "CLIWOC 2.1 (García-Herrera et al. 2005), as At Sea ships it in at-sea/data/",
        "runs": len(rs), "voyages": len({v for v, t in pos}),
        "decades": {}, "era": {}, "cells": {},
    }
    for f in FLEETS:
        sub = [r for r in rs if f == "ALL" or r[1] == f]
        by = {}
        for r in sub:
            by.setdefault(r[0] // 10 * 10, []).append(r[5])
        D["decades"][f] = [[k, len(v), r1(st.median(v))] for k, v in sorted(by.items()) if len(v) >= 1000]
        e, l = eras[f]
        D["era"][f] = {"span": [e, l],
                       "early": [len(a := [r[5] for r in sub if in_era(r[0], e)]), r1(st.median(a))],
                       "late": [len(b := [r[5] for r in sub if in_era(r[0], l)]), r1(st.median(b)) if b else None]}
        if f != "DUTCH":
            D["cells"][f] = cells(sub, e, l, 100 if f == "ALL" else 50)
    D["wind"] = [r1(st.median(r[4] / 10 for r in rs if r[4] is not None and in_era(r[0], e))) for e in (EARLY, LATE)]
    D["passages"] = passages(pos, V)
    D["check"] = check(D)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(D, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print("  ".join(f"{k} {v:.3f}" if isinstance(v, float) else f"{k} {v}" for k, v in D["check"].items()))


if __name__ == "__main__":
    main()
