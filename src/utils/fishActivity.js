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
  // jaro
  if (month >= 2 && month <= 4) return 1.0;

  // podzim
  if (month >= 8 && month <= 10) return 0.9;

  // léto
  if (month >= 5 && month <= 7) return 0.7;

  // zima
  return 0.5;
}

export function getTimeOfDayScore(
  hours = new Date().getHours(),
  month = new Date().getMonth(),
) {
  const isWinter = month === 11 || month <= 1;

  // ZIMA
  if (isWinter) {
    if (hours >= 10 && hours <= 15) return 1.0;

    if ((hours >= 8 && hours < 10) || (hours > 15 && hours <= 17)) {
      return 0.7;
    }

    return 0.3;
  }

  // OSTATNÍ SEZÓNY
  if ((hours >= 5 && hours <= 9) || (hours >= 18 && hours <= 22)) {
    return 1.0;
  }

  if (hours >= 10 && hours <= 17) {
    return 0.7;
  }

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
          accuracy: position.coords.accuracy,
        }),
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  });
}

export async function fetchWeatherData(lat, lng) {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover&hourly=precipitation_probability&daily=sunrise,sunset&timezone=auto`,
    );
    const data = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
}

export function calculateFishActivity(weatherData) {
  const { temperature, windSpeed, pressure, cloudiness, rainChance } =
    weatherData;

  // Tlak — optimum 1013–1020 hPa
  let pressureScore;
  if (pressure >= 1013 && pressure <= 1020) {
    pressureScore = 1.0;
  } else if (pressure >= 1005 && pressure < 1013) {
    pressureScore = 0.5;
  } else if (pressure > 1020 && pressure <= 1030) {
    pressureScore = 0.7;
  } else {
    pressureScore = 0.2;
  }

  // Vítr
  let windScore;

  if (windSpeed >= 5 && windSpeed <= 18) {
    windScore = 1.0;
  } else if (windSpeed > 18 && windSpeed <= 30) {
    windScore = 0.6;
  } else if (windSpeed < 5) {
    windScore = 0.7;
  } else {
    windScore = 0.2;
  }

  // Teplota vzduchu — optimum 10–20°C
  let tempScore;

  if (temperature >= 10 && temperature <= 24) {
    tempScore = 1.0;
  } else if (temperature >= 5 && temperature < 10) {
    tempScore = 0.8;
  } else if (temperature > 24 && temperature <= 30) {
    tempScore = 0.7;
  } else if (temperature >= 0 && temperature < 5) {
    tempScore = 0.5;
  } else {
    tempScore = 0.2;
  }

  // Oblacnost
  let cloudScore;

  if (cloudiness >= 40 && cloudiness <= 80) {
    cloudScore = 1.0;
  } else if (cloudiness > 80) {
    cloudScore = 0.7;
  } else if (cloudiness >= 20 && cloudiness < 40) {
    cloudScore = 0.6;
  } else {
    cloudScore = 0.3;
  }

  // Fáze měsíce — nejlepší ubývající (0.5–0.75)
  const { phase } = getMoonPhase();
  let moonScore;
  if (phase >= 0.5 && phase <= 0.75) moonScore = 1.0;
  else if (phase >= 0.75 && phase <= 0.85) moonScore = 0.8;
  else if (phase >= 0.25 && phase <= 0.5) moonScore = 0.6;
  else moonScore = 0.4;

  //Srazky - dest

  let rainScore;

  if (rainChance >= 40 && rainChance <= 70) {
    rainScore = 1.0;
  } else if (rainChance > 70) {
    rainScore = 0.7;
  } else if (rainChance >= 20 && rainChance < 40) {
    rainScore = 0.8;
  } else {
    rainScore = 0.5;
  }

  const timeScore = getTimeOfDayScore();
  const seasonScore = getSeasonScore();

  const total =
    pressureScore * 0.23 +
    windScore * 0.18 +
    tempScore * 0.22 +
    cloudScore * 0.12 +
    rainScore * 0.12 +
    timeScore * 0.08 +
    seasonScore * 0.03 +
    moonScore * 0.02;

  const score = Math.round(total * 10);

  const reasons = [];

  if (windScore >= 1.0) {
    reasons.push("Lehký vítr podporuje aktivitu ryb.");
  }

  if (cloudScore >= 1.0) {
    reasons.push("Zatažená obloha vytváří dobré podmínky.");
  }

  if (tempScore >= 1.0) {
    reasons.push("Teplota je ideální pro aktivitu ryb.");
  }

  if (rainScore >= 1.0) {
    reasons.push("Možný déšť může zvýšit aktivitu ryb.");
  }

  if (pressureScore <= 0.3) {
    reasons.push("Nízký nebo extrémní tlak aktivitu snižuje.");
  }

  if (timeScore >= 1.0) {
    reasons.push("Denní doba přeje rybolovu.");
  }

  return {
    score,
    reasons,
  };
}

export function getActivityLabel(score) {
  if (score >= 8)
    return { label: "Výborná — ideální den na ryby", color: "green" };
  if (score >= 6) return { label: "Dobrá — stojí za to jít", color: "yellow" };
  if (score >= 4)
    return { label: "Průměrná — možné, ale nejisté", color: "orange" };
  return { label: "Slabá — ryby nejsou aktivní", color: "red" };
}
