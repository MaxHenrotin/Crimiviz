"""Secondary aggregates for the COVID insight card.

Two outputs:
  1. data/covid_by_type.json — weekly counts by primary type for 2020 and
     a 2018/19 baseline at matched week-of-year.
  2. data/covid_by_hour.json — weekly counts by hour-of-day (0–23) for
     2020 and the same 2018/19 baseline.

This step is *data only*. No charts. Print a noise report so the choice
of any future chart is based on real counts, not headline framing.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd


REPO_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = REPO_ROOT / "chicago_crimes.csv"
DATA_DIR = REPO_ROOT / "data"

LOCKDOWN = ("2020-03-21", "2020-05-01")
FLOYD_SPIKE = ("2020-05-29", "2020-06-05")  # 8 days
FLOYD_PEAK = "2020-05-31"


def write_json(name, payload):
    path = DATA_DIR / name
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    print(f"  wrote {path.relative_to(REPO_ROOT)} ({path.stat().st_size/1024:.1f} KB)")


def load() -> pd.DataFrame:
    print("loading CSV (keeping timestamp for hour-of-day)…")
    df = pd.read_csv(
        CSV_PATH,
        usecols=["Date", "Primary Type"],
        dtype={"Primary Type": "category"},
        parse_dates=["Date"],
        date_format="%m/%d/%Y %I:%M:%S %p",
    ).rename(columns={"Date": "ts", "Primary Type": "type"})
    df = df[(df["ts"] >= "2018-01-01") & (df["ts"] < "2021-01-01")].copy()
    df["day"] = df["ts"].dt.normalize()
    df["year"] = df["ts"].dt.year
    df["hour"] = df["ts"].dt.hour
    # ISO-week tuple — same week across years aligns by week-of-year. Use
    # Monday-start by deriving the Monday of each row's week.
    df["week_start"] = df["day"] - pd.to_timedelta(df["day"].dt.weekday, unit="d")
    df["woy"] = df["week_start"].dt.isocalendar().week.astype(int)
    print(f"  {len(df):,} rows · {df['ts'].min().date()} → {df['ts'].max().date()}")
    return df


def build_by_type(df: pd.DataFrame) -> dict:
    d2020 = df[df["year"] == 2020]
    d18_19 = df[df["year"].isin([2018, 2019])]

    types_2020 = (
        d2020.groupby(["week_start", "type"], observed=True).size()
        .reset_index(name="n")
    )

    weekly_2020 = []
    for ws, grp in types_2020.groupby("week_start"):
        weekly_2020.append({
            "week_start": ws.strftime("%Y-%m-%d"),
            "woy": int(pd.Timestamp(ws).isocalendar().week),
            "total": int(grp["n"].sum()),
            "by_type": [
                {"type": str(r.type), "n": int(r.n)}
                for r in grp.itertuples()
            ],
        })

    types_baseline = (
        d18_19.groupby(["woy", "type"], observed=True).size()
        .reset_index(name="n")
    )
    # Two-year mean per (woy, type) so baseline scales like a single week.
    baseline = []
    for woy, grp in types_baseline.groupby("woy"):
        rows = []
        for t, sub in grp.groupby("type", observed=True):
            rows.append({"type": str(t), "n_avg": round(float(sub["n"].sum()) / 2, 1)})
        baseline.append({"woy": int(woy), "by_type": rows})

    return {
        "year": 2020,
        "baseline_years": [2018, 2019],
        "weekly_2020": weekly_2020,
        "baseline_by_woy": baseline,
    }


def build_by_hour(df: pd.DataFrame) -> dict:
    d2020 = df[df["year"] == 2020]
    d18_19 = df[df["year"].isin([2018, 2019])]

    hourly_2020 = []
    for ws, grp in d2020.groupby("week_start"):
        counts = grp.groupby("hour").size().reindex(range(24), fill_value=0)
        hourly_2020.append({
            "week_start": ws.strftime("%Y-%m-%d"),
            "woy": int(pd.Timestamp(ws).isocalendar().week),
            "total": int(counts.sum()),
            "by_hour": [int(c) for c in counts.values],
        })

    baseline = []
    for woy, grp in d18_19.groupby("woy"):
        counts = grp.groupby("hour").size().reindex(range(24), fill_value=0)
        baseline.append({
            "woy": int(woy),
            "by_hour": [round(float(c) / 2, 1) for c in counts.values],
        })

    return {
        "year": 2020,
        "baseline_years": [2018, 2019],
        "weekly_2020": hourly_2020,
        "baseline_by_woy": baseline,
    }


def report_by_type(df: pd.DataFrame) -> None:
    print("\n=== JOB 1 REPORT — composition shifts (counts, not percentages) ===")
    ls, le = LOCKDOWN
    fs, fe = FLOYD_SPIKE

    def by_type_window(start, end):
        m = (df["day"] >= start) & (df["day"] <= end)
        return df.loc[m].groupby("type", observed=True).size()

    def by_type_window_year(start, end, year):
        # shift window by (year - 2020) years
        start_y = pd.Timestamp(start).replace(year=year).strftime("%Y-%m-%d")
        end_y = pd.Timestamp(end).replace(year=year).strftime("%Y-%m-%d")
        return by_type_window(start_y, end_y)

    for label, (start, end) in [("LOCKDOWN", LOCKDOWN), ("FLOYD UNREST", FLOYD_SPIKE)]:
        actual = by_type_window(start, end)
        base_18 = by_type_window_year(start, end, 2018)
        base_19 = by_type_window_year(start, end, 2019)
        base_avg = ((base_18.add(base_19, fill_value=0)) / 2).round(1)
        days = (pd.Timestamp(end) - pd.Timestamp(start)).days + 1
        print(f"\n{label} window {start} → {end}  ({days} days)")
        all_types = sorted(set(actual.index) | set(base_avg.index),
                           key=lambda t: -int(actual.get(t, 0)))
        print(f"  {'type':<28} {'2020':>7} {'18/19 avg':>10} {'delta':>8}")
        for t in all_types[:15]:
            a = int(actual.get(t, 0))
            b = float(base_avg.get(t, 0))
            d_str = f"{(a-b)/b*100:+.0f}%" if b > 0 else "—"
            print(f"  {t:<28} {a:>7} {b:>10.1f} {d_str:>8}")


def report_by_hour(df: pd.DataFrame) -> None:
    print("\n=== JOB 2 REPORT — hour-of-day shifts (counts per hour, summed across window) ===")

    def hour_counts(start, end):
        m = (df["day"] >= start) & (df["day"] <= end)
        return df.loc[m].groupby("hour").size().reindex(range(24), fill_value=0)

    for label, (start, end), baseline_yrs in [
        ("LOCKDOWN", LOCKDOWN, [2018, 2019]),
        ("FLOYD UNREST", FLOYD_SPIKE, [2018, 2019]),
    ]:
        actual = hour_counts(start, end)
        days = (pd.Timestamp(end) - pd.Timestamp(start)).days + 1
        base_total = pd.Series(0, index=range(24), dtype=float)
        for y in baseline_yrs:
            s = pd.Timestamp(start).replace(year=y).strftime("%Y-%m-%d")
            e = pd.Timestamp(end).replace(year=y).strftime("%Y-%m-%d")
            base_total = base_total.add(hour_counts(s, e).astype(float), fill_value=0)
        base_avg = (base_total / len(baseline_yrs)).round(1)
        per_hour_per_day = actual.sum() / 24 / days
        per_hour_per_day_base = base_avg.sum() / 24 / days
        print(f"\n{label} {start} → {end}  ({days} days)  "
              f"actual {actual.sum()} events, avg {per_hour_per_day:.1f}/hour/day · "
              f"baseline ~{base_avg.sum():.0f} events, avg {per_hour_per_day_base:.1f}/hour/day")
        print(f"  {'hour':>4} {'2020':>7} {'18/19 avg':>10} {'delta':>7}")
        for h in range(24):
            a = int(actual[h]); b = float(base_avg[h])
            d_str = f"{(a-b)/b*100:+.0f}%" if b > 0 else "—"
            print(f"  {h:>4}h {a:>7} {b:>10.1f} {d_str:>7}")


def build_window_aggregates(df: pd.DataFrame) -> dict:
    """Pre-aggregate the exact lockdown and Floyd windows (not the calendar
    weeks that straddle them). The chart layer needs raw counts on the
    actual 42-day lockdown and 8-day Floyd windows; doing that here avoids
    approximation in JS."""
    def window_by_type(start, end, year):
        s = pd.Timestamp(start).replace(year=year)
        e = pd.Timestamp(end).replace(year=year)
        m = (df["day"] >= s) & (df["day"] <= e)
        return df.loc[m].groupby("type", observed=True).size()

    def window_by_hour(start, end, year):
        s = pd.Timestamp(start).replace(year=year)
        e = pd.Timestamp(end).replace(year=year)
        m = (df["day"] >= s) & (df["day"] <= e)
        return df.loc[m].groupby("hour").size().reindex(range(24), fill_value=0)

    def combine_window(start, end):
        a_type = window_by_type(start, end, 2020).to_dict()
        b18_type = window_by_type(start, end, 2018).to_dict()
        b19_type = window_by_type(start, end, 2019).to_dict()
        a_hour = window_by_hour(start, end, 2020).tolist()
        b18_hour = window_by_hour(start, end, 2018).tolist()
        b19_hour = window_by_hour(start, end, 2019).tolist()
        all_types = sorted(set(a_type) | set(b18_type) | set(b19_type))
        days = (pd.Timestamp(end) - pd.Timestamp(start)).days + 1
        by_type = []
        for t in all_types:
            a = int(a_type.get(t, 0))
            b18 = int(b18_type.get(t, 0))
            b19 = int(b19_type.get(t, 0))
            base_avg = round((b18 + b19) / 2, 1)
            by_type.append({
                "type": str(t),
                "n_2020": a,
                "n_baseline_avg": base_avg,
                "delta_pct": round((a - base_avg) / base_avg * 100, 1) if base_avg > 0 else None,
            })
        by_hour = []
        for h in range(24):
            a = int(a_hour[h])
            base_avg = round((b18_hour[h] + b19_hour[h]) / 2, 1)
            by_hour.append({
                "hour": h,
                "n_2020": a,
                "n_baseline_avg": base_avg,
            })
        return {
            "window": [start, end],
            "days": days,
            "by_type": by_type,
            "by_hour": by_hour,
        }

    return {
        "lockdown_42d": combine_window(*LOCKDOWN),
        "floyd_8d":     combine_window(*FLOYD_SPIKE),
        "floyd_peak_2d": combine_window("2020-05-30", "2020-05-31"),
    }


def main() -> int:
    if not CSV_PATH.exists():
        print(f"missing CSV at {CSV_PATH}", file=sys.stderr)
        return 1
    df = load()
    print("\nbuilding covid_by_type.json…")
    by_type = build_by_type(df)
    by_type["windows"] = build_window_aggregates(df)
    write_json("covid_by_type.json", by_type)
    print("\nbuilding covid_by_hour.json…")
    by_hour = build_by_hour(df)
    by_hour["windows"] = by_type["windows"]  # same windows, by_hour also lives there
    write_json("covid_by_hour.json", by_hour)
    report_by_type(df)
    report_by_hour(df)
    return 0


if __name__ == "__main__":
    sys.exit(main())
