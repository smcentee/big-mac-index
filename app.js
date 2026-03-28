import { BIG_MAC_LOCATIONS, BIG_MAC_SOURCE_DATE, BIG_MAC_SOURCE_LABEL } from "./data.js";

const MEALS = [
  { id: "breakfast", label: "Breakfast", multiplierText: "3x-4x Big Mac", min: 3, max: 4 },
  { id: "lunch", label: "Lunch", multiplierText: "4x-6x Big Mac", min: 4, max: 6 },
  { id: "dinner", label: "Dinner", multiplierText: "6x-8x Big Mac", min: 6, max: 8 }
];
const GITHUB_DATA_URL = "https://raw.githubusercontent.com/DavidRyan/big-mac-index/main/data.js";

const countrySelect = document.querySelector("#country-select");
const citySelect = document.querySelector("#city-select");
const destinationLabel = document.querySelector("#destination-label");
const localPrice = document.querySelector("#local-price");
const usdPrice = document.querySelector("#usd-price");
const sourceMeta = document.querySelector("#source-meta");
const mealCards = document.querySelector("#meal-cards");
const dailyTotalLocal = document.querySelector("#daily-total-local");
const dailyTotalUsd = document.querySelector("#daily-total-usd");

let activeLocations = BIG_MAC_LOCATIONS.map((location) => ({
  ...location,
  cities: [...location.cities]
}));
let locationByIso = buildLocationMap(activeLocations);
let sourceState = {
  mode: "loading",
  loadedAt: null,
  sourceDate: BIG_MAC_SOURCE_DATE,
  sourceLabel: BIG_MAC_SOURCE_LABEL
};

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

function formatLoadedAtLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function parseGithubDataModule(text) {
  const dateMatch = text.match(/export const BIG_MAC_SOURCE_DATE = "([^"]+)"/);
  const labelMatch = text.match(/export const BIG_MAC_SOURCE_LABEL = "([^"]+)"/);
  const locationsMatch = text.match(/export const BIG_MAC_LOCATIONS = (\[[\s\S]+\]);/);

  if (!dateMatch || !labelMatch || !locationsMatch) {
    throw new Error("Could not parse remote data.js");
  }

  return {
    sourceDate: dateMatch[1],
    sourceLabel: labelMatch[1],
    locations: JSON.parse(locationsMatch[1])
  };
}

function buildMealCard(meal) {
  const card = document.createElement("article");
  card.className = "meal-card";
  card.innerHTML = `
    <header>
      <div>
        <p class="result-label">${meal.label}</p>
        <h3>${meal.multiplierText}</h3>
      </div>
      <p class="result-multiplier">${meal.min} to ${meal.max}</p>
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

function getSourceMetaText() {
  if (sourceState.mode === "github") {
    return [
      `${sourceState.sourceLabel} loaded from GitHub (DavidRyan/big-mac-index) on ${formatLoadedAtLabel(sourceState.loadedAt)}.`,
      `Data as of ${formatDateLabel(sourceState.sourceDate)}.`
    ].join(" ");
  }

  if (sourceState.mode === "error") {
    return [
      `Could not load live data from GitHub. Using bundled ${BIG_MAC_SOURCE_LABEL} for ${formatDateLabel(BIG_MAC_SOURCE_DATE)} instead.`
    ].join(" ");
  }

  return [
    `Loading latest Big Mac data from GitHub (DavidRyan/big-mac-index).`,
    `Using bundled ${BIG_MAC_SOURCE_LABEL} for ${formatDateLabel(BIG_MAC_SOURCE_DATE)} until that finishes.`
  ].join(" ");
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
  sourceMeta.textContent = getSourceMetaText();

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

async function loadGithubData() {
  const selectedIsoA3 = countrySelect.value;
  const selectedCity = citySelect.value;

  try {
    const response = await fetch(GITHUB_DATA_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const { sourceDate, sourceLabel, locations } = parseGithubDataModule(text);

    activeLocations = locations.map((location) => ({
      ...location,
      cities: [...(location.cities ?? [])]
    }));
    locationByIso = buildLocationMap(activeLocations);
    sourceState = {
      mode: "github",
      loadedAt: new Date(),
      sourceDate,
      sourceLabel
    };
  } catch (error) {
    sourceState = {
      mode: "error",
      loadedAt: null,
      sourceDate: BIG_MAC_SOURCE_DATE,
      sourceLabel: BIG_MAC_SOURCE_LABEL
    };
  }

  populateCountryOptions(selectedIsoA3, selectedCity);
  updateSummary();
}

countrySelect.addEventListener("change", () => {
  populateCityOptions(countrySelect.value);
  updateSummary();
});

citySelect.addEventListener("change", updateSummary);

renderMealCards();
populateCountryOptions();
updateSummary();
loadGithubData();
