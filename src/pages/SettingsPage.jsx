import PhotoUploadTracePanel from "./PhotoUploadTracePanel.jsx";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import ConfirmDialog from "../shared/components/ConfirmDialog";
import { readPreferences, savePreferences } from "../features/preferences/data/preferences.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useAuth } from "../features/auth/context/authContextValue.js";
import { getLocalBackupFileName, serializeLocalBackupJson } from "../features/backup/data/backupFormat.js";
import { readCloudExportDeviceSupplement, readLocalBackupSnapshot } from "../features/backup/data/localBackupRepository.js";
import { cloudAccountExportService } from "../features/backup/data/cloudAccountExport.js";
import { deleteLocalScopeData } from "../features/settings/data/localDataDeletion.js";
import { deleteCloudAccount } from "../features/settings/data/deleteCloudAccount.js";
import { useSync } from "../features/sync/context/syncContextValue.js";
import { readPhotoSyncDiagnostics } from "../features/catches/data/photoSyncDiagnostics.js";
import { getRuntimeLabel } from "../features/sync/data/runtimeDiagnostics.js";
import { useModalFocusTrap } from "../shared/hooks/useModalFocusTrap.js";
import "./SettingsPage.css";

/* global __APP_BUILD_ID__ */

const FEEDBACK_URL = "https://github.com/Moravec291678/chytnu.cz/issues/new";

export default function SettingsPage() {
  const navigate = useNavigate();
  const scope = useDataScope();
  const auth = useAuth();
  const sync = useSync();
  const debugMode = new URLSearchParams(window.location.search).get("debug") === "1";
  const [preferenceOverride, setPreferenceOverride] = useState({ scopeKey: null, value: null });
  const preferences = preferenceOverride.value && preferenceOverride.scopeKey === scope.scopeKey
    ? preferenceOverride.value
    : readPreferences(globalThis.localStorage, scope.scopeKey);
  const [fishActivity, setFishActivity] = useState(() => {
    try { return localStorage.getItem("fishActivityEnabled") === "true"; } catch { return false; }
  });
  const [exporting, setExporting] = useState(false);
  const [exportingCloud, setExportingCloud] = useState(false);
  const [cloudExportProgress, setCloudExportProgress] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingAccountDelete, setConfirmingAccountDelete] = useState(false);
  const [accountDeleteText, setAccountDeleteText] = useState("");
  const [accountDeletePassword, setAccountDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const accountDeleteDialogRef = useRef(null);
  useModalFocusTrap(accountDeleteDialogRef, { active: confirmingAccountDelete, onEscape: deletingAccount ? undefined : () => setConfirmingAccountDelete(false) });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [photoDiagnostics, setPhotoDiagnostics] = useState({ scopeKey: null, rows: [] });

  useEffect(() => {
    let active = true;
    if (!debugMode || scope.status !== "ready") return undefined;
    const diagnosticScope = { ownerId: scope.ownerId, scopeKey: scope.scopeKey };
    readPhotoSyncDiagnostics({ scope: diagnosticScope }).then((result) => {
      if (active) setPhotoDiagnostics({ scopeKey: scope.scopeKey, rows: result.slice(0, 100) });
    }).catch(() => {
      if (active) setPhotoDiagnostics({ scopeKey: scope.scopeKey, rows: [] });
    });
    return () => { active = false; };
  }, [debugMode, scope.ownerId, scope.scopeKey, scope.status]);
  const photoDiagnosticRows = photoDiagnostics.scopeKey === scope.scopeKey ? photoDiagnostics.rows : [];

  const update = (patch) => {
    if (scope.status !== "ready") return;
    try {
      setPreferenceOverride({
        scopeKey: scope.scopeKey,
        value: savePreferences(patch, globalThis.localStorage, scope.scopeKey),
      });
      setError("");
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  const updateFishActivity = (enabled) => {
    try {
      localStorage.setItem("fishActivityEnabled", String(enabled));
      setFishActivity(enabled);
      window.dispatchEvent(new Event("chytnu:fish-activity-preference"));
      setError("");
    } catch (saveError) {
      setError(saveError.message || "Preferenci se nepodařilo uložit.");
    }
  };

  const exportJournal = async () => {
    if (scope.status !== "ready" || exporting) return;
    setExporting(true);
    setMessage("");
    setError("");
    try {
      const json = await serializeLocalBackupJson(await readLocalBackupSnapshot(scope));
      const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = getLocalBackupFileName();
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Místní JSON záloha byla předána prohlížeči ke stažení.");
    } catch (exportError) {
      setError(exportError?.message || "Zálohu se nepodařilo vytvořit.");
    } finally {
      setExporting(false);
    }
  };

  const exportCloudAccount = async () => {
    if (scope.status !== "ready" || !scope.ownerId || exportingCloud) return;
    setExportingCloud(true);
    setCloudExportProgress("Načítám cloudová data účtu…");
    setMessage("");
    setError("");
    try {
      const deviceSupplement = await readCloudExportDeviceSupplement(scope);
      const exportDocument = await cloudAccountExportService.exportAccount({
        ownerId: scope.ownerId,
        user: auth.user,
        deviceSupplement,
        onProgress: (progress) => {
          if (progress.phase === "photos") setCloudExportProgress("Stahuji cloudové fotografie…");
          else setCloudExportProgress("Načítám cloudová data účtu…");
        },
      });
      const json = JSON.stringify(exportDocument);
      const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `chytnucz-export-${new Date().toISOString().slice(0, 10)}.json`;
      window.document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const missingPhotos = exportDocument.coverage.photosWithoutCloudBinary;
      setMessage(missingPhotos
        ? `Cloudový export je stažený. ${missingPhotos} fotografií nemá dostupnou cloudovou kopii; důvod je uveden v exportu.`
        : "Cloudový export účtu je předán prohlížeči ke stažení.");
    } catch {
      setError("Cloudový export se nepodařilo vytvořit. Zkontroluj připojení a přihlášení a zkus to znovu.");
    } finally {
      setExportingCloud(false);
      setCloudExportProgress("");
    }
  };

  const deleteLocalData = async () => {
    if (scope.status !== "ready" || deleting) return;
    setDeleting(true);
    setError("");
    try {
      await deleteLocalScopeData(scope);
      window.dispatchEvent(new Event("chytnu:local-data-restored"));
      window.dispatchEvent(new Event("chytnu:progression-changed"));
      setConfirmingDelete(false);
      navigate("/onboarding", { replace: true });
    } catch (deleteError) {
      setError(deleteError?.message || "Místní data se nepodařilo smazat.");
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const deleteAccount = async () => {
    if (accountDeleteText !== "SMAZAT" || deletingAccount || !auth.user) return;
    setDeletingAccount(true);
    setError("");
    try {
      const result = await deleteCloudAccount(scope, accountDeletePassword);
      if (result.redirected) {
        setError("Dokonči Google ověření a potom potvrď smazání znovu.");
        return;
      }
      setConfirmingAccountDelete(false);
      navigate("/login", { replace: true, state: { accountDeletionStarted: true, localCleanupError: result.localCleanupError } });
    } catch (deleteError) {
      setError(deleteError?.message || "Mazání účtu se nepodařilo zahájit.");
    } finally {
      setDeletingAccount(false);
    }
  };

  const accountSummary = auth.status === "loading"
    ? "Ověřuji stav účtu…"
    : auth.user?.email
      ? auth.user.email
      : auth.user
        ? "Přihlášený účet"
        : "Místní profil bez přihlášení";

  return <Layout>
    <main className="settings-page">
      <header className="settings-header">
        <Link to="/profile">← Profil</Link>
        <h1>Nastavení</h1>
        <p>Předvolby se ukládají pro právě aktivní profil.</p>
      </header>

      <section className="settings-card" aria-labelledby="settings-account-title">
        <h2 id="settings-account-title">Účet</h2>
        <strong>{accountSummary}</strong>
        {auth.status === "unavailable" && <p>V tomto prostředí se nelze přihlásit. Místní deník funguje dál.</p>}
        <Link className="settings-link" to="/profile">Správa účtu <span aria-hidden="true">→</span></Link>
      </section>

      {debugMode && <section className="settings-card" aria-labelledby="settings-sync-debug-title">
        <h2 id="settings-sync-debug-title">Diagnostika synchronizace</h2>
        <dl>
          <dt>Build</dt><dd>{typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "unknown"}</dd>
          <dt>Runtime</dt><dd>{getRuntimeLabel()}</dd>
          <dt>Auth / scope</dt><dd>{auth.user ? "authenticated" : auth.status === "loading" ? "loading" : "guest"} / {scope.kind ?? "unknown"}</dd>
          <dt>Backend</dt><dd>{sync.backendMode}</dd>
          <dt>Sync enabled</dt><dd>{sync.syncEnabled ? "yes" : "no"}</dd>
          <dt>Photo provider</dt><dd>{sync.providerId}</dd>
          <dt>Outbox</dt><dd>{sync.pending} pending · {sync.failed} failed</dd>
          <dt>Deferred pull retries</dt><dd>{sync.pullPending ?? 0}</dd>
          <dt>Last sync</dt><dd>{sync.lastResult} · sent {sync.sent} · pulled {sync.applied}</dd>
          <dt>Error classification</dt><dd>{sync.errorCode || sync.lastErrorCode || "none"}</dd>
          <dt>Photo API endpoint</dt><dd>{sync.errorEndpoint || sync.lastErrorEndpoint || "none"}</dd>
        </dl>
        <PhotoUploadTracePanel />
        <h3>Photo jobs (bez ID a obsahu)</h3>
        {photoDiagnosticRows.length ? <ul>{photoDiagnosticRows.map((photo, index) => <li key={index}>
          Blob {photo.blobPresent ? "YES" : "NO"} · {photo.size ?? "unknown"} bytes · {photo.type} · job {photo.jobState} · attempts {photo.attempts} · retry {photo.nextRetryAt ?? "none"} · error {photo.errorClass} · cloud {photo.cloudState} · remote {photo.remoteAvailability}
        </li>)}</ul> : <p>Žádné místní photo záznamy pro tento profil.</p>}
        {photoDiagnosticRows.length === 100 && <p>Zobrazeno maximálně 100 fotografií.</p>}
      </section>}

      <section className="settings-card" aria-labelledby="settings-display-title">
        <h2 id="settings-display-title">Zobrazení zápisu</h2>
        <label className="settings-field">Výchozí režim
          <select value={preferences.detailMode} disabled={scope.status !== "ready"} onChange={(event) => update({ detailMode: event.target.value })}>
            <option value="simple">Rychlý zápis</option>
            <option value="detailed">Podrobný zápis</option>
          </select>
        </label>
        <p>Volba se projeví při příštím otevření Nového úlovku.</p>
      </section>

      <section className="settings-card" aria-labelledby="settings-units-title">
        <h2 id="settings-units-title">Jednotky</h2>
        <strong>Metrické · cm, kg, °C</strong>
        <p>Přepínání jednotek tato verze nepodporuje, proto zde není nefunkční přepínač.</p>
      </section>

      <section className="settings-card" aria-labelledby="settings-home-title">
        <h2 id="settings-home-title">Domovská stránka</h2>
        <label className="settings-toggle">
          <input type="checkbox" checked={fishActivity} onChange={(event) => updateFishActivity(event.target.checked)} />
          <span>Povolit rybí aktivitu</span>
        </label>
      </section>

      <section className="settings-card" aria-labelledby="settings-export-title">
        <h2 id="settings-export-title">Export dat</h2>
        {scope.ownerId ? <>
          <p>Stáhne kopii dat uložených k vašemu účtu. Zahrnuje synchronizované úlovky, Vycházky, vody, dostupné fotografie a postup; přidá také profilová nastavení z tohoto zařízení. Nesynchronizovaná data z jiných zařízení v něm nejsou.</p>
          <p>Soubor může obsahovat přesnou polohu a fotografie. Uchovávej ho bezpečně.</p>
          <button className="settings-primary-button" type="button" onClick={exportCloudAccount} disabled={scope.status !== "ready" || exportingCloud || exporting || deleting}>
            {exportingCloud ? "Připravuji export účtu…" : "Exportovat moje data"}
          </button>
          {cloudExportProgress && <p role="status" aria-live="polite">{cloudExportProgress}</p>}
        </> : <p>Cloudový export je dostupný po přihlášení k účtu.</p>}
        <p><strong>Místní záloha</strong> obsahuje pouze data uložená v tomto zařízení a může se lišit od dat účtu.</p>
        <button className="settings-secondary-button" type="button" onClick={exportJournal} disabled={scope.status !== "ready" || exporting || exportingCloud || deleting}>
          {exporting ? "Připravuji místní zálohu…" : "Stáhnout místní zálohu"}
        </button>
        <Link className="settings-link" to="/profile">Obnova ze zálohy <span aria-hidden="true">→</span></Link>
      </section>

      <section className="settings-card" aria-labelledby="settings-more-title">
        <h2 id="settings-more-title">Soukromí a upozornění</h2>
        <Link className="settings-link" to="/privacy">Soukromí a viditelnost <span aria-hidden="true">→</span></Link>
        <Link className="settings-link" to="/privacy-policy">Zásady ochrany osobních údajů <span aria-hidden="true">→</span></Link>
        <Link className="settings-link" to="/terms">Podmínky používání <span aria-hidden="true">→</span></Link>
        <Link className="settings-link" to="/notifications">Oznámení <span aria-hidden="true">→</span></Link>
      </section>

      <section className="settings-card" aria-labelledby="settings-feedback-title">
        <h2 id="settings-feedback-title">Zpětná vazba</h2>
        <p>Chybu nebo návrh můžeš předat přímo do issue trackeru projektu.</p>
        <a className="settings-link" href={FEEDBACK_URL} target="_blank" rel="noreferrer">Otevřít nový GitHub issue <span aria-hidden="true">↗</span></a>
      </section>

      <section className="settings-card settings-danger" aria-labelledby="settings-delete-title">
        <h2 id="settings-delete-title">Smazat místní data</h2>
        <p>Smaže data aktivního profilu uložená v tomto zařízení. Data ostatních profilů zůstanou zachována.</p>
        {auth.user && <p>Tato akce nesmaže účet ani data uložená online.</p>}
        <button type="button" onClick={() => setConfirmingDelete(true)} disabled={scope.status !== "ready" || exporting || deleting}>
          Smazat místní data tohoto profilu
        </button>
      </section>

      {auth.user && <section className="settings-card settings-danger" aria-labelledby="settings-account-delete-title">
        <h2 id="settings-account-delete-title">Smazat účet</h2>
        <p>Smaže účet, synchronizované úlovky, fotografie a další data účtu. Tuto akci nelze vrátit zpět. Cloudové fotografie se mohou odstraňovat ještě přibližně 24 hodin.</p>
        <p>Před smazáním si můžeš stáhnout kopii přes „Exportovat moje data“ výše. Export je dobrovolný.</p>
        <button type="button" onClick={() => setConfirmingAccountDelete(true)} disabled={scope.status !== "ready" || deletingAccount || exportingCloud}>Smazat účet</button>
      </section>}

      {message && <p className="settings-message" role="status">{message}</p>}
      {error && <p className="settings-error" role="alert">{error}</p>}
      {confirmingDelete && <ConfirmDialog
        titleId="settings-delete-confirm-title"
        descriptionId="settings-delete-confirm-description"
        title="Smazat místní data profilu?"
        description={auth.user
          ? "Úlovky, vycházky, revíry, postup a předvolby tohoto profilu budou odstraněny z tohoto zařízení. Cloudový účet ani vzdálená data se nesmažou."
          : "Úlovky, vycházky, revíry, postup a předvolby tohoto místního profilu budou trvale odstraněny z tohoto zařízení."}
        busy={deleting}
        confirmLabel="Smazat místní data"
        busyLabel="Mažu…"
        confirmClassName="settings-delete-confirm"
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={deleteLocalData}
      />}
      {confirmingAccountDelete && <div className="catch-confirm-backdrop">
        <form ref={accountDeleteDialogRef} tabIndex="-1" className="catch-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="account-delete-confirm-title" onSubmit={(event) => { event.preventDefault(); void deleteAccount(); }}>
          <h2 id="account-delete-confirm-title">Smazat účet a cloudová data?</h2>
          <p>Účet, synchronizované úlovky, Vycházky, vody a další data budou odstraněny. Fotografie se dočistí na serveru. Tuto akci nelze vrátit zpět.</p>
          {error && <p className="settings-error" role="alert">{error}</p>}
          <label className="settings-field">Pro potvrzení napiš SMAZAT
            <input autoFocus value={accountDeleteText} onChange={(event) => setAccountDeleteText(event.target.value)} autoComplete="off" disabled={deletingAccount} />
          </label>
          {auth.user?.providerData?.some((provider) => provider.providerId === "password")
            && !auth.user?.providerData?.some((provider) => provider.providerId === "google.com")
            && <label className="settings-field">Heslo pro opětovné ověření
              <input type="password" value={accountDeletePassword} onChange={(event) => setAccountDeletePassword(event.target.value)} autoComplete="current-password" disabled={deletingAccount} required />
            </label>}
          <div className="catch-detail-actions">
            <button className="photo-action-button" type="button" onClick={() => setConfirmingAccountDelete(false)} disabled={deletingAccount}>Zrušit</button>
            <button className="settings-delete-confirm" type="submit" disabled={deletingAccount || accountDeleteText !== "SMAZAT"}>{deletingAccount ? "Zahajuji mazání…" : "Nenávratně smazat účet"}</button>
          </div>
        </form>
      </div>}
    </main>
  </Layout>;
}
