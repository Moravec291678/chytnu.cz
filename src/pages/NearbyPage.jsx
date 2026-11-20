import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { DEFAULT_PRIVACY_SETTINGS } from "../features/privacy/data/privacyModel.js";
import { privacyRepository } from "../features/privacy/data/privacyRepository.js";
import { socialRequest } from "../features/social/data/socialClient.js";
import NearbyCatalogueWaters from "../features/waters/components/NearbyCatalogueWaters.jsx";
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
  return <NearbyForScope key={`${scope.scopeKey}:${scope.status}`} scope={scope} />;
}

function NearbyForScope({ scope }) {
  const attempt = useRef(0);
  const [settings, setSettings] = useState(DEFAULT_PRIVACY_SETTINGS);
  const [settingsStatus, setSettingsStatus] = useState("loading");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [positionStatus, setPositionStatus] = useState("idle");
  const [positionMessage, setPositionMessage] = useState("");
  const [presenceConsent, setPresenceConsent] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentOwnerKey, setConsentOwnerKey] = useState(null);
  const [presenceCount, setPresenceCount] = useState(null);
  const [presenceExpiresAt, setPresenceExpiresAt] = useState(null);
  const [presenceOwnerKey, setPresenceOwnerKey] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [discovery, setDiscovery] = useState({ status: "idle" });

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
    return () => { active = false; attempt.current += 1; };
  }, [scope]);

  useEffect(() => {
    if (scope.status !== "ready" || !scope.ownerId) return undefined;
    const controller = new AbortController();
    const request = attempt.current;
    socialRequest("nearby.status", {}, { signal: controller.signal, expectedUid: scope.ownerId }).then(({ accepted, showProfile: profileAllowed, expiresAt }) => {
      if (controller.signal.aborted || request !== attempt.current) return;
      setPresenceConsent(accepted);
      setShowProfile(profileAllowed);
      setConsentOwnerKey(scope.scopeKey);
      if (expiresAt) {
        setPresenceOwnerKey(scope.scopeKey);
        setPresenceExpiresAt(expiresAt);
        setPositionStatus("ready");
        setPositionMessage("Přítomnost je aktivní. Kdykoli ji můžeš vypnout.");
      }
    }).catch(() => {
      if (!controller.signal.aborted && request === attempt.current) setSettingsMessage("Aktuální stav sdílení se nepodařilo ověřit.");
    });
    return () => controller.abort();
  }, [scope.ownerId, scope.scopeKey, scope.status]);

  useEffect(() => {
    if (!presenceExpiresAt) return undefined;
    const timer = setTimeout(() => {
      setPresenceCount(null);
      setPresenceExpiresAt(null);
      setPositionStatus("idle");
      setDiscovery({ status: "idle" });
      setPositionMessage("Anonymní přítomnost vypršela.");
    }, Math.max(0, presenceExpiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [presenceExpiresAt]);

  useEffect(() => {
    if (discovery.status !== "ready" || !discovery.profiles.length) return undefined;
    const timer = setTimeout(() => setDiscovery({ status: "idle" }), 30_000);
    return () => clearTimeout(timer);
  }, [discovery]);

  const saveSetting = async (key, value) => {
    if (scope.status !== "ready" || settingsStatus === "saving" || consentSaving) return;
    const disabling = (key === "nearbyOptIn" && value === false)
      || (key === "nearbyLocationPrecision" && value === "none");
    const request = disabling ? ++attempt.current : attempt.current;
    if (disabling) {
      setDiscovery({ status: "idle" });
      if (positionStatus === "loading") setPositionStatus("idle");
    }
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    setSettingsStatus("saving");
    setSettingsMessage("");
    try {
      const persisted = await privacyRepository.put(next, scope);
      if (request !== attempt.current) return;
      setSettings(persisted);
      setSettingsStatus("ready");
      if (disabling && scope.ownerId) {
        try {
          await socialRequest("nearby.consent", { accepted: false }, { expectedUid: scope.ownerId });
          if (request !== attempt.current) return;
          setPresenceConsent(false); setPresenceCount(null); setPresenceExpiresAt(null); setPresenceOwnerKey(null); setConsentOwnerKey(scope.scopeKey);
          setShowProfile(false);
          setSettingsMessage("Nastavení uloženo a sdílení přítomnosti vypnuto.");
        } catch {
          setSettingsStatus("error");
          setSettingsMessage("Vypnuto na tomto zařízení. Vzdálená přítomnost nejpozději sama vyprší za 20 minut.");
        }
      } else setSettingsMessage("Nastavení Okolí bylo uloženo jen pro tento profil.");
    } catch {
      setSettings(previous);
      setSettingsStatus("error");
      setSettingsMessage("Nastavení Okolí se nepodařilo uložit.");
    }
  };

  const updatePresenceConsent = async (accepted, shareProfile = false) => {
    if (scope.status !== "ready" || consentSaving) return;
    const ownerKey = scope.scopeKey;
    const request = ++attempt.current;
    setConsentSaving(true);
    setPositionMessage("");
    setDiscovery({ status: "idle" });
    try {
      await socialRequest("nearby.consent", { accepted, showProfile: shareProfile }, { expectedUid: scope.ownerId });
      if (request !== attempt.current) return;
      setPresenceConsent(accepted);
      setShowProfile(shareProfile);
      setConsentOwnerKey(ownerKey);
      if (!accepted) {
        setPresenceCount(null); setPresenceExpiresAt(null); setPresenceOwnerKey(null);
        setPositionStatus("idle"); setPositionMessage("Souhlas byl odvolán a přítomnost vypnuta.");
      }
    } catch (error) {
      if (request === attempt.current) { setPositionStatus("error"); setPositionMessage(error.message || "Souhlas se nepodařilo změnit."); }
    } finally { setConsentSaving(false); }
  };

  const joinNearby = () => {
    setPositionMessage("");
    if (!settings.nearbyOptIn || settings.nearbyLocationPrecision !== "approximate" || !presenceConsent || consentOwnerKey !== scope.scopeKey || consentSaving) {
      setPositionStatus("error");
      setPositionMessage("Nejdřív zapni Okolí, zvol hrubou oblast (ne „Bez polohy“) a potvrď souhlas.");
      return;
    }
    const request = ++attempt.current;
    setPresenceOwnerKey(scope.scopeKey);
    setDiscovery({ status: "idle" });
    setPresenceCount(null);
    setPresenceExpiresAt(null);
    if (!navigator.geolocation) {
      setPositionStatus("error");
      setPositionMessage("Toto zařízení nepodporuje zjištění polohy.");
      return;
    }
    setPositionStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async position => {
        if (request !== attempt.current) return;
        try {
          const result = await socialRequest("nearby.join", { latitude: position.coords.latitude, longitude: position.coords.longitude }, { expectedUid: scope.ownerId });
          if (request !== attempt.current) return;
          setPresenceCount(result.nearbyCount);
          setPresenceExpiresAt(result.expiresAt);
          setPositionStatus("ready");
          setPositionMessage(`Sdílená je pouze hrubá oblast. Přítomnost vyprší za 20 minut.${result.nearbyCount ? ` V oblasti je alespoň ${result.nearbyCount} účastníků.` : " Počet účastníků se zobrazí až od pěti lidí."}`);
        } catch (error) {
          if (request !== attempt.current) return;
          setPositionStatus("error");
          setPositionMessage(error.message || "Přítomnost se nepodařilo zapnout.");
        }
      },
      (error) => {
        if (request !== attempt.current) return;
        setPositionStatus("error");
        setPositionMessage(positionErrorMessage(error));
      },
      POSITION_OPTIONS,
    );
  };

  const unavailable = scope.status !== "ready" || settingsStatus === "loading";
  const ownPresence = presenceOwnerKey === scope.scopeKey;
  const currentConsent = presenceConsent && consentOwnerKey === scope.scopeKey;
  const visiblePresenceCount = ownPresence ? presenceCount : null;
  const visiblePositionStatus = ownPresence ? positionStatus : "idle";
  const visiblePositionMessage = ownPresence ? positionMessage : "Není uložena ani sdílena.";

  async function discoverProfiles() {
    const request = attempt.current;
    setDiscovery({ status: "loading" });
    try {
      const { active, profiles } = await socialRequest("nearby.discover", {}, { expectedUid: scope.ownerId });
      if (request === attempt.current && Date.now() < presenceExpiresAt) setDiscovery({ status: "ready", active, profiles });
    } catch (error) {
      if (request === attempt.current && Date.now() < presenceExpiresAt) setDiscovery({ status: "error", message: error.message });
    }
  }

  return (
    <Layout>
      <section className="nearby-page" aria-labelledby="nearby-title">
        <header className="nearby-header">
          <div>
            <h1 id="nearby-title">Okolí</h1>
            <p>Anonymizovaný přehled bez přesné polohy a jmen</p>
          </div>
          <span className="nearby-backend-badge">Dobrovolné a anonymní</span>
        </header>

        <section className="nearby-map-empty" aria-labelledby="nearby-map-title">
          <div className="nearby-map-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z" /><circle cx="12" cy="9" r="2.2" /></svg>
          </div>
          <strong id="nearby-map-title">{visiblePresenceCount ? `V hrubé oblasti je alespoň ${visiblePresenceCount} rybářů` : "Přesné polohy se nezobrazují"}</strong>
          <p>Souhrnný počet se ukáže od pěti účastníků. Sdílení přítomnosti se automaticky ukončí po 20 minutách.</p>
        </section>

        <section className="nearby-settings" aria-labelledby="nearby-settings-title">
          <div className="nearby-section-heading">
            <div><span>Soukromí</span><h2 id="nearby-settings-title">Moje nastavení Okolí</h2></div>
            <label className="nearby-switch">
              <input
                type="checkbox"
                checked={settings.nearbyOptIn}
                disabled={unavailable || settingsStatus === "saving" || consentSaving}
                onChange={(event) => saveSetting("nearbyOptIn", event.target.checked)}
              />
              <span aria-hidden="true" />
              <b>{settings.nearbyOptIn ? "Zapnuto" : "Vypnuto"}</b>
            </label>
          </div>
          <p>Zapnutí této volby samo o sobě polohu neodesílá. Přítomnost spustíš až samostatným potvrzením a povolením polohy.</p>
          <label className="nearby-precision">
            Požadovaná přesnost zveřejnění
            <select
              value={settings.nearbyLocationPrecision}
              disabled={unavailable || settingsStatus === "saving" || consentSaving || !settings.nearbyOptIn}
              onChange={(event) => saveSetting("nearbyLocationPrecision", event.target.value)}
            >
              <option value="approximate">Pouze hrubá oblast</option>
              <option value="none">Bez polohy</option>
            </select>
          </label>
          <small>Přesná poloha se nezveřejňuje.</small>
          {settingsStatus === "error" && !settingsMessage && <p className="nearby-error" role="alert">Nastavení soukromí se nepodařilo načíst.</p>}
          {settingsMessage && <p className={settingsStatus === "error" ? "nearby-error" : "nearby-feedback"} role="status">{settingsMessage}</p>}
        </section>

        <section className="nearby-local-position" aria-labelledby="nearby-position-title">
          <div>
            <span>Dočasné sdílení</span>
            <h2 id="nearby-position-title">Moje aktuální poloha</h2>
          </div>
          <p>Při zapnutí odešle zařízení souřadnice zabezpečenému serveru, který je ihned převede na hrubou oblast. Přesné souřadnice se neukládají ani nevracejí.</p>
          <label className="nearby-consent">
            <input type="checkbox" checked={currentConsent} disabled={consentSaving || unavailable || !scope.ownerId || settingsStatus === "saving" || (!currentConsent && !settings.nearbyOptIn)} onChange={event => updatePresenceConsent(event.target.checked)} />
            <span>Souhlasím s dočasným sdílením hrubé oblasti pro souhrnný počet od pěti rybářů.</span>
          </label>
          <label className="nearby-consent">
            <input type="checkbox" checked={currentConsent && showProfile} disabled={!currentConsent || consentSaving || settingsStatus === "saving" || visiblePositionStatus === "loading"} onChange={event => updatePresenceConsent(true, event.target.checked)} />
            <span>Dovoluji zobrazit odkaz na svůj dohledatelný veřejný profil účastníkům ve stejné hrubé oblasti po dobu mé přítomnosti.</span>
          </label>
          <div className={`nearby-position-state nearby-position-state-${visiblePositionStatus}`}>
            <strong>{visiblePositionStatus === "ready" ? "Anonymní přítomnost zapnuta" : visiblePositionStatus === "loading" ? "Zjišťuji polohu…" : "Poloha není načtená"}</strong>
            <span>{visiblePositionMessage || "Není uložena ani sdílena."}</span>
          </div>
          <div className="nearby-actions">
            <button className="nearby-check-in" type="button" onClick={joinNearby} disabled={visiblePositionStatus === "loading" || consentSaving || !currentConsent || !settings.nearbyOptIn || settings.nearbyLocationPrecision !== "approximate"}>
              {visiblePositionStatus === "loading" ? "Zapínám…" : "Zapnout anonymní přítomnost"}
            </button>
            <button className="nearby-stop" type="button" disabled={consentSaving || unavailable || !scope.ownerId || settingsStatus === "saving"} onClick={() => updatePresenceConsent(false)}>Vypnout moje sdílení</button>
          </div>
          <small>Server dostává pouze přechodně souřadnice nutné k výpočtu hrubé oblasti.</small>
        </section>

        <section className="nearby-settings" aria-labelledby="nearby-fishers-title">
          <h2 id="nearby-fishers-title">Rybáři v okolí</h2>
          <p>Zobrazí se pouze veřejné profily rybářů, kteří s tím výslovně souhlasili. Jejich přesnou polohu nevidíš.</p>
          <button className="nearby-check-in" type="button" onClick={discoverProfiles} disabled={visiblePositionStatus !== "ready" || discovery.status === "loading" || consentSaving}>Načíst rybáře</button>
          {visiblePositionStatus !== "ready" && <p>Pro hledání nejdřív zapni přítomnost.</p>}
          {discovery.status === "loading" && <p role="status">Načítám rybáře…</p>}
          {discovery.status === "error" && <p className="nearby-error" role="alert">{discovery.message}</p>}
          {discovery.status === "ready" && (discovery.profiles.length ? <ul className="nearby-catalogue-list">
            {discovery.profiles.map(profile => <li key={profile.handle}><Link to={`/u/${encodeURIComponent(profile.handle)}`}>{profile.displayName} · @{profile.handle}</Link></li>)}
          </ul> : <p role="status">{discovery.active ? "V této oblasti nyní nejsou dostupné žádné profily." : "Přítomnost už není aktivní."}</p>)}
        </section>
        <NearbyCatalogueWaters ownerId={scope.ownerId} />
      </section>
    </Layout>
  );
}

export default NearbyPage;
