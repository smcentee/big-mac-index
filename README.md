# DEPT® Big Mac Per-Diem Calculator

Static web app for calculating meal reimbursement ranges from the Global Big Mac Index.

## Data source

- Big Mac pricing is based on [The Economist Big Mac Index](https://github.com/TheEconomist/big-mac-data).
- This project is currently using the `2025-01-01` release, published in February 2025.
- The Economist publishes country-level pricing, so the city dropdown is a representative destination picker layered on top of the country dataset.
- On page load, the app also attempts to scrape current USD Big Mac values from [World Population Review](https://worldpopulationreview.com/country-rankings/big-mac-index-by-country).
- If that live scrape is blocked by browser CORS policy, the app automatically falls back to the bundled Economist dataset.

## Run locally

From this folder:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).
