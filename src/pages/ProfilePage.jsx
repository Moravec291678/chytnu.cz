import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatCatchWeight, isMeasuredCatchWeight } from "../features/catches/data/catchWeight.js";
import Layout from "../shared/layout/Layout";
import { useAuth } from "../features/auth/context/authContextValue.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useSync } from "../features/sync/context/syncContextValue.js";
import { getLocalBackupFileName, serializeLocalBackupJson } from "../features/backup/data/backupFormat.js";
import { readLocalBackupSnapshot } from "../features/backup/data/localBackupRepository.js";
import {
  MAX_BACKUP_FILE_BYTES,
  parseLocalBackupJson,
  restoreLocalBackup,
  summarizeLocalBackupRestore,
} from "../features/backup/data/backupRestore.js";
import {
  linkGuestData,
  listSyncConflicts,
  readGuestSummary,
  resolveSyncConflict,
} from "../features/sync/data/localSyncRepository.js";
import { getActiveGuestScopeKey } from "../features/catches/data/catchRepository.js";
import { validateAuthForm } from "../features/auth/data/authFormValidation.js";
import ConfirmDialog from "../shared/components/ConfirmDialog";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { useProgression } from "../features/progression/context/progressionContextValue.js";
import { getBestWater, getBiggestCatch } from "../features/home/utils/profileStats";
import CatchCard from "../features/catches/components/CatchCard";
import { buildSpeciesAlbum } from "../features/species/data/speciesAlbum";
import { DEFAULT_SPECIES } from "../shared/constants/constants";
import { readTrophySelection, saveTrophySelection } from "../features/species/data/trophySelection.js";
import { readPreferences, savePreferences } from "../features/preferences/data/preferences.js";
import { DEFAULT_PRIVACY_SETTINGS } from "../features/privacy/data/privacyModel.js";
import { privacyRepository } from "../features/privacy/data/privacyRepository.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import "./ProfilePage.css";

function formatCount(count, one, few, many) {
  if (count === 1) return `${count} ${one}`;
  if (count >= 2 && count <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

function ProfilePage() {
  const fileInput = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [reading, setReading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backup, setBackup] = useState(null);
  const [summary, setSummary] = useState(null);
  const [mode, setMode] = useState("merge");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authFormError, setAuthFormError] = useState("");
  const [ownerless, setOwnerless] = useState({ catches: 0, trips: 0, photos: 0 });
  const [conflicts, setConflicts] = useState([]);
  const [accountDataError, setAccountDataError] = useState("");
  const [dataActionBusy, setDataActionBusy] = useState(false);
  const [confirmingLink, setConfirmingLink] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [trophySelection, setTrophySelection] = useState({ scopeKey: null, ids: [] });
  const [trophyError, setTrophyError] = useState("");
  const [waters, setWaters] = useState({ scopeKey: null, records: [] });
  const [privacyData, setPrivacyData] = useState({ scopeKey: null, settings: DEFAULT_PRIVACY_SETTINGS, loading: true, error: "" });
  const [privacySaving, setPrivacySaving] = useState(false);
  const [preferenceOverride, setPreferenceOverride] = useState({ scopeKey: null, value: null });
  const [preferenceError, setPreferenceError] = useState("");
  const [pendingConflict, setPendingConflict] = useState(null);
  const authActionRef = useRef(false);
  const dataActionRef = useRef(false);
  const backupActionRef = useRef(false);
  const auth = useAuth();
  const dataScope = useDataScope();
  const sync = useSync();
  const { state: catchState } = useCatches();
  const { state: tripState } = useTrips();
  const { summary: progression } = useProgression();
  const { status: scopeStatus, scopeKey, ownerId } = dataScope;
  const privacyLoading = dataScope.status !== "ready" || privacyData.scopeKey !== dataScope.scopeKey || privacyData.loading;
  const privacySettings = privacyData.scopeKey === dataScope.scopeKey ? privacyData.settings : DEFAULT_PRIVACY_SETTINGS;
  const privacyError = privacyData.scopeKey === dataScope.scopeKey ? privacyData.error : "";
  const preferences = preferenceOverride.value && preferenceOverride.scopeKey === dataScope.scopeKey
    ? preferenceOverride.value
    : readPreferences(globalThis.localStorage, dataScope.scopeKey);
  const recordCatch = getBiggestCatch(catchState.catches);
  const bestWater = getBestWater(catchState.catches, waters.scopeKey === dataScope.scopeKey ? waters.records : []);
  const trophyCatches = useMemo(
    () => [...catchState.catches].sort((left, right) => {
      const weightDelta = (isMeasuredCatchWeight(right) ? right.weightKg : -1) - (isMeasuredCatchWeight(left) ? left.weightKg : -1);
      if (weightDelta) return weightDelta;
      const lengthDelta = (Number.isFinite(right.lengthCm) ? right.lengthCm : -1) - (Number.isFinite(left.lengthCm) ? left.lengthCm : -1);
      return lengthDelta || Date.parse(right.caughtAt) - Date.parse(left.caughtAt);
    }),
    [catchState.catches],
  );
  const trophySelectionLoaded = dataScope.status === "ready";
  const savedTrophyIds = trophySelection.scopeKey === dataScope.scopeKey
    ? trophySelection.ids
    : (readTrophySelection(dataScope.scopeKey) ?? trophyCatches.slice(0, 5).map((item) => item.id));
  const selectedTrophyIds = savedTrophyIds.filter((id) => trophyCatches.some((item) => item.id === id));
  const speciesPreview = useMemo(
    () => buildSpeciesAlbum(catchState.catches, DEFAULT_SPECIES).filter((item) => item.discovered).slice(0, 4),
    [catchState.catches],
  );
  const profileIdentity = auth.user?.displayName?.trim() || (auth.user ? "Můj profil" : "Místní deník");
  const avatarInitial = auth.user
    ? profileIdentity.trim().charAt(0).toLocaleUpperCase("cs-CZ")
    : "🎣";
  const accountEnvironment = auth.mode === "emulator"
    ? "Účet v této vývojové verzi používá pouze lokální Firebase emulátor."
    : auth.mode === "staging"
      ? "Účet je připojený k oddělenému stagingovému prostředí."
      : auth.mode === "production"
        ? "Účet je připojený k produkčnímu prostředí."
        : "Účet pro toto prostředí zatím není nastavený.";

  useEffect(() => {
    let active = true;
    if (scopeStatus !== "ready") return () => { active = false; };
    const scope = { scopeKey, ownerId };
    privacyRepository.get(scope).then((settings) => {
      if (active) setPrivacyData({ scopeKey: scope.scopeKey, settings, loading: false, error: "" });
    }).catch((loadError) => {
      if (active) setPrivacyData({ scopeKey: scope.scopeKey, settings: DEFAULT_PRIVACY_SETTINGS, loading: false, error: loadError?.message || "Nastavení soukromí se nepodařilo načíst." });
    });
    return () => { active = false; };
  }, [scopeStatus, scopeKey, ownerId]);

  useEffect(() => {
    let active = true;
    if (scopeStatus !== "ready") return () => { active = false; };
    const scope = { scopeKey, ownerId };
    waterRepository.list(scope).then((records) => {
      if (active) setWaters({ scopeKey: scope.scopeKey, records });
    }).catch(() => {
      if (active) setWaters({ scopeKey: scope.scopeKey, records: [] });
    });
    return () => { active = false; };
  }, [scopeStatus, scopeKey, ownerId]);

  const updateProfileVisibility = async (isPublic) => {
    if (dataScope.status !== "ready" || privacySaving) return;
    setPrivacySaving(true);
    setPrivacyData((current) => ({ ...current, error: "" }));
    try {
      const saved = await privacyRepository.put({
        ...privacySettings,
        profileVisibility: isPublic ? "public" : "private",
      }, dataScope);
      setPrivacyData({ scopeKey: dataScope.scopeKey, settings: saved, loading: false, error: "" });
    } catch (saveError) {
      setPrivacyData((current) => ({ ...current, error: saveError?.message || "Viditelnost profilu se nepodařilo uložit." }));
    } finally {
      setPrivacySaving(false);
    }
  };

  const updateDetailMode = (detailMode) => {
    if (dataScope.status !== "ready") return;
    try {
      setPreferenceOverride({
        scopeKey: dataScope.scopeKey,
        value: savePreferences({ detailMode }, globalThis.localStorage, dataScope.scopeKey),
      });
      setPreferenceError("");
    } catch (saveError) {
      setPreferenceError(saveError?.message || "Režim zápisu se nepodařilo uložit.");
    }
  };

  const refreshAccountData = useCallback(async () => {
    try {
      const guestScopeKey = await getActiveGuestScopeKey();
      const [localSummary, accountConflicts] = await Promise.all([
        readGuestSummary(guestScopeKey),
        auth.user ? listSyncConflicts(auth.user.uid) : Promise.resolve([]),
      ]);
      setOwnerless(localSummary);
      setConflicts(accountConflicts);
      setAccountDataError("");
    } catch (readError) {
      const message = readError?.message || "Stav místních dat a konfliktů se nepodařilo načíst.";
      setAccountDataError(message);
      throw readError;
    }
  }, [auth.user]);

  useEffect(() => {
    let active = true;
    getActiveGuestScopeKey().then((guestScopeKey) => Promise.all([
      readGuestSummary(guestScopeKey),
      auth.user ? listSyncConflicts(auth.user.uid) : Promise.resolve([]),
    ])).then(([localSummary, accountConflicts]) => {
      if (!active) return;
      setOwnerless(localSummary);
      setConflicts(accountConflicts);
      setAccountDataError("");
    }).catch((readError) => {
      if (active) setAccountDataError(readError?.message || "Stav místních dat a konfliktů se nepodařilo načíst.");
    });
    return () => { active = false; };
  }, [auth.user, sync.conflicts, sync.pending]);

  const linkLocalJournal = () => {
    if (!auth.user || dataActionRef.current || ownerless.catches + ownerless.trips === 0) return;
    setConfirmingLink(true);
  };

  const performLinkLocalJournal = async () => {
    if (!auth.user || dataActionRef.current || ownerless.catches + ownerless.trips === 0) return;
    setConfirmingLink(false);
    dataActionRef.current = true;
    setDataActionBusy(true);
    setError("");
    try {
      const guestScopeKey = await getActiveGuestScopeKey();
      const result = await linkGuestData(auth.user.uid, guestScopeKey);
      window.dispatchEvent(new Event("chytnu:local-data-restored"));
      window.dispatchEvent(new Event("chytnu:outbox-changed"));
      setMessage(`K účtu bylo bezpečně propojeno ${result.catches} úlovků, ${result.trips} výprav a ${result.photos} fotografií. Místní data zůstala zachována.`);
      await refreshAccountData();
    } catch (linkError) {
      setError(linkError?.message || "Deník se nepodařilo propojit. Data zůstala beze změny.");
    } finally { dataActionRef.current = false; setDataActionBusy(false); }
  };

  const resolveConflict = (conflict, choice) => {
    if (!auth.user || dataActionRef.current) return;
    setPendingConflict({ conflict, choice });
  };

  const performResolveConflict = async () => {
    if (!auth.user || dataActionRef.current || !pendingConflict) return;
    const { conflict, choice } = pendingConflict;
    setPendingConflict(null);
    const label = choice === "local" ? "místní" : "vzdálenou";
    dataActionRef.current = true;
    setDataActionBusy(true);
    setError("");
    try {
      await resolveSyncConflict(auth.user.uid, conflict.id, choice);
      window.dispatchEvent(new Event("chytnu:local-data-restored"));
      window.dispatchEvent(new Event("chytnu:outbox-changed"));
      setMessage(`Konflikt byl vyřešen volbou: ${label} verze.`);
      await refreshAccountData();
    } catch (resolveError) {
      setError(resolveError?.message || "Konflikt se nepodařilo vyřešit. Obě verze zůstaly zachované.");
    } finally { dataActionRef.current = false; setDataActionBusy(false); }
  };

  const runAuthAction = async (action, successMessage) => {
    if (authActionRef.current) return null;
    authActionRef.current = true;
    setAuthBusy(true);
    setAuthMessage("");
    auth.clearError();
    try {
      const result = await action();
      if (successMessage) setAuthMessage(typeof successMessage === "function" ? successMessage(result) : successMessage);
      return result;
    } catch {
      // AuthContext exposes a user-facing Czech error without Firebase internals.
      return null;
    } finally {
      authActionRef.current = false;
      setAuthBusy(false);
    }
  };

  const exportBackup = async () => {
    if (backupActionRef.current) return;
    backupActionRef.current = true;
    setExporting(true);
    setMessage("");
    setError("");

    try {
      if (dataScope.status !== "ready") throw new Error("Aktivní profil ještě není připravený.");
      const snapshot = await readLocalBackupSnapshot(dataScope);
      const json = await serializeLocalBackupJson(snapshot);
      const file = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = getLocalBackupFileName();
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Záloha byla předána prohlížeči ke stažení. Ověř ji ve stažených souborech.");
    } catch (exportError) {
      setError(exportError?.message || "Zálohu se nepodařilo připravit. Místní data zůstala zachována.");
    } finally {
      backupActionRef.current = false;
      setExporting(false);
    }
  };

  const selectBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setBackup(null);
    setSummary(null);
    setMessage("");
    setError("");
    if (!file) return;
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      setError("Soubor je větší než 100 MB. Vyber menší zálohu.");
      return;
    }

    if (backupActionRef.current) return;
    backupActionRef.current = true;
    setReading(true);
    try {
      const parsed = parseLocalBackupJson(await file.text());
      const guestScopeKey = await getActiveGuestScopeKey();
      const current = await readLocalBackupSnapshot({ scopeKey: guestScopeKey, ownerId: null });
      const nextSummary = await summarizeLocalBackupRestore(parsed, current);
      setBackup(parsed);
      setSummary(nextSummary);
      setMode("merge");
    } catch (readError) {
      setError(readError?.message || "Zálohu se nepodařilo ověřit. Místní data nebyla změněna.");
    } finally {
      backupActionRef.current = false;
      setReading(false);
    }
  };

  const restoreBackup = () => {
    if (!backup || !summary || backupActionRef.current) return;
    if (mode === "merge" && summary.conflictCount > 0) {
      setError("Sloučení není možné: záloha obsahuje ID s jiným obsahem. Zvol nahrazení, pokud chceš celý místní deník nahradit.");
      return;
    }
    if (mode === "replace") {
      setConfirmingReplace(true);
      return;
    }
    performRestoreBackup();
  };

  const performRestoreBackup = async () => {
    if (!backup || !summary || backupActionRef.current) return;
    setConfirmingReplace(false);
    backupActionRef.current = true;
    setRestoring(true);
    setError("");
    setMessage("");
    try {
      const guestScopeKey = await getActiveGuestScopeKey();
      const result = await restoreLocalBackup(backup, mode, { scopeKey: guestScopeKey, ownerId: null });
      window.dispatchEvent(new CustomEvent("chytnu:local-data-restored"));
      setBackup(null);
      setSummary(null);
      setMessage(mode === "replace"
        ? `Záloha byla obnovena. Úlovky: ${result.catches}; výpravy: ${result.trips}.`
        : `Sloučení dokončeno. Přibylo úlovků: ${result.catches}; výprav: ${result.trips}. Shodných záznamů přeskočeno: ${result.skipped}.`);
    } catch (restoreError) {
      setError(restoreError?.message || "Obnovu se nepodařilo dokončit. Místní data zůstala zachována.");
    } finally {
      backupActionRef.current = false;
      setRestoring(false);
    }
  };

  return <Layout>
    <div className="profile-page">
      <header className="profile-header">
        <h1>Profil</h1>
        <p>Tvůj rybářský příběh a postup.</p>
      </header>

      <section className="profile-identity" aria-label="Aktuální profil">
        <span className="profile-avatar" aria-hidden="true">{avatarInitial}</span>
        <div><strong>{profileIdentity}</strong><span>{progression.rank.name} · {progression.rank.title}</span></div>
        <span className="profile-status-badge">{privacyLoading ? "Načítám" : privacySettings.profileVisibility === "public" ? "Veřejný" : "Soukromý"}</span>
        <span className="profile-level-badge">Úroveň {progression.level}</span>
      </section>

      <section className="profile-level-card" aria-label="Rybářský postup">
        <div><strong>Level {progression.level}</strong><span>{progression.xp} XP{progression.nextThreshold ? ` · další při ${progression.nextThreshold} XP` : ""}</span></div>
        <div className="profile-progress-bar" role="progressbar" aria-label="Postup do dalšího levelu" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progression.progressPercent}><span style={{ width: `${progression.progressPercent}%` }} /></div>
      </section>

      <section className="profile-stat-grid" aria-label="Souhrn profilu">
        <div><strong>{catchState.loading ? "—" : catchState.catches.length}</strong><span>ÚLOVKY</span></div>
        <div><strong>{catchState.loading ? "—" : progression.speciesCount}</strong><span>DRUHY</span></div>
        <div className="profile-record-stat"><strong>{recordCatch ? `${recordCatch.weightKg.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} kg` : "—"}</strong><span>REKORD</span></div>
        <div><strong>{tripState.loading ? "—" : tripState.trips.length}</strong><span>VÝPRAVY</span></div>
        <div><strong>{progression.streak.weeks}</strong><span>TÝDENNÍ SÉRIE</span></div>
        {bestWater?.water ? <Link className="profile-stat-water" to={`/waters/${bestWater.id}`}><strong>{bestWater.name}</strong><span>NEJLEPŠÍ REVÍR · {bestWater.catchCount} ÚLOVKŮ</span></Link>
          : <div><strong>{bestWater?.name || "—"}</strong><span>NEJLEPŠÍ REVÍR{bestWater ? ` · ${bestWater.catchCount} ÚLOVKŮ` : ""}</span></div>}
      </section>

      <nav className="profile-quick-links" aria-label="Osobní přehledy">
        <Link className="profile-stats-link" to="/stats"><span><strong>Statistiky</strong><small>Analýza úlovků a výprav</small></span><b aria-hidden="true">→</b></Link>
        <Link className="profile-secondary-link" to="/insights">Osobní přehledy <span aria-hidden="true">→</span></Link>
        <Link className="profile-secondary-link" to="/season-story">Příběh sezóny <span aria-hidden="true">→</span></Link>
        <Link className="profile-secondary-link" to="/year-summary">Roční souhrn <span aria-hidden="true">→</span></Link>
        <Link className="profile-secondary-link" to="/settings">Nastavení <span aria-hidden="true">→</span></Link>
        <Link className="profile-secondary-link" to="/notifications">Upozornění <span aria-hidden="true">→</span></Link>
        <Link className="profile-secondary-link" to="/album">Druhové album <span aria-hidden="true">→</span></Link>
        <Link className="profile-secondary-link" to="/map">Soukromá mapa <span aria-hidden="true">→</span></Link>
        <Link className="profile-secondary-link" to="/privacy">Soukromí <span aria-hidden="true">→</span></Link>
        <Link className="profile-secondary-link" to="/levels">Úrovně a XP <span aria-hidden="true">→</span></Link>
        <Link className="profile-secondary-link" to="/achievements">Achievementy <span aria-hidden="true">→</span></Link>
        <Link className="profile-secondary-link" to="/challenges">Osobní výzvy <span aria-hidden="true">→</span></Link>
        <Link className="profile-secondary-link" to="/streak">Týdenní série <span aria-hidden="true">→</span></Link>
      </nav>

      <section className="profile-panel profile-preferences" aria-labelledby="profile-preferences-title">
        <h2 id="profile-preferences-title">Předvolby profilu</h2>
        <label className="profile-restore-mode">Výchozí režim zápisu
          <select value={preferences.detailMode} onChange={(event) => updateDetailMode(event.target.value)}>
            <option value="simple">Rychlý zápis</option>
            <option value="detailed">Podrobný zápis</option>
          </select>
        </label>
        <p>Volba se uloží a použije jako výchozí při přidávání úlovku.</p>
        {preferenceError && <p className="profile-error" role="alert">{preferenceError}</p>}
        <label className="privacy-checkbox-row profile-public-toggle">
          <input type="checkbox" checked={privacySettings.profileVisibility === "public"} onChange={(event) => updateProfileVisibility(event.target.checked)} disabled={privacyLoading || privacySaving || dataScope.status !== "ready"} />
          <span>Veřejný profil</span>
        </label>
        {privacyLoading && <p className="loading-state" role="status">Načítám soukromí profilu…</p>}
        {privacySaving && <p role="status">Ukládám viditelnost profilu…</p>}
        {privacyError && <p className="profile-error" role="alert">{privacyError}</p>}
        <Link className="profile-secondary-link" to="/privacy">Další nastavení soukromí <span aria-hidden="true">→</span></Link>
      </section>

      <section className="profile-trophy" aria-labelledby="profile-trophy-title">
        <div className="profile-trophy-heading">
          <h2 id="profile-trophy-title">Trofejní úlovky</h2>
          <Link to="/journal">Deník →</Link>
        </div>
        {catchState.loading || !trophySelectionLoaded ? <p className="loading-state" role="status">Načítám úlovky…</p>
            : trophyCatches.length
            ? <>
              <p>Vyber až 5 trofejí. Výběr je uložený pro tento profil.</p>
              {trophyCatches.filter((item) => selectedTrophyIds.includes(item.id)).map((item) => <CatchCard key={item.id} catchedFish={item} isPersonalRecord={item.id === recordCatch?.id} />)}
              <details><summary>Upravit výběr trofejí</summary>
                {trophyCatches.map((item) => <label key={item.id} style={{ display: "flex", alignItems: "center", gap: ".5rem", margin: ".45rem 0" }}>
                  <input type="checkbox" checked={selectedTrophyIds.includes(item.id)} onChange={(event) => {
                    const next = event.target.checked ? [...selectedTrophyIds, item.id] : selectedTrophyIds.filter((id) => id !== item.id);
                    if (next.length > 5) { setTrophyError("Do trofejní vitríny lze vybrat nejvýše 5 úlovků."); return; }
                    try { setTrophySelection({ scopeKey: dataScope.scopeKey, ids: saveTrophySelection(dataScope.scopeKey, next) }); setTrophyError(""); }
                    catch (selectionError) { setTrophyError(selectionError.message); }
                  }} />{item.species || "Ryba"} · {Number.isFinite(item.weightKg) ? `${formatCatchWeight(item)} kg` : Number.isFinite(item.lengthCm) ? `${item.lengthCm} cm` : "bez měření"}
                </label>)}
              </details>
              {trophyError && <p role="alert">{trophyError}</p>}
            </>
            : <p className="profile-trophy-empty">Trofejní úlovky se zobrazí po uložení prvního záznamu.</p>}
      </section>

      <section className="profile-album-preview" aria-labelledby="profile-album-title">
        <div className="profile-trophy-heading"><h2 id="profile-album-title">Objevené druhy</h2><Link to="/album">{progression.speciesCount} druhů →</Link></div>
        {speciesPreview.length ? <div className="profile-album-grid">{speciesPreview.map((species) => <Link to={`/species/${species.key}`} key={species.key}><span aria-hidden="true">🐟</span><strong>{species.label}</strong></Link>)}</div>
          : <p className="profile-trophy-empty">Album se začne plnit po zapsání prvního úlovku.</p>}
      </section>

      <section className="profile-panel" aria-labelledby="local-backup-title">
        <h2 id="local-backup-title">Místní data</h2>
        <p>Úlovky, výpravy a jejich fotografie jsou uložené v tomto prohlížeči. Export vytvoří kopii pro bezpečné uložení nebo budoucí obnovu.</p>
        <p className="profile-privacy-note">Soubor může obsahovat přesné lokality, poznámky a fotografie. Ulož ho na bezpečné místo.</p>
        <button className="profile-backup-button" type="button" onClick={exportBackup} disabled={exporting || reading || restoring}>
          {exporting ? "Připravuji zálohu…" : "Exportovat zálohu"}
        </button>
        <div className="profile-restore">
          <h3>Obnovit záznamy ze zálohy</h3>
          <p>Nejprve se ověří celý soubor. Před uložením uvidíš jeho obsah a zvolíš, jak naložit s místními daty.</p>
          <input
            ref={fileInput}
            className="profile-file-input"
            type="file"
            hidden
            accept="application/json,.json"
            onChange={selectBackup}
            disabled={exporting || reading || restoring}
            aria-hidden="true"
            tabIndex={-1}
          />
          <button className="profile-backup-button" type="button" onClick={() => fileInput.current?.click()} disabled={exporting || reading || restoring}>
            {reading ? "Ověřuji zálohu…" : "Vybrat zálohu"}
          </button>
          {backup && summary && <div className="profile-restore-preview" aria-live="polite">
            <p><strong>Náhled zálohy</strong></p>
            <p>{formatCount(summary.catchCount, "úlovek", "úlovky", "úlovků")} · {formatCount(summary.tripCount, "výprava", "výpravy", "výprav")} · {formatCount(summary.photoCount, "fotografie", "fotografie", "fotografií")}</p>
            <p>{summary.duplicateCount} ID už v deníku ({summary.unchangedCount} shodných, {summary.conflictCount} s odlišným obsahem).</p>
            <label className="profile-restore-mode">Způsob obnovení
              <select value={mode} onChange={(event) => setMode(event.target.value)} disabled={restoring}>
                <option value="merge">Sloučit, zachovat místní záznamy</option>
                <option value="replace">Nahradit celý místní deník</option>
              </select>
            </label>
            {mode === "merge" && summary.conflictCount > 0 && <p className="profile-error">Sloučení je zablokováno kvůli rozdílnému obsahu stejného ID. Nahrazení přepíše celý místní deník.</p>}
            {mode === "replace" && <p className="profile-privacy-note">Před nahrazením bude vyžadováno další potvrzení.</p>}
            <button className="profile-backup-button" type="button" onClick={restoreBackup} disabled={restoring || (mode === "merge" && summary.conflictCount > 0)}>
              {restoring ? "Obnovuji…" : mode === "replace" ? "Nahradit místní deník" : "Obnovit sloučením"}
            </button>
          </div>}
        </div>
        {message && <p className="profile-feedback" role="status">{message}</p>}
        {error && <p className="profile-error" role="alert">{error}</p>}
      </section>

      <section className="profile-panel profile-progress" aria-labelledby="progress-title">
        <div className="profile-progress-heading"><div><h2 id="progress-title">Rybářský postup</h2><p>Vychází z trvale uložených odměn v deníku.</p></div><strong>Level {progression.level}</strong></div>
        <div className="profile-progress-bar" role="progressbar" aria-label="Postup do dalšího levelu" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progression.progressPercent}><span style={{ width: `${progression.progressPercent}%` }} /></div>
        <p>{progression.xp} XP{progression.nextThreshold ? ` · další level při ${progression.nextThreshold} XP` : " · dosažen nejvyšší level MVP"}</p>
        <h3>Milníky · {progression.completedAchievementCount}/{progression.achievements.length}</h3>
        <ul className="profile-achievements">{progression.achievements.map((achievement) => <li className={achievement.isCompleted ? "is-complete" : ""} key={achievement.id}><span aria-hidden="true">{achievement.isCompleted ? "✓" : "○"}</span><div><strong>{achievement.name}</strong><small>{achievement.description}</small></div></li>)}</ul>
      </section>

      <section className="profile-panel profile-account" aria-labelledby="account-title">
        <h2 id="account-title">Uživatelský účet</h2>
        <p>{accountEnvironment} Přihlášení nemění místní úlovky ani výpravy.</p>
        {accountDataError && <p className="profile-error" role="alert">{accountDataError}</p>}
        {auth.status === "loading" && <p className="loading-state" role="status">Ověřuji stav účtu…</p>}
        {auth.status === "unavailable" && <p className="profile-error" role="alert">Přihlášení je dostupné pouze při lokálním spuštění aplikace s emulátorem.</p>}
        {auth.status === "error" && <p className="profile-error" role="alert">{auth.error}</p>}

        {auth.user ? <div className="profile-account-signed-in">
          <p>Přihlášený účet</p>
          <strong>{auth.user.email}</strong>
          <p className="profile-account-verification">
            {auth.user.emailVerified ? "E-mail je ověřený." : "E-mail zatím není ověřený."}
          </p>
          {!auth.user.emailVerified && <button
            className="profile-account-secondary"
            type="button"
            disabled={authBusy}
            onClick={() => runAuthAction(() => auth.resendVerification(auth.user), "Ověřovací zpráva byla předána emulátoru.")}
          >{authBusy ? "Odesílám…" : "Poslat ověřovací e-mail znovu"}</button>}
          <button
            className="profile-backup-button"
            type="button"
            disabled={authBusy}
            onClick={() => runAuthAction(auth.logOut, "Byl jsi odhlášen. Místní deník zůstal uložený v tomto prohlížeči.")}
          >{authBusy ? "Odhlašuji…" : "Odhlásit se"}</button>
          {ownerless.catches + ownerless.trips > 0 && <div className="profile-restore-preview">
            <p><strong>Místní deník bez účtu</strong></p>
            <p>{ownerless.catches} úlovků · {ownerless.trips} výprav · {ownerless.photos} fotografií</p>
            <p className="profile-privacy-note">Data se nepřenášejí automaticky. Propojení zachová jejich ID, vazby i místní fotografie a připraví je k synchronizaci s tímto účtem.</p>
            <button className="profile-account-secondary" type="button" disabled={dataActionBusy} onClick={linkLocalJournal}>
              {dataActionBusy ? "Propojuji…" : "Propojit místní deník s účtem"}
            </button>
          </div>}
        </div> : auth.status !== "loading" && auth.status !== "unavailable" && <form className="profile-account-form" noValidate onSubmit={(event) => {
          event.preventDefault();
          const validationError = validateAuthForm({ email, password });
          setAuthFormError(validationError);
          if (validationError) return;
          runAuthAction(() => auth.signIn(email, password));
        }}>
          <label className="profile-account-field">E-mail
            <input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setAuthFormError(""); }} aria-invalid={Boolean(authFormError)} aria-describedby={authFormError ? "auth-form-error" : undefined} required disabled={authBusy} />
          </label>
          <label className="profile-account-field">Heslo
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setAuthFormError(""); }} aria-invalid={Boolean(authFormError)} aria-describedby={authFormError ? "auth-form-error" : undefined} minLength={6} required disabled={authBusy} />
          </label>
          {authFormError && <p id="auth-form-error" className="profile-error" role="alert">{authFormError}</p>}
          <button className="profile-backup-button" type="submit" disabled={authBusy || auth.status === "loading"}>
            {authBusy ? "Přihlašuji…" : "Přihlásit se"}
          </button>
          {auth.googleAuthEnabled && <>
            <div className="profile-account-divider"><span>nebo</span></div>
            <button className="profile-account-secondary" type="button" disabled={authBusy} onClick={() => runAuthAction(auth.signInWithGoogle)}>
              {authBusy ? "Přihlašuji…" : "Pokračovat přes Google"}
            </button>
          </>}
          <button className="profile-account-secondary" type="button" disabled={authBusy} onClick={() => {
            const validationError = validateAuthForm({ email, password });
            setAuthFormError(validationError);
            if (validationError) return;
            runAuthAction(() => auth.register(email, password), (result) => result?.verificationEmailSent
              ? "Účet je vytvořený. Ověřovací e-mail byl předán emulátoru."
              : "Účet je vytvořený. Ověřovací e-mail se nepodařilo předat; můžeš to zkusit znovu po přihlášení.");
          }}>{authBusy ? "Vytvářím účet…" : "Vytvořit účet"}</button>
          <button className="profile-account-link" type="button" disabled={authBusy} onClick={() => {
            const validationError = validateAuthForm({ email, requirePassword: false });
            setAuthFormError(validationError);
            if (validationError) return;
            runAuthAction(() => auth.resetPassword(email), "Pokud účet existuje, odkaz pro obnovu byl předán lokálnímu emulátoru.");
          }}>Zapomněl/a jsi heslo?</button>
        </form>}
        {auth.error && auth.status === "ready" && <p className="profile-error" role="alert">{auth.error}</p>}
        {authMessage && <p className="profile-feedback" role="status">{authMessage}</p>}
        {auth.user && <div aria-live="polite">
          {sync.status === "syncing" && <p role="status">Synchronizuji úlovky a výpravy…</p>}
          {sync.status === "offline" && <p className="profile-privacy-note" role="status">Bez připojení. Místní změny zůstaly bezpečně ve frontě.</p>}
          {sync.status === "error" && <p className="profile-error" role="alert">Synchronizace se nepodařila: {sync.error} Změny zůstávají ve frontě.</p>}
          {conflicts.length > 0 && <div className="profile-restore-preview" aria-live="polite">
            <p><strong>Konflikty synchronizace ({conflicts.length})</strong></p>
            <p className="profile-privacy-note">Stejný záznam se změnil na více zařízeních. Vyber verzi; bez volby se nic nepřepíše.</p>
            {conflicts.map((conflict) => <div className="profile-conflict" key={conflict.id}>
              <p><strong>{conflict.entityType === "catch" ? "Úlovek" : "Výprava"}: {conflict.localRecord?.species || conflict.localRecord?.title || conflict.entityId}</strong></p>
              <p>Místní: {conflict.localRecord?.updatedAt ? new Date(conflict.localRecord.updatedAt).toLocaleString("cs-CZ") : "bez času"}</p>
              <p>Vzdálená: {conflict.remoteDeleted ? "záznam byl smazán" : conflict.remoteRecord?.updatedAt ? new Date(conflict.remoteRecord.updatedAt).toLocaleString("cs-CZ") : "bez času"}</p>
              <div className="profile-conflict-actions">
                <button className="profile-account-secondary" type="button" disabled={dataActionBusy} onClick={() => resolveConflict(conflict, "local")}>Použít místní</button>
                <button className="profile-account-secondary" type="button" disabled={dataActionBusy} onClick={() => resolveConflict(conflict, "remote")}>Použít vzdálenou</button>
              </div>
            </div>)}
          </div>}
          {sync.status === "success" && sync.conflicts > 0 && conflicts.length === 0 && <p className="profile-error" role="status">Konflikty byly zachované. Obnovuji jejich seznam…</p>}
          {sync.status === "success" && sync.conflicts === 0 && sync.pending > 0 && <p className="profile-privacy-note" role="status">Čeká {sync.pending} změn na opakování synchronizace.</p>}
          {sync.status === "success" && sync.conflicts === 0 && sync.pending === 0 && <p className="profile-feedback" role="status">Úlovky, výpravy a jejich fotografie jsou synchronizované.</p>}
          {(sync.status === "error" || sync.status === "offline") && <button className="profile-account-secondary" type="button" onClick={sync.retry}>Zkusit synchronizaci znovu</button>}
        </div>}
        <p className="profile-privacy-note">Odhlášení místní data nemaže. Starší deník bez účtu se přenese jen po výslovném potvrzení výše.</p>
      </section>
      {confirmingReplace && <ConfirmDialog titleId="replace-backup-title" descriptionId="replace-backup-description" title="Nahradit místní deník?" description="Všechny místní úlovky a výpravy budou nahrazeny obsahem vybrané zálohy. Tuto akci nelze vrátit." busy={restoring} confirmLabel="Nahradit deník" busyLabel="Obnovuji…" confirmClassName="catch-delete-confirm" onCancel={() => setConfirmingReplace(false)} onConfirm={performRestoreBackup} />}
      {confirmingLink && <ConfirmDialog titleId="link-journal-title" descriptionId="link-journal-description" title="Propojit místní deník s účtem?" description={`Do synchronizační fronty se připraví ${ownerless.catches} úlovků, ${ownerless.trips} výprav a ${ownerless.photos} fotografií. Místní kopie zůstanou v tomto zařízení.`} busy={dataActionBusy} confirmLabel="Propojit deník" busyLabel="Propojuji…" confirmClassName="profile-account-secondary" onCancel={() => setConfirmingLink(false)} onConfirm={performLinkLocalJournal} />}
      {pendingConflict && <ConfirmDialog titleId="resolve-conflict-title" descriptionId="resolve-conflict-description" title="Vyřešit konflikt synchronizace?" description={`Použije se ${pendingConflict.choice === "local" ? "místní" : "vzdálená"} verze. Druhá verze zůstane zachovaná, dokud se tato akce úspěšně nedokončí.`} busy={dataActionBusy} confirmLabel={`Použít ${pendingConflict.choice === "local" ? "místní" : "vzdálenou"} verzi`} busyLabel="Ukládám…" confirmClassName="profile-account-secondary" onCancel={() => setPendingConflict(null)} onConfirm={performResolveConflict} />}
    </div>
  </Layout>;
}

export default ProfilePage;
