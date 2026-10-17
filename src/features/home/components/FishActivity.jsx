import { useEffect, useRef, useState } from "react";
import {
  calculateFishActivity,
  FISH_ACTIVITY_ALGORITHM_VERSION,
  getActivityLabel,
  getMoonPhase,
  getUserLocation,
} from "../utils/fishActivity";
import { fetchWeatherData, getWeatherConditions } from "../utils/weatherApi";
import "./FishActivity.css";

async function getFishActivityData(signal) {
  const location = await getUserLocation();
  const response = await fetchWeatherData(location.lat, location.lng, { signal });
  const weatherData = getWeatherConditions(response.data);

  return { weatherData, activity: calculateFishActivity(weatherData), fetchedAt: response.fetchedAt, cached: response.cached };
}

function getErrorKind(error) {
  if (error?.kind) return error.kind;
  if (error?.code === 1) return "location-denied";
  if (error?.code === 2 || error?.code === 3) return "location-unavailable";
  return "weather-unavailable";
}

function FishActivity() {
  const [status, setStatus] = useState("idle");
  const [errorKind, setErrorKind] = useState(null);
  const [activityData, setActivityData] = useState(null);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef(null);

  useEffect(() => () => {
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
  }, []);

  const loadActivity = async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setStatus("loading");
    setErrorKind(null);

    try {
      const result = await getFishActivityData(controller.signal);
      if (requestId !== requestIdRef.current) return;
      setActivityData(result);
      setStatus("success");
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setErrorKind(getErrorKind(error));
      setStatus("error");
    }
  };

  if (status === "idle") {
    return (
      <section className="fish-activity-card fish-activity-card--muted" aria-labelledby="fish-activity-title">
        <span id="fish-activity-title" className="fish-activity-label">Orientační podmínky</span>
        <p className="fish-activity-reason">Po klepnutí požádáme o polohu a její souřadnice pošleme Open-Meteo kvůli místnímu modelovému počasí. Deník funguje i bez toho.</p>
        <button className="fish-activity-action" type="button" onClick={loadActivity}>Zobrazit odhad</button>
      </section>
    );
  }

  if (status === "loading") {
    return (
      <section className="fish-activity-card fish-activity-card--muted" role="status" aria-live="polite">
        <span className="fish-activity-label">Orientační podmínky</span>
        <p className="fish-activity-reason">Načítám místní počasí…</p>
      </section>
    );
  }

  if (status === "error") {
    const locationDenied = errorKind === "location-denied";
    const locationUnavailable = errorKind === "location-unavailable";
    const locationUnsupported = errorKind === "location-unsupported";
    const message = locationDenied
      ? "Bez polohy tento odhad nespočítám. Deník můžeš používat dál; po změně oprávnění v nastavení prohlížeče můžeš načtení zkusit znovu."
      : locationUnsupported
        ? "Tento prohlížeč polohu neposkytuje. Deník můžeš používat dál bez odhadu."
      : locationUnavailable
        ? "Polohu se nepodařilo zjistit. Bez ní odhad podmínek není dostupný."
        : "Počasí teď není dostupné. Zkontroluj připojení a zkus to znovu.";

    return (
      <section className="fish-activity-card fish-activity-card--muted" aria-labelledby="fish-activity-title">
        <span id="fish-activity-title" className="fish-activity-label">Orientační podmínky</span>
        <p className="fish-activity-status">{locationDenied || locationUnsupported ? "Odhad není dostupný" : locationUnavailable ? "Poloha teď není dostupná" : "Počasí není dostupné"}</p>
        <p className="fish-activity-reason">{message}</p>
        {!locationUnsupported && <button className="fish-activity-action" type="button" onClick={loadActivity}>{locationDenied ? "Ověřit polohu znovu" : "Zkusit znovu"}</button>}
      </section>
    );
  }

  const { weatherData, activity, fetchedAt, cached } = activityData;
  const { label } = getActivityLabel(activity.score);
  const { pressure, temperature, windSpeed, cloudiness, rainChance, sunrise, sunset } = weatherData;
  const moon = getMoonPhase();

  return (
    <section className="fish-activity-card" aria-labelledby="fish-activity-title">
      <div className="fish-activity-header">
        <div>
          <span id="fish-activity-title" className="fish-activity-label">Orientační podmínky</span>
          <p className="fish-activity-disclaimer">Výpočet z počasí, denní doby a fáze měsíce; nejde o předpověď záběrů.</p>
        </div>
        <div className="fish-activity-score-wrapper" aria-label={`Orientační hodnocení ${activity.score} z 10`}>
          <div className="fish-activity-score">{activity.score}</div>
          <div className="fish-activity-progress" aria-hidden="true">
            <div className="fish-activity-progress-fill" style={{ width: `${activity.score * 10}%` }} />
          </div>
        </div>
      </div>
      <p className="fish-activity-status">{label}</p>
      {activity.reasons.length > 0 && <p className="fish-activity-reason">{activity.reasons[0]}</p>}
      <div className="fish-activity-tags">
        <span className="fish-activity-tag">🔵 {Math.round(pressure)} hPa</span>
        <span className="fish-activity-tag">{moon.label}</span>
        <span className="fish-activity-tag">🌡️ {temperature}°C vzduch</span>
        <span className="fish-activity-tag">💨 {windSpeed} km/h vítr</span>
        <span className="fish-activity-tag">🌅 {sunrise.slice(11, 16)} · 🌇 {sunset.slice(11, 16)}</span>
        <span className="fish-activity-tag">☁️ {cloudiness}% oblačnost</span>
        <span className="fish-activity-tag">🌧️ {rainChance}% šance deště</span>
      </div>
      <p className="fish-activity-attribution">
        Modelové údaje k {weatherData.currentTime.slice(11, 16)} {weatherData.timezoneAbbreviation || weatherData.timezone || "místního času"} · načteno {new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" }).format(fetchedAt)}{cached ? " · z místní cache" : ""}. Algoritmus odhadu v{FISH_ACTIVITY_ALGORITHM_VERSION}. Data: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo (CC BY 4.0)</a>.
      </p>
      <button className="fish-activity-action" type="button" onClick={loadActivity}>Obnovit počasí</button>
    </section>
  );
}

export default FishActivity;
