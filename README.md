# For the Date

**<https://matmat202.github.io/for-the-date/>**

Is today warm or cold, wet or dry, *for the date*? Pick any town of 15,000 or more people and the page
puts this week's forecast high (or low) against the same stretch of the calendar in each of
the 30 years from 1991 to 2020: the 15 days centred on the date, so 450 past days. You get
the share of those days that were colder, a plain verdict (about usual, warmer than usual,
much cooler than usual, or colder than any of them), the typical value and the range eight
days in ten fall in, the warmest and coldest of the 450 with their dates, and a chart of
every one of them by year with each year's average. The link keeps the town, the day, highs
or lows, and the unit.

## Where the numbers come from

[Open-Meteo](https://open-meteo.com/), fetched by your browser: no key, no account.

- **The past** is Open-Meteo's historical weather API, ERA5 reanalysis. That is a model's
  reconstruction of past weather on a grid of roughly 10–25 km, not one thermometer in
  town.
- **The week** is Open-Meteo's forecast.

They are different models, and they disagree. Measured on 2026-10-26 over the same past
days, the forecast model ran up to 1.6 °C away from the archive (Reykjavík's lows), and
about +1.2 °C on Palo Alto's highs. Comparing one model's forecast with the other's past
would build that gap into every verdict. So the page also asks both for the last 60 days,
measures the gap for this town, and takes it off the forecast before comparing. With fewer
than 10 shared days it says so and uses the forecast as it stands.

Weather data by Open-Meteo.com (CC BY 4.0). Towns: [GeoNames](https://www.geonames.org/)
(CC BY 4.0), the same list as [Daylight](https://matmat202.github.io/daylight/).

## Tests

`node clim-logic.test.mjs` checks the logic. In the source tree it also checks the window,
the percentiles, the medians, the trend and the model gap against values worked out
independently in Python (`fixtures/facts.py`) from a real archive download for Palo Alto.

Built by Claude.
