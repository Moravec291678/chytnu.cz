import { useContext, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useOptionalSync } from "../../features/sync/context/syncContextValue.js";
import SyncStatus from "./SyncStatus.js";
import PwaUpdateNotice from "./PwaUpdateNotice.jsx";
import "./Layout.css";
import "./SyncStatus.css";
import { SYNC_STATUS_COMPACT_DELAY_MS } from "./syncStatusView.js";
import { navigationSection } from "./navigationSection.js";
import { isFeatureEnabled } from "../config/featureFlags.js";
import PageBackLink from "./PageBackLink.jsx";
import { pageBackFallback } from "./pageNavigation.js";
import { NavigationMemory } from "./navigationMemory.js";
import LeaveDraftDialog from "./LeaveDraftDialog.jsx";

function NavIcon({ name }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.8,
  };
  if (name === "home") return <svg viewBox="0 0 24 24" {...common}><path d="m3 10 9-7 9 7" /><path d="M5 9v12h14V9M9 21v-7h6v7" /></svg>;
  if (name === "journal") return <svg viewBox="0 0 24 24" {...common}><path d="M6 3h12a2 2 0 0 1 2 2v16H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" /><path d="M8 8h8M8 12h8M8 16h6M5 21V6a3 3 0 0 1 3-3" /></svg>;
  if (name === "community") return <svg viewBox="0 0 24 24" {...common}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 5.5a3.5 3.5 0 0 1 0 6.8M18 14a6 6 0 0 1 3.5 5.5" /></svg>;
  return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
}

function Layout({ children, back }) {
  const { pathname, key, hash } = useLocation();
  const memory = useContext(NavigationMemory);
  const navigate = useNavigate();
  const [exitTarget, setExitTarget] = useState(null);
  const unsaved = Boolean(back?.unsaved);
  useEffect(() => {
    if (!unsaved) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  useEffect(() => {
    if (!memory?.needsRestore()) return undefined;
    let frame;
    let attempts = 0;
    const restore = () => {
      if (document.querySelector(".layout-main > .loading-state") && attempts++ < 30) {
        frame = requestAnimationFrame(restore);
        return;
      }
      const top = memory.restoreScroll(key);
      if (!hash && top !== null) window.scrollTo({ top, behavior: "instant" });
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [hash, key, memory]);
  const backTo = back?.to ?? pageBackFallback(pathname);
  const protectNav = event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest("a[href]");
    if (!link || (!unsaved && !back?.disabled)) return;
    event.preventDefault();
    if (!back?.disabled) setExitTarget(link.getAttribute("href"));
  };
  const adminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const sync = useOptionalSync();
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [compactSyncId, setCompactSyncId] = useState(null);
  const syncPresentationId = sync?.presentationId;
  useEffect(() => {
    if (sync?.status !== "syncing" || !sync.showSyncStatus || !syncPresentationId) return undefined;
    const timer = window.setTimeout(() => setCompactSyncId(syncPresentationId), SYNC_STATUS_COMPACT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [sync?.status, sync?.showSyncStatus, syncPresentationId]);
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const itemClass = (active) => active ? "nav-item nav-item-active" : "nav-item";
  const section = navigationSection(pathname);
  const homeActive = section === "home";
  const journalActive = section === "journal";
  const communityActive = section === "community";
  const communityEnabled = isFeatureEnabled("community");
  const profileActive = section === "profile" || (!communityEnabled && pathname === "/notifications");
  return (
        <div className={adminRoute ? "layout layout-admin" : pathname === "/gallery" ? "layout layout-gallery" : "layout"}>
      <SyncStatus sync={sync} isOnline={isOnline} compact={sync?.status === "syncing" && sync?.showSyncStatus && compactSyncId === syncPresentationId} />
      <PwaUpdateNotice syncing={sync?.status === "syncing"} />
      <main className="layout-main">
        {backTo && <div className="layout-back"><PageBackLink {...back} to={backTo} /></div>}
        {children}
      </main>
      <nav className="bottom-nav" aria-label="Hlavní navigace" onClickCapture={protectNav}>
        <Link to="/" className={itemClass(homeActive)} aria-current={homeActive ? "page" : undefined}>
          <span className="nav-icon" aria-hidden="true"><NavIcon name="home" /></span>
          <span className="nav-label">Domů</span>
        </Link>
        <Link to="/journal" className={itemClass(journalActive)} aria-current={journalActive ? "page" : undefined}>
          <span className="nav-icon" aria-hidden="true"><NavIcon name="journal" /></span>
          <span className="nav-label">Deník</span>
        </Link>
        <Link to="/add" className="nav-fab" aria-label="Přidat úlovek" aria-current={section === "capture" ? "page" : undefined}>
          +
        </Link>
        {communityEnabled && <Link to="/community" className={itemClass(communityActive)} aria-current={communityActive ? "page" : undefined}>
          <span className="nav-icon" aria-hidden="true"><NavIcon name="community" /></span>
          <span className="nav-label">Komunita</span>
        </Link>}
        <Link to="/profile" className={itemClass(profileActive)} aria-current={profileActive ? "page" : undefined}>
          <span className="nav-icon" aria-hidden="true"><NavIcon name="profile" /></span>
          <span className="nav-label">Profil</span>
        </Link>
      </nav>
      {exitTarget && <LeaveDraftDialog onCancel={() => setExitTarget(null)} onConfirm={() => {
        setExitTarget(null);
        navigate(exitTarget);
      }} />}
    </div>
  );
}

export default Layout;
