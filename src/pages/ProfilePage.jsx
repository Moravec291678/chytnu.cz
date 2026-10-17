import { useCallback, useEffect, useRef, useState } from "react";
import Layout from "../shared/layout/Layout";
import { useAuth } from "../features/auth/context/authContextValue.js";
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
  linkOwnerlessData,
  listSyncConflicts,
  readOwnerlessSummary,
  resolveSyncConflict,
} from "../features/sync/data/localSyncRepository.js";
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
  const [ownerless, setOwnerless] = useState({ catches: 0, trips: 0, photos: 0 });
  const [conflicts, setConflicts] = useState([]);
  const [dataActionBusy, setDataActionBusy] = useState(false);
  const auth = useAuth();
  const sync = useSync();

  const refreshAccountData = useCallback(async () => {
    const [localSummary, accountConflicts] = await Promise.all([
      readOwnerlessSummary(),
      auth.user ? listSyncConflicts(auth.user.uid) : Promise.resolve([]),
    ]);
    setOwnerless(localSummary);
    setConflicts(accountConflicts);
  }, [auth.user]);

  useEffect(() => {
    let active = true;
    Promise.all([
      readOwnerlessSummary(),
      auth.user ? listSyncConflicts(auth.user.uid) : Promise.resolve([]),
    ]).then(([localSummary, accountConflicts]) => {
      if (!active) return;
      setOwnerless(localSummary);
      setConflicts(accountConflicts);
    }).catch(() => {});
    return () => { active = false; };
  }, [auth.user, sync.conflicts, sync.pending]);

  const linkLocalJournal = async () => {
    if (!auth.user || dataActionBusy || ownerless.catches + ownerless.trips === 0) return;
    const confirmed = window.confirm(
      `Propojit s účtem ${auth.user.email}? Do synchronizační fronty se připraví ${ownerless.catches} úlovků, ${ownerless.trips} výprav a ${ownerless.photos} fotografií. Místní kopie zůstanou v tomto zařízení. Doporučujeme mít předem staženou zálohu.`,
    );
    if (!confirmed) return;
    setDataActionBusy(true);
    setError("");
    try {
      const result = await linkOwnerlessData(auth.user.uid);
      window.dispatchEvent(new Event("chytnu:local-data-restored"));
      window.dispatchEvent(new Event("chytnu:outbox-changed"));
      setMessage(`K účtu bylo bezpečně propojeno ${result.catches} úlovků, ${result.trips} výprav a ${result.photos} fotografií. Místní data zůstala zachována.`);
      await refreshAccountData();
    } catch (linkError) {
      setError(linkError?.message || "Deník se nepodařilo propojit. Data zůstala beze změny.");
    } finally { setDataActionBusy(false); }
  };

  const resolveConflict = async (conflict, choice) => {
    if (!auth.user || dataActionBusy) return;
    const label = choice === "local" ? "místní" : "vzdálenou";
    if (!window.confirm(`Použít ${label} verzi? Druhá verze zůstane zachovaná v konfliktu až do dokončení této akce.`)) return;
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
    } finally { setDataActionBusy(false); }
  };

  const runAuthAction = async (action, successMessage) => {
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
      setAuthBusy(false);
    }
  };

  const exportBackup = async () => {
    setExporting(true);
    setMessage("");
    setError("");

    try {
      const snapshot = await readLocalBackupSnapshot();
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

    setReading(true);
    try {
      const parsed = parseLocalBackupJson(await file.text());
      const current = await readLocalBackupSnapshot();
      const nextSummary = await summarizeLocalBackupRestore(parsed, current);
      setBackup(parsed);
      setSummary(nextSummary);
      setMode("merge");
    } catch (readError) {
      setError(readError?.message || "Zálohu se nepodařilo ověřit. Místní data nebyla změněna.");
    } finally {
      setReading(false);
    }
  };

  const restoreBackup = async () => {
    if (!backup || !summary) return;
    if (mode === "merge" && summary.conflictCount > 0) {
      setError("Sloučení není možné: záloha obsahuje ID s jiným obsahem. Zvol nahrazení, pokud chceš celý místní deník nahradit.");
      return;
    }
    if (mode === "replace" && !window.confirm("Nahrazení trvale přepíše všechny místní úlovky a výpravy obsahem této zálohy. Opravdu pokračovat?")) return;

    setRestoring(true);
    setError("");
    setMessage("");
    try {
      const result = await restoreLocalBackup(backup, mode);
      window.dispatchEvent(new CustomEvent("chytnu:local-data-restored"));
      setBackup(null);
      setSummary(null);
      setMessage(mode === "replace"
        ? `Záloha byla obnovena. Úlovky: ${result.catches}; výpravy: ${result.trips}.`
        : `Sloučení dokončeno. Přibylo úlovků: ${result.catches}; výprav: ${result.trips}. Shodných záznamů přeskočeno: ${result.skipped}.`);
    } catch (restoreError) {
      setError(restoreError?.message || "Obnovu se nepodařilo dokončit. Místní data zůstala zachována.");
    } finally {
      setRestoring(false);
    }
  };

  return <Layout>
    <div className="profile-page">
      <header className="profile-header">
        <h1>Profil</h1>
        <p>Ochrana a přenos tvého místního deníku.</p>
      </header>

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

      <section className="profile-panel profile-account" aria-labelledby="account-title">
        <h2 id="account-title">Uživatelský účet</h2>
        <p>Účet v této vývojové verzi používá pouze lokální Firebase emulátor. Přihlášení nemění místní úlovky ani výpravy.</p>
        {auth.status === "loading" && <p role="status">Ověřuji stav účtu…</p>}
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
        </div> : auth.status !== "loading" && auth.status !== "unavailable" && <form className="profile-account-form" onSubmit={(event) => {
          event.preventDefault();
          runAuthAction(() => auth.signIn(email, password));
        }}>
          <label className="profile-account-field">E-mail
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={authBusy} />
          </label>
          <label className="profile-account-field">Heslo
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required disabled={authBusy} />
          </label>
          <button className="profile-backup-button" type="submit" disabled={authBusy || auth.status === "loading"}>
            {authBusy ? "Přihlašuji…" : "Přihlásit se"}
          </button>
          <button className="profile-account-secondary" type="button" disabled={authBusy || !email.trim()} onClick={() => runAuthAction(
            () => auth.register(email, password),
            (result) => result?.verificationEmailSent
              ? "Účet je vytvořený. Ověřovací e-mail byl předán emulátoru."
              : "Účet je vytvořený. Ověřovací e-mail se nepodařilo předat; můžeš to zkusit znovu po přihlášení.",
          )}>{authBusy ? "Vytvářím účet…" : "Vytvořit účet"}</button>
          <button className="profile-account-link" type="button" disabled={authBusy || !email.trim()} onClick={() => runAuthAction(
            () => auth.resetPassword(email),
            "Pokud účet existuje, odkaz pro obnovu byl předán lokálnímu emulátoru.",
          )}>Zapomněl/a jsi heslo?</button>
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
    </div>
  </Layout>;
}

export default ProfilePage;
