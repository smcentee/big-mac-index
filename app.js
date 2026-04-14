import { BIG_MAC_LOCATIONS, BIG_MAC_SOURCE_DATE, BIG_MAC_SOURCE_LABEL } from "./data.js";

const MEALS = [
  { id: "breakfast", label: "Breakfast", multiplierText: "3 to 4 Big Macs", min: 3, max: 4 },
  { id: "lunch", label: "Lunch", multiplierText: "4 to 6 Big Macs", min: 4, max: 6 },
  { id: "dinner", label: "Dinner", multiplierText: "6 to 8 Big Macs", min: 6, max: 8 }
];
const ECONOMIST_CSV_URL = "https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/output-data/big-mac-raw-index.csv";
const COUNTRY_NAME_OVERRIDES = {
  GBR: "United Kingdom"
};

const countrySelect = document.querySelector("#country-select");
const citySelect = document.querySelector("#city-select");
const destinationLabel = document.querySelector("#destination-label");
const localPrice = document.querySelector("#local-price");
const usdPrice = document.querySelector("#usd-price");
const sourceMeta = document.querySelector("#source-meta");
const mealCards = document.querySelector("#meal-cards");
const dailyTotalLocal = document.querySelector("#daily-total-local");
const dailyTotalUsd = document.querySelector("#daily-total-usd");

let activeLocations = [];
let locationByIso = new Map();
let sourceDate = null;

function buildLocationMap(locations) {
  return new Map(locations.map((location) => [location.isoA3, location]));
}

function formatMoney(value, currencyCode) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value);
}

function formatDateLabel(isoDate) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function parseEconomistCsv(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() ?? ""]));
  });

  const latestDate = rows.reduce((max, row) => (row.date > max ? row.date : max), "");
  const latestRows = rows.filter((row) => row.date === latestDate);

  return {
    sourceDate: latestDate,
    locations: latestRows
      .map((row) => ({
        isoA3: row.iso_a3,
        country: COUNTRY_NAME_OVERRIDES[row.iso_a3] ?? row.name,
        currencyCode: row.currency_code,
        localPrice: parseFloat(row.local_price),
        dollarPrice: parseFloat(row.dollar_price)
      }))
      .filter((loc) => loc.isoA3 && !isNaN(loc.localPrice) && !isNaN(loc.dollarPrice))
  };
}

function buildMealCard(meal) {
  const card = document.createElement("article");
  card.className = "meal-card";
  card.innerHTML = `
    <header>
      <p class="result-label">${meal.label}</p>
      <p class="result-multiplier">${meal.multiplierText}</p>
    </header>
    <div>
      <p class="result-local" data-role="local">-</p>
      <p class="result-usd" data-role="usd">-</p>
    </div>
  `;
  return card;
}

function renderMealCards() {
  const cards = MEALS.map((meal) => buildMealCard(meal));
  mealCards.replaceChildren(...cards);
}

function populateCountryOptions(preferredIsoA3, preferredCity) {
  const options = activeLocations.map(
    (location) =>
      `<option value="${location.isoA3}">${location.country}</option>`
  );

  countrySelect.innerHTML = options.join("");

  const defaultLocation =
    activeLocations.find((location) => location.isoA3 === preferredIsoA3) ??
    activeLocations.find((location) => location.isoA3 === "USA") ??
    activeLocations[0];
  countrySelect.value = defaultLocation.isoA3;
  populateCityOptions(
    defaultLocation.isoA3,
    preferredCity ?? defaultLocation.cities[1] ?? defaultLocation.cities[0]
  );
}

function populateCityOptions(isoA3, preferredCity) {
  const location = locationByIso.get(isoA3);
  if (!location) {
    return;
  }

  const options = location.cities.map((city) => `<option value="${city}">${city}</option>`);
  citySelect.innerHTML = options.join("");

  const selectedCity = location.cities.includes(preferredCity) ? preferredCity : location.cities[0];
  citySelect.value = selectedCity;
}

function updateSummary() {
  const location = locationByIso.get(countrySelect.value);
  if (!location) {
    return;
  }

  const city = citySelect.value || location.cities[0];

  destinationLabel.textContent = `${city}, ${location.country}`;
  localPrice.textContent = formatMoney(location.localPrice, location.currencyCode);
  usdPrice.textContent = `${formatMoney(location.dollarPrice, "USD")} USD`;
  sourceMeta.textContent = `The Economist Big Mac Index as of ${formatDateLabel(sourceDate)}${sourceDate === BIG_MAC_SOURCE_DATE ? " (bundled)" : ""}.`;

  const cards = [...mealCards.querySelectorAll(".meal-card")];
  MEALS.forEach((meal, index) => {
    const minLocal = location.localPrice * meal.min;
    const maxLocal = location.localPrice * meal.max;
    const minUsd = location.dollarPrice * meal.min;
    const maxUsd = location.dollarPrice * meal.max;
    const card = cards[index];

    card.querySelector('[data-role="local"]').textContent =
      `${formatMoney(minLocal, location.currencyCode)} - ${formatMoney(maxLocal, location.currencyCode)}`;
    card.querySelector('[data-role="usd"]').textContent =
      `${formatMoney(minUsd, "USD")} - ${formatMoney(maxUsd, "USD")} USD`;
  });

  const totalLocalMin = location.localPrice * 13;
  const totalLocalMax = location.localPrice * 18;
  const totalUsdMin = location.dollarPrice * 13;
  const totalUsdMax = location.dollarPrice * 18;

  dailyTotalLocal.textContent =
    `${formatMoney(totalLocalMin, location.currencyCode)} - ${formatMoney(totalLocalMax, location.currencyCode)}`;
  dailyTotalUsd.textContent =
    `${formatMoney(totalUsdMin, "USD")} - ${formatMoney(totalUsdMax, "USD")} USD total`;
}

async function loadEconomistData() {
  const citiesByIso = new Map(BIG_MAC_LOCATIONS.map((loc) => [loc.isoA3, loc.cities]));

  console.log("[big-mac] Fetching data from", ECONOMIST_CSV_URL);

  try {
    const response = await fetch(ECONOMIST_CSV_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const parsed = parseEconomistCsv(text);

    activeLocations = parsed.locations
      .map((loc) => ({ ...loc, cities: citiesByIso.get(loc.isoA3) ?? [] }))
      .filter((loc) => loc.cities.length > 0)
      .sort((a, b) => a.country.localeCompare(b.country));

    locationByIso = buildLocationMap(activeLocations);
    sourceDate = parsed.sourceDate;

    console.log(`[big-mac] Loaded ${activeLocations.length} locations (data date: ${sourceDate})`);
  } catch (error) {
    console.error("[big-mac] Failed to load live data, falling back to bundled dataset:", error);

    activeLocations = BIG_MAC_LOCATIONS.map((loc) => ({ ...loc, cities: [...loc.cities] }));
    locationByIso = buildLocationMap(activeLocations);
    sourceDate = BIG_MAC_SOURCE_DATE;

    console.log(`[big-mac] Using bundled data: ${BIG_MAC_SOURCE_LABEL} (data date: ${sourceDate})`);
  }
}

countrySelect.addEventListener("change", () => {
  populateCityOptions(countrySelect.value);
  updateSummary();
});

citySelect.addEventListener("change", updateSummary);

renderMealCards();

loadEconomistData().then(() => {
  populateCountryOptions();
  updateSummary();
});
