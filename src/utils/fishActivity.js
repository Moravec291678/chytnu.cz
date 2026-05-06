import { MOON_PHASE_EMOJI } from "./constants";

export function getMoonPhase(date = new Date()) {
  const knownNewMoon = new Date("2000-01-06");
  const moonCycleDays = 29.53;
  const daysSince = (date - knownNewMoon) / (1000 * 60 * 60 * 24);
  const phase = (daysSince % moonCycleDays) / moonCycleDays;

  let key;
  if (phase < 0.03 || phase >= 0.97) key = "new";
  else if (phase < 0.25) key = "waxingCrescent";
  else if (phase < 0.28) key = "firstQuarter";
  else if (phase < 0.5) key = "waxingGibbous";
  else if (phase < 0.53) key = "full";
  else if (phase < 0.75) key = "waningGibbous";
  else if (phase < 0.78) key = "lastQuarter";
  else key = "waningCrescent";

  return {
    key,
    label: MOON_PHASE_EMOJI[key],
    phase,
  };
}

export function getSeasonScore(month = new Date().getMonth()) {
  if (month >= 2 && month <= 4) return 1.0; // březen–květen
  if (month >= 8 && month <= 10) return 0.9; // září–listopad
  if (month >= 5 && month <= 7) return 0.6; // červen–srpen
  if (month === 11 || month <= 1) return 0.2; // prosinec–únor
}

export function getTimeOfDayScore(hours = new Date().getHours()) {
  if (hours >= 5 && hours <= 9) return 1.0;
  if (hours >= 18 && hours <= 22) return 1.0;
  return 0.3;
}

export function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolokace není podporována"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      (error) => reject(error),
    );
  });
}

export async function fetchWeatherData(lat, lng) {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,surface_pressure&daily=sunrise,sunset&timezone=auto`,
    );
    const data = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
}

export function calculateFishActivity(weatherData) {
  const { temperature, windSpeed, pressure, pressureTrend } = weatherData;

  // Tlak — optimum 1013–1020 hPa
  let pressureScore;
  if (pressure >= 1013 && pressure <= 1020) {
    pressureScore =
      pressureTrend === "rising" || pressureTrend === "stable" ? 1.0 : 0.7;
  } else if (pressure >= 1005 && pressure < 1013) {
    pressureScore = 0.5;
  } else if (pressure > 1020 && pressure <= 1030) {
    pressureScore = 0.7;
  } else {
    pressureScore = 0.2;
  }

  // Vítr
  const windScore = windSpeed <= 15 ? 1.0 : windSpeed <= 30 ? 0.5 : 0.2;

  // Teplota vzduchu — optimum 10–20°C
  let tempScore;
  if (temperature >= 10 && temperature <= 20) tempScore = 1.0;
  else if (temperature >= 5 && temperature < 10) tempScore = 0.7;
  else if (temperature > 20 && temperature <= 28) tempScore = 0.6;
  else if (temperature < 5 && temperature >= 0) tempScore = 0.3;
  else tempScore = 0.1;

  // Fáze měsíce — nejlepší ubývající (0.5–0.75)
  const { phase } = getMoonPhase();
  let moonScore;
  if (phase >= 0.5 && phase <= 0.75) moonScore = 1.0;
  else if (phase >= 0.75 && phase <= 0.85) moonScore = 0.8;
  else if (phase >= 0.25 && phase <= 0.5) moonScore = 0.6;
  else moonScore = 0.4;

  const timeScore = getTimeOfDayScore();
  const seasonScore = getSeasonScore();

  const total =
    pressureScore * 0.25 +
    windScore * 0.2 +
    tempScore * 0.15 +
    moonScore * 0.2 +
    timeScore * 0.1 +
    seasonScore * 0.1;

  return Math.round(total * 10);
}

export function getActivityLabel(score) {
  if (score >= 8)
    return { label: "Výborná — ideální den na ryby", color: "green" };
  if (score >= 6) return { label: "Dobrá — stojí za to jít", color: "yellow" };
  if (score >= 4)
    return { label: "Průměrná — možné, ale nejisté", color: "orange" };
  return { label: "Slabá — ryby nejsou aktivní", color: "red" };
}
