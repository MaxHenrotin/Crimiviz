# Crimiviz

Interactive visualisation of Chicago crime patterns from 2001 to today, built for the EPFL Data Visualization course by Julien Erbland, Mathis Richard and Max Henrotin.

Live: **https://chicagocrime.vercel.app/**

## What it does

Crimiviz lets you explore the 7.8 million reported incidents on file from the Chicago Police Department through three lenses:

- **Map** — a paper-themed map of Chicago with a focus-mode interaction. The 77 community areas are coloured by total volume under the current filter (category, hour, year); clicking an area zooms in and loads every reported incident on file for that neighbourhood. A decile-classified density layer paints the hotspots within the area; at high zoom each individual block centroid becomes a sized circle (number of crimes stacked there, with the count printed on top), and clicking a circle opens the underlying incident records.
- **Trends** *(work in progress)* — seasonality, time-of-day rhythms, distribution by primary type, and arrest-rate disparities.
- **Insights** — three editorial deep-dives: the pre/post COVID shift, the Laquan McDonald accountability collapse (2014 → arrest-rate break), and how extreme Chicago winters empty the streets.

Target audience: urban planners, public-safety researchers, city officials.

## Repository layout

```
.
├── index.html                   single-page entry, 4 tabs
├── assets/
│   ├── css/                     main, components, viz
│   └── js/
│       ├── app.js               non-module: tabs, scroll, year-pill DOM
│       ├── main.js              module: filter wiring, mounts the map and insights
│       ├── data.js              fetch + cache helper
│       ├── filters.js           shared filter state (type, hour, years)
│       ├── insights.js          orchestrator for the three insight stories
│       ├── insights/            D3 prototypes (covid, laquan, blizzards)
│       ├── trends/              D3 modules for the four Trends charts (WIP)
│       └── map/map.js           MapLibre map + popup + density grid
├── data/
│   ├── chicago_communities.topo.json
│   ├── by_community_area.json
│   ├── seasonality.json · time_of_day.json · crime_types.json · arrest_rates.json
│   ├── covid_comparison.json · covid_by_type.json · covid_by_hour.json
│   ├── insights_covid.json · insights_laquan.json · insights_blizzards.json
│   ├── blizzards_by_type.json · blizzards_temperature.json · blizzards_wide.json
│   ├── meta.json
│   └── points/                  77 community areas → 78 GeoJSON (Austin / CA 25 split in two to stay under GitHub's 100 MB ceiling) + manifest
├── scripts/                     Python pipeline that produces data/
├── notebooks/                   EDA notebook driving the Insights stories
├── data_exploration.ipynb       exploratory notebook (M1)
├── milestone1.pdf · milestone2.pdf · milestone3.pdf
├── process_book.md              narrative behind the project
└── process_book.pdf             exported process book (final deliverable)
```

The raw `chicago_crimes.csv` (1.9 GB) is gitignored. `fetch_and_build.py` and `build_topojson.py` hit the Chicago Data Portal directly and don't need it; rebuilding the per-area points (`build_points_per_area.py`) requires the CSV — grab it from the Kaggle mirror.

## Technical setup

### Prerequisites

- Python 3.10+ (only required to rebuild the data files)
- Any modern browser

### Run the site locally

```bash
git clone <repo-url>
cd Crimiviz
python3 -m http.server 8000
# open http://localhost:8000
```

The site reads `data/` directly. No build step.

### Rebuild the data

The `data/` files are checked in. To refresh them:

```bash
cd scripts
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python fetch_and_build.py          # ~2 min · Socrata aggregates
python build_topojson.py           # ~5 s · community-area boundaries
python build_points_per_area.py    # ~10 min · 78 per-area GeoJSON + manifest
python build_insights_data.py      # aggregates for the three insight stories
python build_covid_extras.py       # COVID-specific by_type / by_hour deltas
python build_blizzards_extras.py   # blizzard temperature series + wide pivot
```

`fetch_and_build.py` and `build_topojson.py` hit the Chicago Data Portal directly (no raw download). `build_points_per_area.py` reads the local `chicago_crimes.csv` to emit one GeoJSON per community area, with the largest area (Austin / CA 25) split by year so every file stays under GitHub's 100 MB per-file ceiling. A small `data/points/_manifest.json` tells the front-end which files belong to which area.

### Deployment

The repository is linked to a Vercel project that auto-deploys `main`. There is no build command — Vercel serves the static files as-is.

## Stack

- Vanilla HTML / CSS / JavaScript (ES modules + one non-module script, no bundler)
- **MapLibre GL JS v4** for the WebGL map; **D3.js v7** + topojson-client for the Insights story charts (and the Trends charts, work in progress); both loaded via CDN through a native `<script type="importmap">`
- CARTO Light no-labels raster tiles for the basemap, OpenMapTiles glyph PBFs for symbol labels
- Python 3 (`requests`, `tqdm`, `topojson`) for the data pipeline

## Data

- Source: [Chicago Data Portal — Crimes 2001 to Present](https://data.cityofchicago.org/Public-Safety/Crimes-2001-to-Present/ijzp-q8t2/about_data) (Socrata SODA API, resource id `ijzp-q8t2`)
- Boundaries: [Chicago Community Areas (current)](https://data.cityofchicago.org/Facilities-Geographic-Boundaries/Boundaries-Community-Areas-current-/igwz-8jzy) converted to TopoJSON
- Mirror used during EDA: [Kaggle](https://www.kaggle.com/datasets/aliafzal9323/chicago-crime-dataset-2024-2026)

A note on individual incidents: the CPD anonymises coordinates to the **nearest block centroid** for privacy. Many crimes therefore share the same lat/lon. The map handles this by aggregating points per unique GPS coordinate — each circle on the map represents one block, sized by the number of crimes stacked there.

## Milestones

- **Milestone 1** (10%) — `milestone1.pdf` — requirements and dataset feasibility.
- **Milestone 2** (10%) — `milestone2.pdf` — sketches, tooling and MVP scope.
- **Milestone 3** (80%) — `milestone3.pdf` — final delivery (this README, the live site, the process book PDF and the screencast).
