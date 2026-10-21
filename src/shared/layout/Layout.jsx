import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useOptionalSync } from "../../features/sync/context/syncContextValue.js";
import { OfflineNotice } from "../components/UIStates.jsx";
import "./Layout.css";

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
  if (name === "trips") return <svg viewBox="0 0 24 24" {...common}><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
  return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
}

function Layout({ children }) {
  const { pathname } = useLocation();
  const sync = useOptionalSync();
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
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
  const homeActive = pathname === "/";
  const journalActive = pathname.startsWith("/journal") || pathname.startsWith("/catch/") || pathname.startsWith("/species/") || pathname === "/gallery" || pathname === "/album" || pathname === "/map";
  const tripsActive = pathname === "/trips" || pathname.startsWith("/trips/");
  return (
        <div className={pathname === "/gallery" ? "layout layout-gallery" : "layout"}>
      {(!isOnline || sync?.status === "offline" || sync?.status === "error") && <OfflineNotice pending={sync?.pending} status={sync?.status === "error" ? "error" : "offline"} errorCode={sync?.errorCode} onRetry={sync?.retry} />}
      <main className="layout-main">{children}</main>
      <nav className="bottom-nav" aria-label="Hlavní navigace">
        <Link to="/" className={itemClass(homeActive)} aria-current={homeActive ? "page" : undefined}>
          <span className="nav-icon" aria-hidden="true"><NavIcon name="home" /></span>
          <span className="nav-label">Domů</span>
        </Link>
        <Link to="/journal" className={itemClass(journalActive)} aria-current={journalActive ? "page" : undefined}>
          <span className="nav-icon" aria-hidden="true"><NavIcon name="journal" /></span>
          <span className="nav-label">Deník</span>
        </Link>
        <Link to="/add" className="nav-fab" aria-label="Přidat úlovek" aria-current={pathname === "/add" ? "page" : undefined}>
          +
        </Link>
        <Link to="/trips" className={itemClass(tripsActive)} aria-current={tripsActive ? "page" : undefined}>
          <span className="nav-icon" aria-hidden="true"><NavIcon name="trips" /></span>
          <span className="nav-label">Výlety</span>
        </Link>
        <Link to="/profile" className={itemClass(pathname === "/profile")} aria-current={pathname === "/profile" ? "page" : undefined}>
          <span className="nav-icon" aria-hidden="true"><NavIcon name="profile" /></span>
          <span className="nav-label">Profil</span>
        </Link>
      </nav>
    </div>
  );
}

export default Layout;
