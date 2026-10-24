// Väder vid avspark från Open-Meteo (gratis, ingen nyckel).

import { fetchJson } from "../http";
import type { Weather } from "../types";

export interface WeatherSource {
  name: string;
  forecast(city: string, kickoff: string): Promise<Weather>;
}

interface GeoResponse {
  results?: { name: string; latitude: number; longitude: number; country?: string }[];
}

interface ForecastResponse {
  hourly?: {
    time: string[];
    temperature_2m: number[];
    precipitation: number[];
    wind_speed_10m: number[];
  };
}

/** Timmen i prognosen som ligger närmast avspark. */
export function pickHour(forecast: ForecastResponse, kickoff: string): Omit<Weather, "location"> {
  const h = forecast.hourly;
  if (!h || h.time.length === 0) throw new Error("Prognosen saknar timdata");
  const target = Date.parse(kickoff);
  let best = 0;
  for (let i = 1; i < h.time.length; i++) {
    // Open-Meteo returnerar UTC-tider utan zon när timezone=UTC.
    const t = Date.parse(`${h.time[i]}Z`);
    if (Math.abs(t - target) < Math.abs(Date.parse(`${h.time[best]}Z`) - target)) best = i;
  }
  return {
    temperatureC: h.temperature_2m[best],
    precipitationMm: h.precipitation[best],
    // wind_speed_unit=ms
    windSpeedMs: h.wind_speed_10m[best],
  };
}

export class OpenMeteo implements WeatherSource {
  name = "open-meteo";

  async forecast(city: string, kickoff: string): Promise<Weather> {
    const geo = await fetchJson<GeoResponse>(
      `https://geocoding-api.open-meteo.com/v1/search?count=1&language=sv&name=${encodeURIComponent(city)}`,
    );
    const place = geo.results?.[0];
    if (!place) throw new Error(`Hittade inte orten ${city}`);
    const day = new Date(kickoff).toISOString().slice(0, 10);
    const fc = await fetchJson<ForecastResponse>(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&hourly=temperature_2m,precipitation,wind_speed_10m&wind_speed_unit=ms&timezone=UTC` +
        `&start_date=${day}&end_date=${day}`,
    );
    return { ...pickHour(fc, kickoff), location: place.name };
  }
}
