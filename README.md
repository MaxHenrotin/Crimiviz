# Crimiviz

Interactive visualisation of Chicago crime patterns from 2001 to today, built for the EPFL Data Visualization course by Julien Erbland, Mathis Richard and Max Henrotin.

Website: **https://chicagocrime.vercel.app/**

Presentation video: **https://www.youtube.com/watch?v=UxZBNNk3OMc**


## What it does

The Chicago Police Department dataset holds 8,547,082 reported incidents (2001 to April 2026), of which roughly 7.8 million carry coordinates and are plotted on the map (mainly missing geolocation in the earliest years, notably 2001). Crimiviz explores them through three tabs:

- **Map**: a paper-themed map of Chicago with a focus-mode interaction. The 77 community areas are coloured by total volume under the current filter (category, hour, year). Clicking an area zooms in and loads every geolocated incident for that neighbourhood. A decile-classified density layer paints the hotspots; at high zoom each block centroid becomes a sized circle (number of crimes stacked there, with the count printed on top), and clicking a circle opens the underlying incident records. Filters are available for crime type, hour and year, with an automatic play button to animate through values.
- **Trends**: four readings across twenty-five years. *Composition* (volume by primary crime type), *Outcomes* (arrest rate by type against the 25.1% citywide baseline), *Crime Clock* (hourly signature of each offence over the 24-hour day), and an *Evolution* streamgraph (how the mix of crime shifts across the full 2001 to 2026 span).
- **Insights**: three editorial deep-dives. The 2020 lockdown and unrest shift, the Laquan McDonald arrest-rate break (the sustained drop in arrest rates after the November 2015 dashcam video release, with crime volume holding steady), and how extreme Chicago winters empty the streets.

Target audience: urban planners, public-safety researchers, city officials but mostly curious people!

## Repository layout

```
.
├── index.html                   single-page entry, home page + 3 tabs
├── assets/
│   ├── css/                     main, components, viz
│   └── js/
│       ├── app.js               non-module: tabs, scroll, year-pill DOM
│       ├── main.js              module: filter wiring, mounts the map and insights
│       ├── data.js              fetch + cache helper
│       ├── filters.js           shared filter state (type, hour, years)
│       ├── insights.js          orchestrator for the three insight stories
│       ├── insights/            D3 prototypes (covid, laquan, blizzards)
│       ├── trends/              D3 modules for the four Trends charts
│       └── map/map.js           MapLibre map + popup + density grid
├── data/
│   ├── chicago_communities.topo.json
│   ├── by_community_area.json
│   ├── seasonality.json, time_of_day.json, crime_types.json, arrest_rates.json
│   ├── covid_comparison.json, covid_by_type.json, covid_by_hour.json
│   ├── insights_covid.json, insights_laquan.json, insights_blizzards.json
│   ├── blizzards_by_type.json, blizzards_temperature.json, blizzards_wide.json
│   ├── meta.json
│   └── points/                  77 community areas as 78 GeoJSON (Austin / CA 25 split in two to stay under GitHub's 100 MB ceiling) + manifest
├── scripts/                     Python pipeline that produces data/
├── notebooks/                   EDA notebook driving the Insights stories
├── data_exploration.ipynb       exploratory notebook (M1)
├── milestone1.pdf, milestone2.pdf
└── process_book.pdf             exported process book (final deliverable)
```

The raw `chicago_crimes.csv` (1.9 GB) is gitignored. `fetch_and_build.py` and `build_topojson.py` hit the Chicago Data Portal directly and don't need it; rebuilding the per-area points (`build_points_per_area.py`) requires the CSV, available from the Kaggle mirror.

## Technical setup

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
python fetch_and_build.py          # ~2 min, Socrata aggregates
python build_topojson.py           # ~5 s, community-area boundaries
python build_points_per_area.py    # ~10 min, 78 per-area GeoJSON + manifest
python build_insights_data.py      # aggregates for the three insight stories
python build_covid_extras.py       # COVID-specific by_type / by_hour deltas
python build_blizzards_extras.py   # blizzard temperature series + wide pivot
```

`fetch_and_build.py` and `build_topojson.py` hit the Chicago Data Portal directly (no raw download). `build_points_per_area.py` reads the local `chicago_crimes.csv` to emit one GeoJSON per community area, with the largest area (Austin / CA 25) split by year so every file stays under GitHub's file limit. A small `data/points/_manifest.json` tells the front-end which files belong to which area.

> **Note on the map points.** `fetch_and_build.py` and `build_topojson.py` pull fresh data straight from Socrata, so the choropleth and the Trends charts are updated to the current date. The individual map points, however, are built from a local CSV. For a fresher points snapshot, download an up-to-date export and place it at the repository root as `chicago_crimes.csv` before running `build_points_per_area.py` — either the [Kaggle mirror](https://www.kaggle.com/datasets/aliafzal9323/chicago-crime-dataset-2024-2026) or a fresh CSV export from the [Chicago Data Portal](https://data.cityofchicago.org/Public-Safety/Crimes-2001-to-Present/ijzp-q8t2).

### Deployment

The repository is linked to a Vercel project that auto-deploys `main`. There is no build command; Vercel serves the static files as-is.

## Stack

- Vanilla HTML / CSS / JavaScript (ES modules plus one non-module script, no bundler)
- **MapLibre GL JS v4** for the WebGL map; **D3.js v7** + topojson-client for the Trends and Insights charts; both loaded via CDN through a native `<script type="importmap">`
- CARTO Light no-labels raster tiles for the basemap, OpenMapTiles glyph PBFs for symbol labels
- Python 3 (`requests`, `tqdm`, `topojson`, `numpy`, `pandas`) for the data pipeline

## Data

- Source: [Chicago Data Portal, Crimes 2001 to Present](https://data.cityofchicago.org/Public-Safety/Crimes-2001-to-Present/ijzp-q8t2/about_data) (Socrata SODA API, resource id `ijzp-q8t2`)
- Boundaries: [Chicago Community Areas (current)](https://data.cityofchicago.org/Facilities-Geographic-Boundaries/Boundaries-Community-Areas-current-/igwz-8jzy) converted to TopoJSON.
- Mirror used during EDA: [Kaggle](https://www.kaggle.com/datasets/aliafzal9323/chicago-crime-dataset-2024-2026)
- Snapshot: the `data/` files are frozen at build time (generated 9 May 2026, covering 2001 to 30 April 2026). Re-run the pipeline for a fresher cut.

A note on individual incidents: the CPD anonymises coordinates to the nearest block centroid for privacy. Many crimes therefore share the same lat/lon. The map handles this by aggregating points per unique GPS coordinate, so each circle represents one block, sized by the number of crimes stacked there.

## Milestones

- **Milestone 1** (10%): `milestone1.pdf`, requirements and dataset feasibility.
- **Milestone 2** (10%): `milestone2.pdf`, sketches, tooling and MVP scope.
- **Milestone 3** (80%): `process_book.pdf`, final delivery (the live site, the process book PDF and the screencast).

## License

Coursework for the EPFL Data Visualization course (spring 2026), not licensed for redistribution. The crime data is published by the City of Chicago under its open-data terms. The basemap is © OpenStreetMap contributors and © CARTO, attributed in the map.
