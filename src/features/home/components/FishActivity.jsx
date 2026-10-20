import { useCallback, useEffect, useRef, useState } from "react";
import {
  calculateFishActivity,
  FISH_ACTIVITY_ALGORITHM_VERSION,
  getActivityLabel,
  getMoonPhase,
  getUserLocation,
} from "../utils/fishActivity";
import { getFishActivityForecast } from "../utils/fishActivityForecast";
import { fetchWeatherData, getWeatherConditions } from "../utils/weatherApi";
import { Link } from "react-router-dom";
import "./FishActivity.css";

const FISH_ACTIVITY_ENABLED_KEY = "fishActivityEnabled";

async function getFishActivityData(signal) {
  const location = await getUserLocation();
  const response = await fetchWeatherData(location.lat, location.lng, {
    signal,
  });
  const weatherData = getWeatherConditions(response.data);

  return {
    weatherData,
    activity: calculateFishActivity(weatherData),
    forecast: getFishActivityForecast(response.data),
    fetchedAt: response.fetchedAt,
    cached: response.cached,
  };
}

function getErrorKind(error) {
  if (error?.kind) return error.kind;
  if (error?.code === 1) return "location-denied";
  if (error?.code === 2 || error?.code === 3) return "location-unavailable";
  return "weather-unavailable";
}

function getSavedFishActivityPreference() {
  try {
    return localStorage.getItem(FISH_ACTIVITY_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

function saveFishActivityPreference() {
  try {
    localStorage.setItem(FISH_ACTIVITY_ENABLED_KEY, "true");
  } catch {
    // Pokud localStorage není dostupné, odhad stále funguje v aktuální relaci.
  }
}

function FishActivity({ detailed = false }) {
  const [activityEnabled, setActivityEnabled] = useState(
    getSavedFishActivityPreference,
  );
  const [status, setStatus] = useState("idle");
  const [errorKind, setErrorKind] = useState(null);
  const [activityData, setActivityData] = useState(null);

  const requestIdRef = useRef(0);
  const abortControllerRef = useRef(null);

  const loadActivity = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    if (!activityEnabled) return;

    const timeoutId = window.setTimeout(() => {
      void loadActivity();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activityEnabled, loadActivity]);

  useEffect(() => {
    const refreshPreference = () => setActivityEnabled(getSavedFishActivityPreference());
    window.addEventListener("chytnu:fish-activity-preference", refreshPreference);
    return () => window.removeEventListener("chytnu:fish-activity-preference", refreshPreference);
  }, []);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
    };
  }, []);

  const enableActivity = () => {
    saveFishActivityPreference();
    setActivityEnabled(true);
  };

  if (!activityEnabled) {
    return (
      <section
        className="fish-activity-card fish-activity-card--muted"
        aria-labelledby="fish-activity-title"
      >
        <span id="fish-activity-title" className="fish-activity-label">
          Aktivita ryb dnes
        </span>

        <p className="fish-activity-reason">
          Orientační podmínky podle místního počasí. Poloha se použije jen pro načtení odhadu.
        </p>

        <button
          className="fish-activity-action"
          type="button"
          onClick={enableActivity}
        >
          Zobrazit odhad
        </button>
        {!detailed && <Link className="fish-activity-detail-link" to="/fish-activity">Jak odhad funguje <span aria-hidden="true">→</span></Link>}
      </section>
    );
  }

  if (status === "idle" || status === "loading") {
    return (
      <section
        className="fish-activity-card fish-activity-card--muted"
        role="status"
        aria-live="polite"
      >
        <span className="fish-activity-label">Aktivita ryb dnes</span>
        <p className="fish-activity-reason">Načítám místní počasí…</p>
        <div className="fish-activity-loading" aria-hidden="true"><span /><span /><span /></div>
        {!detailed && <Link className="fish-activity-detail-link" to="/fish-activity">Jak odhad funguje <span aria-hidden="true">→</span></Link>}
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
      <section
        className="fish-activity-card fish-activity-card--muted"
        aria-labelledby="fish-activity-title"
      >
        <span id="fish-activity-title" className="fish-activity-label">
          Aktivita ryb dnes
        </span>

        <p className="fish-activity-status">
          {locationDenied || locationUnsupported
            ? "Odhad není dostupný"
            : locationUnavailable
              ? "Poloha teď není dostupná"
              : "Počasí není dostupné"}
        </p>

        <p className="fish-activity-reason">{message}</p>

        {!locationUnsupported && (
          <button
            className="fish-activity-action"
            type="button"
            onClick={loadActivity}
          >
            {locationDenied ? "Ověřit polohu znovu" : "Zkusit znovu"}
          </button>
        )}
        {!detailed && <Link className="fish-activity-detail-link" to="/fish-activity">Jak odhad funguje <span aria-hidden="true">→</span></Link>}
      </section>
    );
  }

  const { weatherData, activity, forecast, fetchedAt, cached } = activityData;
  const { label } = getActivityLabel(activity.score);

  const {
    pressure,
    temperature,
    windSpeed,
    cloudiness,
    rainChance,
    sunrise,
  } = weatherData;

  const factorsByKey = new Map(activity.factors.map((factor) => [factor.key, factor]));
  const weatherFactors = ["wind", "cloudiness", "rain"].map((key) => factorsByKey.get(key)).filter(Boolean);
  const weatherWeight = weatherFactors.reduce((total, factor) => total + factor.weight, 0);
  const displayedFactors = [
    {
      key: "weather",
      label: "Počasí",
      value: `${windSpeed} km/h · ${cloudiness}% · déšť ${rainChance}%`,
      unit: "",
      score: weatherWeight
        ? weatherFactors.reduce((total, factor) => total + factor.score * factor.weight, 0) / weatherWeight
        : 0,
      weight: weatherWeight,
    },
    factorsByKey.get("temperature"),
    factorsByKey.get("moon"),
    factorsByKey.get("pressure"),
    factorsByKey.get("season"),
    factorsByKey.get("time"),
  ].filter(Boolean);
  const moon = getMoonPhase();

  return (
    <section
      className={detailed ? "fish-activity-card fish-activity-card--detailed" : "fish-activity-card"}
      aria-labelledby="fish-activity-title"
    >
      <div className="fish-activity-header">
        <div
          className={detailed ? "fish-activity-score fish-activity-score--detailed" : "fish-activity-score"}
          aria-label={`Orientační hodnocení ${activity.score} ze 100`}
        >
          {activity.score}
        </div>
        <div className="fish-activity-heading">
          <span id="fish-activity-title" className="fish-activity-label">
            Aktivita ryb dnes
          </span>
          <p className="fish-activity-status">{label}</p>
          <p className="fish-activity-disclaimer">
            Orientační výpočet, nikoli předpověď záběrů.
          </p>
        </div>
      </div>

      {detailed && <svg className="fish-activity-wave" viewBox="0 0 400 56" preserveAspectRatio="none" aria-hidden="true">
        <path d="M2 28 C42 2 62 2 102 28 S162 54 202 28 S262 2 302 28 S362 54 398 28" />
      </svg>}

      <div className="fish-activity-tags">
        <span className="fish-activity-tag">{Math.round(pressure)} hPa</span>
        <span className="fish-activity-tag">{temperature}°C</span>
        <span className="fish-activity-tag">Vítr {windSpeed} km/h</span>
        <span className="fish-activity-tag">Východ {sunrise.slice(11, 16)}</span>
        <span className="fish-activity-tag">{moon.label}</span>
        {cloudiness !== null && <span className="fish-activity-tag">{cloudiness}% oblačnost</span>}
        {rainChance !== null && <span className="fish-activity-tag">Déšť {rainChance}%</span>}
      </div>

      <p className="fish-activity-attribution">
        {detailed ? <>Modelové údaje k {weatherData.currentTime.slice(11, 16)}{" "}
        {weatherData.timezoneAbbreviation ||
          weatherData.timezone ||
          "místního času"}{" "}
        · načteno{" "}
        {new Intl.DateTimeFormat("cs-CZ", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(fetchedAt)}
        {cached ? " · z místní cache" : ""}. Algoritmus odhadu v
        {FISH_ACTIVITY_ALGORITHM_VERSION}. Data: </> : <>Počasí k {weatherData.currentTime.slice(11, 16)}{" "}
        {weatherData.timezoneAbbreviation || weatherData.timezone || "místního času"} · Data: </>}
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open-Meteo (CC BY 4.0)
        </a>
        .
      </p>

      {detailed && <div className="fish-activity-breakdown" aria-labelledby="fish-activity-breakdown-title">
        <h2 id="fish-activity-breakdown-title">Jak odhad vzniká</h2>
        <p>Každý faktor přispívá k výslednému skóre svou vahou. Jde o transparentní orientační algoritmus, ne o předpověď záběrů.</p>
        <ul>{displayedFactors.map((factor) => <li key={factor.key}>
          <div className="fish-activity-factor-heading">
            <strong>{factor.label}</strong>
            <span>{factor.value === null ? "Nedostupné" : `${factor.value}${factor.unit ? ` ${factor.unit}` : ""}`} · váha {Math.round(factor.weight * 100)}%</span>
          </div>
          <div className="fish-activity-factor-meter" role="progressbar" aria-label={`${factor.label}: příspěvek algoritmu`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(factor.score * 100)}>
            <span style={{ width: `${factor.score * 100}%` }} />
          </div>
        </li>)}</ul>
        <p>Skóre je vypočítáno z počasí pro tuto chvíli a z času/roční doby zařízení. Přesné souřadnice se neukládají do deníku ani do sdílené karty.</p>
      </div>}

      {detailed && forecast.length > 0 && <section className="fish-activity-forecast" aria-labelledby="fish-activity-forecast-title">
        <h2 id="fish-activity-forecast-title">Odhad podmínek · dalších 48 h</h2>
        <p>Body vycházejí z hodinové předpovědi počasí, ne z předpovědi záběrů.</p>
        <div className="fish-activity-forecast-chart">{forecast.map((point) => <div className="fish-activity-forecast-point" key={point.time}>
          <span className="fish-activity-forecast-bar" role="img" aria-label={`${point.label}: odhad ${point.score} ze 100`} style={{ height: `${Math.max(8, point.score)}%` }} />
          <span>{point.label}</span>
        </div>)}</div>
      </section>}
      {detailed && forecast.length === 0 && <section className="fish-activity-forecast" aria-labelledby="fish-activity-forecast-title">
        <h2 id="fish-activity-forecast-title">Odhad podmínek · dalších 48 h</h2>
        <p>Hodinová předpověď není dostupná; současný orientační odhad zůstává zobrazený.</p>
      </section>}

      <div className={detailed ? "fish-activity-actions" : "fish-activity-actions fish-activity-actions--compact"}>
        {!detailed && <Link className="fish-activity-detail-link" to="/fish-activity">Jak vzniká odhad <span aria-hidden="true">→</span></Link>}
        <button
          className="fish-activity-action"
          type="button"
          onClick={loadActivity}
        >
          Obnovit počasí
        </button>
      </div>
    </section>
  );
}

export default FishActivity;
