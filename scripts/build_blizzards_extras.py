"""Generate the secondary data for the blizzards insight.

Three outputs:
  1. data/blizzards_temperature.json — daily TMIN/TMAX/TAVG at Chicago O'Hare
     (GHCN-Daily station USW00094846), 2001 → today. Values in °C.
  2. data/blizzards_by_type.json     — per-event, daily counts by primary type
     for the event window vs. the baseline-years window.
  3. data/blizzards_wide.json        — per-event wider window (event_start −7d
     to event_start +14d) actual vs. matched-DOY baseline mean, for the
     snap-back question.

Reads chicago_crimes.csv once, with Primary Type kept.
"""

from __future__ import annotations

import io
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd


REPO_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = REPO_ROOT / "chicago_crimes.csv"
DATA_DIR = REPO_ROOT / "data"

GHCN_STATION = "USW00094846"
GHCN_URL = (
    f"https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/"
    f"access/{GHCN_STATION}.csv"
)

EVENTS = [
    {
        "event": "2011 Groundhog Day blizzard",
        "event_start": "2011-02-01",
        "event_end":   "2011-02-02",
        "baseline_years": [2010, 2012],
    },
    {
        "event": "2014 polar vortex",
        "event_start": "2014-01-06",
        "event_end":   "2014-01-08",
        "baseline_years": [2013, 2015],
    },
    {
        "event": "2019 Chicago polar vortex",
        "event_start": "2019-01-30",
        "event_end":   "2019-01-31",
        "baseline_years": [2018, 2020],
    },
]


def write_json(name: str, payload: object) -> None:
    path = DATA_DIR / name
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    print(f"  wrote {path.relative_to(REPO_ROOT)} ({path.stat().st_size/1024:.1f} KB)")


# ---------- Job 1: temperature ------------------------------------------------

def build_temperature() -> dict:
    print("fetching NOAA GHCN-Daily for O'Hare...")
    with urllib.request.urlopen(GHCN_URL) as resp:
        raw = resp.read()
    print(f"  {len(raw)/1024/1024:.1f} MB downloaded")

    df = pd.read_csv(
        io.BytesIO(raw),
        usecols=["DATE", "TMAX", "TMIN", "TAVG"],
        parse_dates=["DATE"],
    )
    df = df[df["DATE"] >= "2001-01-01"].copy()
    df = df.sort_values("DATE").reset_index(drop=True)

    # GHCN-Daily stores temperatures in tenths of °C.
    for col in ("TMAX", "TMIN", "TAVG"):
        df[col] = df[col] / 10.0

    df["TAVG"] = df["TAVG"].fillna((df["TMAX"] + df["TMIN"]) / 2.0)

    full_index = pd.date_range(df["DATE"].min(), df["DATE"].max(), freq="D")
    present = set(df["DATE"].dt.normalize())
    missing = [d.strftime("%Y-%m-%d") for d in full_index if d not in present]

    def row(d, tmin, tmax, tavg):
        return {
            "date": d.strftime("%Y-%m-%d"),
            "tmin": None if pd.isna(tmin) else round(float(tmin), 1),
            "tmax": None if pd.isna(tmax) else round(float(tmax), 1),
            "tavg": None if pd.isna(tavg) else round(float(tavg), 1),
        }

    daily = [row(r.DATE, r.TMIN, r.TMAX, r.TAVG) for r in df.itertuples()]

    out = {
        "source": "NOAA NCEI GHCN-Daily station access CSV",
        "station_id": GHCN_STATION,
        "station_name": "Chicago O'Hare International Airport, IL US",
        "units": "celsius",
        "start": daily[0]["date"],
        "end":   daily[-1]["date"],
        "rows": len(daily),
        "missing_days": missing,
        "daily": daily,
    }
    return out


# ---------- Job 2: by-type for event windows ---------------------------------

def build_by_type(df: pd.DataFrame) -> dict:
    df = df.copy()
    df["day"] = df["date"].dt.normalize()

    events_out = []
    for e in EVENTS:
        es = pd.Timestamp(e["event_start"])
        ee = pd.Timestamp(e["event_end"])
        n_days = (ee - es).days + 1

        evt = df[(df["day"] >= es) & (df["day"] <= ee)]
        evt_by_type = evt.groupby("type", observed=True).size()

        base_per_year = {}
        for by in e["baseline_years"]:
            bs = pd.Timestamp(by, es.month, es.day)
            be = pd.Timestamp(by, ee.month, ee.day)
            slice_ = df[(df["day"] >= bs) & (df["day"] <= be)]
            base_per_year[by] = slice_.groupby("type", observed=True).size()

        all_types = set(evt_by_type.index)
        for s in base_per_year.values():
            all_types.update(s.index)

        rows = []
        for t in sorted(all_types):
            evt_n = int(evt_by_type.get(t, 0))
            base_vals = [int(base_per_year[by].get(t, 0)) for by in e["baseline_years"]]
            base_avg = float(np.mean(base_vals))
            delta_pct = None
            if base_avg > 0:
                delta_pct = round((evt_n - base_avg) / base_avg * 100, 1)
            rows.append({
                "type": t,
                "event_total": evt_n,
                "event_per_day": round(evt_n / n_days, 1),
                "baseline_per_year": base_vals,
                "baseline_avg": round(base_avg, 1),
                "delta_pct": delta_pct,
            })
        rows.sort(key=lambda r: r["baseline_avg"], reverse=True)

        events_out.append({
            "event": e["event"],
            "event_window": [e["event_start"], e["event_end"]],
            "event_days": n_days,
            "baseline_years": e["baseline_years"],
            "by_type": rows,
        })

    return {"events": events_out}


# ---------- Job 3: wide window snap-back -------------------------------------

def build_wide(daily: pd.DataFrame) -> dict:
    events_out = []
    for e in EVENTS:
        es = pd.Timestamp(e["event_start"])
        win_start = es - pd.Timedelta(days=7)
        win_end   = es + pd.Timedelta(days=14)

        actual = daily.loc[win_start:win_end]["n"]
        actual_rows = [
            {
                "date": d.strftime("%Y-%m-%d"),
                "offset": (d - es).days,
                "n": int(v),
            }
            for d, v in actual.items()
        ]

        baseline_rows = []
        for off in range(-7, 15):
            vals = []
            for by in e["baseline_years"]:
                d = pd.Timestamp(by, es.month, es.day) + pd.Timedelta(days=off)
                if d in daily.index:
                    vals.append(int(daily.loc[d, "n"]))
            if vals:
                baseline_rows.append({
                    "offset": off,
                    "n_avg": round(float(np.mean(vals)), 1),
                })

        events_out.append({
            "event": e["event"],
            "event_start": e["event_start"],
            "event_end": e["event_end"],
            "baseline_years": e["baseline_years"],
            "wide_window": [win_start.strftime("%Y-%m-%d"),
                            win_end.strftime("%Y-%m-%d")],
            "actual": actual_rows,
            "baseline": baseline_rows,
        })

    return {"events": events_out}


# ---------- driver ------------------------------------------------------------

def main() -> int:
    if not CSV_PATH.exists():
        print(f"missing CSV at {CSV_PATH}", file=sys.stderr)
        return 1

    print("Job 1 — temperature")
    temp = build_temperature()
    write_json("blizzards_temperature.json", temp)
    print(f"  coverage: {temp['start']} → {temp['end']}  ({temp['rows']} days, "
          f"{len(temp['missing_days'])} missing)")
    if temp["missing_days"]:
        print(f"  missing examples: {temp['missing_days'][:5]} ...")

    print("\nloading chicago_crimes.csv (this is the slow step)...")
    df = pd.read_csv(
        CSV_PATH,
        usecols=["Date", "Primary Type"],
        dtype={"Primary Type": "category"},
        parse_dates=["Date"],
        date_format="%m/%d/%Y %I:%M:%S %p",
    ).rename(columns={"Date": "date", "Primary Type": "type"})
    df = df.sort_values("date").reset_index(drop=True)
    print(f"  {len(df):,} rows · {df['date'].min().date()} → {df['date'].max().date()}")

    daily = df.assign(day=df["date"].dt.normalize()).groupby("day").size().to_frame("n")
    daily.index = pd.to_datetime(daily.index)

    print("\nJob 2 — by-type for event windows")
    by_type = build_by_type(df)
    write_json("blizzards_by_type.json", by_type)

    print("\nJob 3 — wide windows (event −7d to +14d)")
    wide = build_wide(daily)
    write_json("blizzards_wide.json", wide)

    print("\n=== JOB 2 REPORT — per-type counts (top 10 by baseline) ===")
    for e in by_type["events"]:
        print(f"\n{e['event']}  ({e['event_days']} day(s); baseline {e['baseline_years']})")
        print(f"  {'type':<26} {'evt':>5} {'base/yr':>10} {'delta':>8}")
        for r in e["by_type"][:10]:
            base_str = ",".join(str(x) for x in r["baseline_per_year"])
            delta = f"{r['delta_pct']:+.1f}%" if r["delta_pct"] is not None else "—"
            print(f"  {r['type']:<26} {r['event_total']:>5} {base_str:>10} {delta:>8}")

    print("\n=== JOB 3 REPORT — snap-back (offset days from event_start) ===")
    for e in wide["events"]:
        print(f"\n{e['event']}  (event {e['event_start']} → {e['event_end']})")
        print(f"  {'offset':>6} {'date':>11} {'actual':>7} {'base_avg':>9} {'delta':>8}")
        base_lookup = {b["offset"]: b["n_avg"] for b in e["baseline"]}
        for a in e["actual"]:
            off = a["offset"]
            base = base_lookup.get(off)
            if base:
                delta = f"{(a['n'] - base) / base * 100:+.1f}%"
            else:
                delta = "—"
            base_str = f"{base:.0f}" if base else "—"
            print(f"  {off:>+6} {a['date']:>11} {a['n']:>7} {base_str:>9} {delta:>8}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
