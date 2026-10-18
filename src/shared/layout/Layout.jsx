import { Link, useLocation } from "react-router-dom";
import "./Layout.css";

function Layout({ children }) {
  const { pathname } = useLocation();
  const itemClass = (active) => active ? "nav-item nav-item-active" : "nav-item";
  const journalActive = pathname === "/" || pathname.startsWith("/catch/") || pathname.startsWith("/species/") || pathname === "/gallery" || pathname === "/album" || pathname === "/map";
  const tripsActive = pathname === "/trips" || pathname.startsWith("/trips/");
  return (
    <div className="layout">
      <main className="layout-main">{children}</main>
      <nav className="bottom-nav">
        <Link to={"/"} className={itemClass(journalActive)} aria-current={journalActive ? "page" : undefined}>
          <span className="nav-icon">🏠</span>
          <span className="nav-label">Deník</span>
        </Link>
        <Link to={"/trips"} className={itemClass(tripsActive)} aria-current={tripsActive ? "page" : undefined}>
          <span className="nav-icon">🗺️</span>
          <span className="nav-label">Výlety</span>
        </Link>
        <Link to={"/add"} className="nav-fab" aria-label="Přidat úlovek" aria-current={pathname === "/add" ? "page" : undefined}>
          +
        </Link>
        <Link to={"/stats"} className={itemClass(pathname === "/stats")} aria-current={pathname === "/stats" ? "page" : undefined}>
          <span className="nav-icon">📊</span>
          <span className="nav-label">Statistiky</span>
        </Link>
        <Link to={"/profile"} className={itemClass(pathname === "/profile")} aria-current={pathname === "/profile" ? "page" : undefined}>
          <span className="nav-icon">👤</span>
          <span className="nav-label">Profil</span>
        </Link>
      </nav>
    </div>
  );
}

export default Layout;
