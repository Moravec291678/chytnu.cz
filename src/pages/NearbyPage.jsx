import { useEffect, useState } from "react";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { DEFAULT_PRIVACY_SETTINGS } from "../features/privacy/data/privacyModel.js";
import { privacyRepository } from "../features/privacy/data/privacyRepository.js";
import Layout from "../shared/layout/Layout";
import "./NearbyPage.css";

const POSITION_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 5 * 60 * 1000,
};

function positionErrorMessage(error) {
  if (error?.code === 1) return "Přístup k poloze byl zamítnut. Nastavení Okolí zůstalo beze změny.";
  if (error?.code === 2) return "Polohu se nepodařilo zjistit. Zkuste to znovu na místě se signálem.";
  if (error?.code === 3) return "Zjištění polohy trvalo příliš dlouho. Zkuste to znovu.";
  return "Toto zařízení teď neumí bezpečně zjistit polohu.";
}

function NearbyPage() {
  const scope = useDataScope();
  const [settings, setSettings] = useState(DEFAULT_PRIVACY_SETTINGS);
  const [settingsStatus, setSettingsStatus] = useState("loading");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [positionStatus, setPositionStatus] = useState("idle");
  const [positionMessage, setPositionMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (scope.status !== "ready") return () => { active = false; };
    privacyRepository.get(scope).then((value) => {
      if (!active) return;
      setSettings(value);
      setSettingsStatus("ready");
    }).catch(() => {
      if (active) setSettingsStatus("error");
    });
    return () => { active = false; };
  }, [scope]);

  const saveSetting = async (key, value) => {
    if (scope.status !== "ready" || settingsStatus === "saving") return;
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    setSettingsStatus("saving");
    setSettingsMessage("");
    try {
      const persisted = await privacyRepository.put(next, scope);
      setSettings(persisted);
      setSettingsStatus("ready");
      setSettingsMessage("Nastavení Okolí bylo uloženo jen pro tento profil.");
    } catch {
      setSettings(previous);
      setSettingsStatus("error");
      setSettingsMessage("Nastavení Okolí se nepodařilo uložit.");
    }
  };

  const checkOwnPosition = () => {
    setPositionMessage("");
    if (!navigator.geolocation) {
      setPositionStatus("error");
      setPositionMessage("Toto zařízení nepodporuje zjištění polohy.");
      return;
    }
    setPositionStatus("loading");
    navigator.geolocation.getCurrentPosition(
      () => {
        setPositionStatus("ready");
        setPositionMessage("Poloha byla ověřena pouze v této relaci. Souřadnice se neuložily ani nepublikovaly.");
      },
      (error) => {
        setPositionStatus("error");
        setPositionMessage(positionErrorMessage(error));
      },
      POSITION_OPTIONS,
    );
  };

  const unavailable = scope.status !== "ready" || settingsStatus === "loading";

  return (
    <Layout>
      <section className="nearby-page" aria-labelledby="nearby-title">
        <header className="nearby-header">
          <div>
            <h1 id="nearby-title">Okolí</h1>
            <p>Anonymizovaný přehled bez přesné polohy a jmen</p>
          </div>
          <span className="nearby-backend-badge">BACKEND_REQUIRED</span>
        </header>

        <section className="nearby-map-empty" aria-labelledby="nearby-map-title">
          <div className="nearby-map-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z" /><circle cx="12" cy="9" r="2.2" /></svg>
          </div>
          <strong id="nearby-map-title">Anonymizované body nejsou dostupné</strong>
          <p>Vzdálená data vyžadují backend, který sloučí dostatečný počet záznamů do hrubých oblastí. Proto zde nezobrazujeme žádné odhadované body ani počty.</p>
        </section>

        <section className="nearby-settings" aria-labelledby="nearby-settings-title">
          <div className="nearby-section-heading">
            <div><span>Soukromí</span><h2 id="nearby-settings-title">Moje nastavení Okolí</h2></div>
            <label className="nearby-switch">
              <input
                type="checkbox"
                checked={settings.nearbyOptIn}
                disabled={unavailable || settingsStatus === "saving"}
                onChange={(event) => saveSetting("nearbyOptIn", event.target.checked)}
              />
              <span aria-hidden="true" />
              <b>{settings.nearbyOptIn ? "Zapnuto" : "Vypnuto"}</b>
            </label>
          </div>
          <p>Souhlas pouze ukládá vaši preferenci. Dokud není připojen bezpečný agregační backend, nic se neodesílá ani nezveřejňuje.</p>
          <label className="nearby-precision">
            Požadovaná přesnost zveřejnění
            <select
              value={settings.nearbyLocationPrecision}
              disabled={unavailable || settingsStatus === "saving" || !settings.nearbyOptIn}
              onChange={(event) => saveSetting("nearbyLocationPrecision", event.target.value)}
            >
              <option value="approximate">Pouze hrubá oblast</option>
              <option value="none">Bez polohy</option>
            </select>
          </label>
          <small>Přesné GPS souřadnice nejsou pro Nearby povolené.</small>
          {settingsStatus === "error" && !settingsMessage && <p className="nearby-error" role="alert">Nastavení soukromí se nepodařilo načíst.</p>}
          {settingsMessage && <p className={settingsStatus === "error" ? "nearby-error" : "nearby-feedback"} role="status">{settingsMessage}</p>}
        </section>

        <section className="nearby-local-position" aria-labelledby="nearby-position-title">
          <div>
            <span>Jen toto zařízení</span>
            <h2 id="nearby-position-title">Moje aktuální poloha</h2>
          </div>
          <p>Jednorázově ověří dostupnost polohy. Hodnota zůstane pouze v paměti této otevřené stránky a nikde se nezobrazí jako souřadnice.</p>
          <div className={`nearby-position-state nearby-position-state-${positionStatus}`}>
            <strong>{positionStatus === "ready" ? "Poloha ověřena lokálně" : positionStatus === "loading" ? "Zjišťuji polohu…" : "Poloha není načtená"}</strong>
            <span>{positionMessage || "Není uložena ani sdílena."}</span>
          </div>
          <button className="nearby-check-in" type="button" onClick={checkOwnPosition} disabled={positionStatus === "loading"}>
            {positionStatus === "loading" ? "Ověřuji…" : "Jsem tady"}
          </button>
          <small>Tlačítko nepublikuje check in. Vzdálené sdílení polohy není bez backendu aktivní.</small>
        </section>

        <section className="nearby-remote-grid" aria-label="Stav vzdálených dat v okolí">
          <article><span>Poslední úlovky poblíž</span><strong>Data nejsou dostupná</strong><p>Žádné vzdálenosti ani cizí úlovky bez bezpečné agregace.</p></article>
          <article><span>Druhy v okolí</span><strong>Data nejsou dostupná</strong><p>Žádné počty druhů nejsou dopočítané nebo vymyšlené.</p></article>
        </section>
      </section>
    </Layout>
  );
}

export default NearbyPage;
