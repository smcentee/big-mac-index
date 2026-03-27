import { BIG_MAC_LOCATIONS, BIG_MAC_SOURCE_DATE, BIG_MAC_SOURCE_LABEL } from "./data.js";

const MEALS = [
  { id: "breakfast", label: "Breakfast", multiplierText: "3x-4x Big Mac", min: 3, max: 4 },
  { id: "lunch", label: "Lunch", multiplierText: "4x-6x Big Mac", min: 4, max: 6 },
  { id: "dinner", label: "Dinner", multiplierText: "6x-8x Big Mac", min: 6, max: 8 }
];
const LIVE_SOURCE_URL = "https://worldpopulationreview.com/country-rankings/big-mac-index-by-country";

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
  matchedCount: 0
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

function decodeHtmlEntities(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function reviveAstroValue(value) {
  if (Array.isArray(value) && value.length === 2 && Number.isInteger(value[0])) {
    const [tag, payload] = value;

    if (tag === 0) {
      return reviveAstroValue(payload);
    }

    if (tag === 1) {
      return payload.map((entry) => reviveAstroValue(entry));
    }

    return payload;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => reviveAstroValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, reviveAstroValue(entry)])
    );
  }

  return value;
}

// World Population Review ships the table rows inside an Astro island prop payload.
function parseWorldPopulationReviewLocations(html) {
  const astroMatch = html.match(
    /<astro-island[^>]+component-url="[^"]*CountryRankingMapSection[^"]*"[^>]+props="([^"]+)"/s
  );

  if (!astroMatch) {
    throw new Error("Unable to find the live data payload.");
  }

  const decodedProps = decodeHtmlEntities(astroMatch[1]);
  const props = JSON.parse(decodedProps);
  const rows = reviveAstroValue(props.data);

  return rows
    .filter((row) => typeof row?.cca3 === "string" && typeof row?.BigMacIndex_2025 === "number")
    .map((row) => ({
      isoA3: row.cca3,
      country: row.country,
      dollarPrice: row.BigMacIndex_2025
    }));
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
  if (sourceState.mode === "live" && sourceState.loadedAt instanceof Date) {
    return [
      `Live USD Big Mac data scraped on load from World Population Review on ${formatLoadedAtLabel(sourceState.loadedAt)}.`,
      "Local currency values still come from the bundled Economist dataset because the live page only publishes USD index prices."
    ].join(" ");
  }

  if (sourceState.mode === "error") {
    return [
      `Live scrape unavailable right now. Using ${BIG_MAC_SOURCE_LABEL} for ${formatDateLabel(BIG_MAC_SOURCE_DATE)} instead.`,
      "This usually happens because the source site blocks browser cross-origin reads."
    ].join(" ");
  }

  return [
    `Loading live USD Big Mac data from World Population Review.`,
    `Using ${BIG_MAC_SOURCE_LABEL} for ${formatDateLabel(BIG_MAC_SOURCE_DATE)} until that finishes.`
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

async function loadLiveBigMacData() {
  const selectedIsoA3 = countrySelect.value;
  const selectedCity = citySelect.value;

  try {
    const response = await fetch(LIVE_SOURCE_URL, {
      headers: {
        Accept: "text/html"
      }
    });

    if (!response.ok) {
      throw new Error(`Unexpected response ${response.status}`);
    }

    const html = await response.text();
    const liveLocations = parseWorldPopulationReviewLocations(html);
    const liveByIso = new Map(liveLocations.map((location) => [location.isoA3, location]));
    let matchedCount = 0;

    activeLocations = activeLocations.map((location) => {
      const liveLocation = liveByIso.get(location.isoA3);

      if (!liveLocation) {
        return location;
      }

      matchedCount += 1;

      return {
        ...location,
        dollarPrice: liveLocation.dollarPrice
      };
    });

    locationByIso = buildLocationMap(activeLocations);
    sourceState = {
      mode: "live",
      loadedAt: new Date(),
      matchedCount
    };
  } catch (error) {
    sourceState = {
      mode: "error",
      loadedAt: null,
      matchedCount: 0
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
loadLiveBigMacData();
