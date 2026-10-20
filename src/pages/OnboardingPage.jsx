import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { readPreferences, savePreferences, completeOnboarding as markOnboardingComplete } from "../features/preferences/data/preferences.js";
import { DEFAULT_PRIVACY_SETTINGS } from "../features/privacy/data/privacyModel.js";
import { privacyRepository } from "../features/privacy/data/privacyRepository.js";
import { applyOnboardingLocationMode, getOnboardingLocationMode } from "../features/privacy/data/onboardingLocationPreference.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import "./OnboardingPage.css";

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [modeSelection, setModeSelection] = useState({ scopeKey: null, value: null });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [locationData, setLocationData] = useState({ scopeKey: null, status: "idle", settings: null, mode: "approximate" });
  const [permissionStatus, setPermissionStatus] = useState("idle");
  const permissionAttempt = useRef(0);
  const navigate = useNavigate();
  const scope = useDataScope();

  useEffect(() => {
    if (step !== 2 || scope.status !== "ready") return undefined;
    let active = true;
    privacyRepository.get(scope).then((settings) => {
      if (!active) return;
      setLocationData({
        scopeKey: scope.scopeKey,
        status: "ready",
        settings,
        mode: settings.hasSavedSettings ? getOnboardingLocationMode(settings) : "approximate",
      });
    }).catch(() => {
      if (!active) return;
      setLocationData({ scopeKey: scope.scopeKey, status: "error", settings: DEFAULT_PRIVACY_SETTINGS, mode: "approximate" });
      setMessage("Nastavení polohy se nepodařilo načíst. Můžeš pokračovat bez GPS.");
    });
    return () => { active = false; };
  }, [scope, step]);

  const detailMode = scope.status === "ready"
    ? modeSelection.scopeKey === scope.scopeKey
      ? modeSelection.value
      : readPreferences(globalThis.localStorage, scope.scopeKey).detailMode
    : null;

  const selectDetailMode = (nextMode) => {
    if (scope.status !== "ready") return;
    try {
      const preferences = savePreferences({ detailMode: nextMode }, globalThis.localStorage, scope.scopeKey);
      setModeSelection({ scopeKey: scope.scopeKey, value: preferences.detailMode });
      setError("");
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  const saveLocationMode = async (mode = locationData.mode) => {
    const currentSettings = locationData.scopeKey === scope.scopeKey && locationData.settings
      ? locationData.settings
      : DEFAULT_PRIVACY_SETTINGS;
    const updated = await privacyRepository.put(applyOnboardingLocationMode(currentSettings, mode), scope);
    const nextData = { scopeKey: scope.scopeKey, status: "ready", settings: { ...updated, hasSavedSettings: true }, mode };
    setLocationData(nextData);
    return nextData;
  };

  const finishOnboarding = async (destination, preferenceAlreadySaved = false) => {
    permissionAttempt.current += 1;
    setError("");
    try {
      if (!preferenceAlreadySaved && (locationData.scopeKey !== scope.scopeKey || !locationData.settings?.hasSavedSettings)) {
        await saveLocationMode(locationData.mode);
      }
      markOnboardingComplete(scope.scopeKey);
      navigate(destination, { replace: true });
    } catch {
      setError("Nastavení se nepodařilo uložit. Zkus to znovu, nebo pokračuj bez změny polohy.");
    }
  };

  const selectLocationMode = async (mode) => {
    if (locationData.status === "saving") return;
    setError("");
    setMessage("");
    setPermissionStatus("idle");
    setLocationData((current) => ({ ...current, status: "saving" }));
    try {
      const updated = await privacyRepository.put(
        applyOnboardingLocationMode(locationData.settings ?? DEFAULT_PRIVACY_SETTINGS, mode),
        scope,
      );
      setLocationData({ scopeKey: scope.scopeKey, status: "ready", settings: { ...updated, hasSavedSettings: true }, mode });
    } catch {
      setLocationData((current) => ({ ...current, status: "ready" }));
      setError("Volbu přesnosti polohy se nepodařilo uložit.");
    }
  };

  const allowLocation = async () => {
    if (permissionStatus === "requesting" || locationData.status === "saving") return;
    setError("");
    setMessage("");

    try {
      if (locationData.scopeKey !== scope.scopeKey || !locationData.settings?.hasSavedSettings) {
        await saveLocationMode(locationData.mode);
      }
    } catch {
      setError("Volbu přesnosti polohy se nepodařilo uložit. Zkus to znovu.");
      return;
    }

    if (locationData.mode === "none") {
      await finishOnboarding("/add", true);
      return;
    }
    if (!navigator.geolocation) {
      setPermissionStatus("unavailable");
      setMessage("Tento prohlížeč polohu neposkytuje. Můžeš pokračovat bez GPS.");
      return;
    }

    const attempt = ++permissionAttempt.current;
    setPermissionStatus("requesting");
    try {
      navigator.geolocation.getCurrentPosition(
        () => {
          if (permissionAttempt.current !== attempt) return;
          setPermissionStatus("granted");
          void finishOnboarding("/add", true);
        },
        (locationError) => {
          if (permissionAttempt.current !== attempt) return;
          setPermissionStatus(locationError?.code === 1 ? "denied" : "error");
          setMessage(locationError?.code === 1
            ? "Poloha nebyla povolena. Můžeš pokračovat bez ní."
            : "Polohu se nepodařilo zjistit. Můžeš pokračovat bez ní.");
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
      );
    } catch {
      if (permissionAttempt.current === attempt) {
        setPermissionStatus("error");
        setMessage("Polohu se nepodařilo zjistit. Můžeš pokračovat bez ní.");
      }
    }
  };

  if (scope.status !== "ready" || detailMode === null) {
    const loading = <p className="loading-state" role="status">Připravuji místní profil…</p>;
    return step === 1
      ? <main className="onboarding-step-one">{loading}</main>
      : <main className="onboarding-step-two">{loading}</main>;
  }

  if (step === 1) {
    return (
      <main className="onboarding-step-one">
        <section className="onboarding-step-one-content" aria-labelledby="onboarding-step-one-title">
          <h1 id="onboarding-step-one-title">Jak chceš rybařit?</h1>
          <p className="onboarding-step-one-count">1 ze 2</p>
          <div className="onboarding-mode-options" role="group" aria-label="Výchozí režim zápisu">
            <button
              className={`onboarding-mode-option${detailMode === "simple" ? " is-selected" : ""}`}
              type="button"
              aria-pressed={detailMode === "simple"}
              onClick={() => selectDetailMode("simple")}
            >
              <span className="onboarding-mode-title">Jednoduše</span>
              <span className="onboarding-mode-description">Zápis do 30 vteřin, bez zbytečností.</span>
            </button>
            <button
              className={`onboarding-mode-option${detailMode === "detailed" ? " is-selected" : ""}`}
              type="button"
              aria-pressed={detailMode === "detailed"}
              onClick={() => selectDetailMode("detailed")}
            >
              <span className="onboarding-mode-title">Do detailů</span>
              <span className="onboarding-mode-description">Metoda, nástraha, podmínky, statistiky.</span>
            </button>
          </div>
          <p className="onboarding-mode-note">Kdykoli změníš v Profilu.</p>
          {error && <p className="onboarding-step-one-error" role="alert">{error}</p>}
        </section>
        <button className="onboarding-step-one-continue" type="button" onClick={() => setStep(2)}>
          Pokračovat
        </button>
      </main>
    );
  }

  if (locationData.scopeKey !== scope.scopeKey || locationData.status === "idle" || locationData.status === "loading") {
    return <main className="onboarding-step-two"><p className="loading-state" role="status">Připravuji nastavení polohy…</p></main>;
  }

  return (
    <main className="onboarding-step-two">
      <section className="onboarding-step-two-content" aria-labelledby="onboarding-step-two-title">
        <h1 id="onboarding-step-two-title">První úlovek</h1>
        <p className="onboarding-step-two-count">2 ze 2</p>
        <ol className="onboarding-first-catch-list">
          <li>1 · Fotka</li>
          <li>2 · Druh</li>
          <li>3 · Váha a délka</li>
        </ol>
        <p className="onboarding-location-description">Místo, čas a počasí se doplní samo.</p>
        <div className="onboarding-location-options" role="group" aria-label="Výchozí přesnost polohy">
          {[ ["exact", "Přesně"], ["approximate", "Přibližně"], ["none", "Bez GPS"] ].map(([mode, label]) => (
            <button
              key={mode}
              className={`onboarding-location-option${locationData.mode === mode ? " is-selected" : ""}`}
              type="button"
              aria-pressed={locationData.mode === mode}
              disabled={locationData.status === "saving"}
              onClick={() => void selectLocationMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        {(message || permissionStatus === "denied") && <p className="onboarding-location-message" role="status">{message || "Poloha nebyla povolena. Můžeš pokračovat bez ní."}</p>}
        {error && <p className="onboarding-step-two-error" role="alert">{error}</p>}
      </section>
      <div className="onboarding-step-two-actions">
        <button
          className="onboarding-step-two-allow"
          type="button"
          disabled={permissionStatus === "requesting" || locationData.status === "saving"}
          onClick={() => void allowLocation()}
        >
          {permissionStatus === "requesting" ? "Zjišťuji polohu…" : locationData.mode === "none" ? "Pokračovat bez GPS" : "Povolit polohu"}
        </button>
        <button className="onboarding-step-two-skip" type="button" disabled={locationData.status === "saving"} onClick={() => void finishOnboarding("/")}>
          Teď ne
        </button>
      </div>
    </main>
  );
}
