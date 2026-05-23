"""Pre-compute the view-ready JSON files for the Insights tab.

Reads the local chicago_crimes.csv once, freezes the exploration notebook's
pass-2 logic (notebooks/insights_exploration.ipynb) into three files in data/.

Precision: counts as int, percentages rounded to 1 decimal, rates to 4 decimals.
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


def load_daily() -> tuple[pd.DataFrame, pd.DataFrame]:
    usecols = ["Date", "Primary Type", "Arrest"]
    dtype = {"Primary Type": "category", "Arrest": "bool"}
    df = pd.read_csv(
        CSV_PATH,
        usecols=usecols,
        dtype=dtype,
        parse_dates=["Date"],
        date_format="%m/%d/%Y %I:%M:%S %p",
    )
    df = df.rename(columns={"Date": "date", "Primary Type": "type", "Arrest": "arrest"})
    df = df.sort_values("date").reset_index(drop=True)
    df["day"] = df["date"].dt.normalize()

    daily = df.groupby("day").agg(n=("arrest", "size"), arrests=("arrest", "sum"))
    return df, daily


def pct(x: float, decimals: int = 1) -> float:
    return round(float(x), decimals)


def write_json(name: str, payload: object) -> int:
    path = DATA_DIR / name
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    size = path.stat().st_size
    print(f"  wrote {path.relative_to(REPO_ROOT)} ({size/1024:.1f} KB)")
    return size


def build_covid(daily: pd.DataFrame) -> dict:
    s2020 = daily.loc["2020-01-01":"2020-12-31"]["n"]
    series_2020 = [
        {"date": d.strftime("%Y-%m-%d"), "n": int(v)} for d, v in s2020.items()
    ]

    by_doy: dict[int, list[int]] = {}
    for y in (2018, 2019):
        wy = daily.loc[f"{y}-01-01":f"{y}-12-31"]["n"]
        for d, v in wy.items():
            doy = (d - pd.Timestamp(f"{y}-01-01")).days
            by_doy.setdefault(doy, []).append(int(v))
    baseline_1819 = [
        {"doy": doy, "n_avg": round(float(np.mean(vals)), 1)}
        for doy, vals in sorted(by_doy.items())
    ]

    lock_start, lock_end = "03-21", "05-01"
    def window(year: int) -> pd.Series:
        return daily.loc[f"{year}-{lock_start}":f"{year}-{lock_end}"]["n"]
    actual_2020 = window(2020).mean()
    baseline = pd.concat([window(2018), window(2019)]).mean()
    lockdown_drop_pct = pct((actual_2020 - baseline) / baseline * 100)

    spike_start = pd.Timestamp("2020-05-29")
    spike_end = pd.Timestamp("2020-06-05")
    spike = daily.loc[spike_start:spike_end]["n"]
    peak_value = int(spike.max())
    peak_day = spike.idxmax().date().isoformat()
    pre_base = float(daily.loc["2020-05-11":"2020-05-24"]["n"].mean())
    floyd_peak_pct = pct((peak_value - pre_base) / pre_base * 100)

    return {
        "series_2020": series_2020,
        "baseline_1819": baseline_1819,
        "lockdown_drop_pct": lockdown_drop_pct,
        "lockdown_window": ["2020-03-21", "2020-05-01"],
        "_lockdown_verified": True,
        "lockdown_actual_mean": round(float(actual_2020), 1),
        "lockdown_baseline_mean": round(float(baseline), 1),
        "floyd_peak_date": peak_day,
        "_floyd_verified": True,
        "floyd_peak_n": peak_value,
        "floyd_peak_pct": floyd_peak_pct,
        "floyd_baseline_n": round(pre_base, 1),
        "floyd_spike_window": ["2020-05-29", "2020-06-05"],
        "floyd_baseline_window": ["2020-05-11", "2020-05-24"],
    }


def build_laquan(df: pd.DataFrame) -> dict:
    monthly = df.set_index("date").resample("MS").agg(
        n=("arrest", "size"),
        arrests=("arrest", "sum"),
    )
    # Drop the trailing month if the CSV ends mid-month — otherwise the final
    # bucket is a partial period and the volume line dips artificially.
    max_day = df["date"].max()
    last_complete = pd.Timestamp(max_day.year, max_day.month, 1)
    if max_day < last_complete + pd.offsets.MonthEnd(0):
        monthly = monthly.loc[monthly.index < last_complete]
    monthly["arrest_rate"] = monthly["arrests"] / monthly["n"]
    monthly["rate_12m"] = monthly["arrest_rate"].rolling(12).mean()

    series = []
    for d, row in monthly.iterrows():
        rate_12m = row["rate_12m"]
        series.append({
            "month": d.strftime("%Y-%m"),
            "volume": int(row["n"]),
            "arrest_rate": round(float(row["arrest_rate"]), 4),
            "arrest_rate_12m": None if pd.isna(rate_12m) else round(float(rate_12m), 4),
        })

    event = pd.Timestamp("2015-11-24")
    pre = monthly.loc[event - pd.DateOffset(months=24):event - pd.Timedelta(days=1)]
    post = monthly.loc[event:event + pd.DateOffset(months=24)]
    pre_rate = pre["arrests"].sum() / pre["n"].sum()
    post_rate = post["arrests"].sum() / post["n"].sum()
    pre_vol = int(pre["n"].sum())
    post_vol = int(post["n"].sum())

    return {
        "series": series,
        "rate_before": round(float(pre_rate), 4),
        "rate_after": round(float(post_rate), 4),
        "rate_drop_pp": pct((post_rate - pre_rate) * 100),
        "volume_before": pre_vol,
        "volume_after": post_vol,
        "volume_change_pct": pct((post_vol - pre_vol) / pre_vol * 100),
        "video_date": "2015-11-24",
        "_video_verified": True,
        "consent_decree_date": "2019-01-31",
        "_decree_verified": True,
        "window_months": 24,
        "_rate_method": "volume-weighted: arrests.sum() / n.sum() over the window",
    }


def build_blizzards(daily: pd.DataFrame) -> dict:
    events = [
        {
            "event": "2011 Groundhog Day blizzard",
            "event_year": 2011,
            "baseline_years": [2010, 2012],
            "event_start": "2011-02-01",
            "event_end": "2011-02-02",
            "win_start": "01-15",
            "win_end": "02-20",
        },
        {
            "event": "2014 polar vortex",
            "event_year": 2014,
            "baseline_years": [2013, 2015],
            "event_start": "2014-01-06",
            "event_end": "2014-01-08",
            "win_start": "01-01",
            "win_end": "01-25",
            "note": "Jan 1 spike in the window is New Year's Eve carry-over, not weather.",
        },
        {
            "event": "2019 Chicago polar vortex",
            "event_year": 2019,
            "baseline_years": [2018, 2020],
            "event_start": "2019-01-30",
            "event_end": "2019-01-31",
            "win_start": "01-15",
            "win_end": "02-15",
        },
    ]

    out = []
    for e in events:
        ws, we = e["win_start"], e["win_end"]
        y = e["event_year"]
        event_window = daily.loc[f"{y}-{ws}":f"{y}-{we}"]["n"]
        window = [
            {"date": d.strftime("%Y-%m-%d"), "n": int(v)}
            for d, v in event_window.items()
        ]

        by_doy: dict[int, list[int]] = {}
        for by in e["baseline_years"]:
            bw = daily.loc[f"{by}-{ws}":f"{by}-{we}"]["n"]
            for d, v in bw.items():
                doy = (d - pd.Timestamp(f"{by}-01-01")).days
                by_doy.setdefault(doy, []).append(int(v))
        baseline = [
            {"doy": doy, "n_avg": round(float(np.mean(vals)), 1)}
            for doy, vals in sorted(by_doy.items())
        ]

        actual = float(daily.loc[e["event_start"]:e["event_end"]]["n"].min())
        base_vals = [
            daily.loc[f"{by}-{e['event_start'][5:]}":f"{by}-{e['event_end'][5:]}"]["n"].mean()
            for by in e["baseline_years"]
        ]
        base = float(np.mean(base_vals))
        drop_pct = pct((actual - base) / base * 100)

        entry = {
            "event": e["event"],
            "event_start": e["event_start"],
            "event_end": e["event_end"],
            "_date_verified": True,
            "baseline_years": e["baseline_years"],
            "window": window,
            "baseline": baseline,
            "lowest_day_n": int(actual),
            "baseline_mean_n": round(base, 1),
            "drop_pct": drop_pct,
        }
        if "note" in e:
            entry["note"] = e["note"]
        out.append(entry)

    return {"events": out}


def main() -> int:
    if not CSV_PATH.exists():
        print(f"missing CSV at {CSV_PATH}", file=sys.stderr)
        return 1

    print("loading CSV...")
    df, daily = load_daily()
    print(f"  {len(df):,} rows · {df['date'].min().date()} → {df['date'].max().date()}")

    print("building insights_covid.json...")
    covid = build_covid(daily)
    write_json("insights_covid.json", covid)

    print("building insights_laquan.json...")
    laquan = build_laquan(df)
    write_json("insights_laquan.json", laquan)

    print("building insights_blizzards.json...")
    blizzards = build_blizzards(daily)
    write_json("insights_blizzards.json", blizzards)

    print()
    print("headline numbers (cross-check against notebook pass 2):")
    print(f"  COVID lockdown drop          : {covid['lockdown_drop_pct']:+.1f}%  "
          f"(2020 {covid['lockdown_actual_mean']:.0f}/day vs baseline {covid['lockdown_baseline_mean']:.0f}/day)")
    print(f"  Floyd peak                   : {covid['floyd_peak_date']}  "
          f"n={covid['floyd_peak_n']}  → {covid['floyd_peak_pct']:+.1f}% vs baseline {covid['floyd_baseline_n']:.0f}/day")
    print(f"  Laquan arrest rate before    : {laquan['rate_before']*100:.1f}%")
    print(f"  Laquan arrest rate after     : {laquan['rate_after']*100:.1f}%")
    print(f"  Laquan rate drop             : {laquan['rate_drop_pp']:+.1f} pp")
    print(f"  Laquan volume change         : {laquan['volume_change_pct']:+.1f}%")
    for ev in blizzards["events"]:
        print(f"  {ev['event']:<32}: {ev['drop_pct']:+.1f}%  "
              f"(lowest {ev['lowest_day_n']} vs baseline {ev['baseline_mean_n']:.0f})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
