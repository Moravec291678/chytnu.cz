import { Link } from "react-router-dom";
import "./Layout.css";

function Layout({ children }) {
  return (
    <div className="layout">
      <main className="layout-main">{children}</main>
      <nav className="bottom-nav">
        <Link to={"/"} className="nav-item">
          <span className="nav-icon">🏠</span>
          <span className="nav-label">Deník</span>
        </Link>
        <Link to={"/trips"} className="nav-item">
          <span className="nav-icon">🗺️</span>
          <span className="nav-label">Výlety</span>
        </Link>
        <Link to={"/add"} className="nav-fab">
          +
        </Link>
        <Link to={"/stats"} className="nav-item">
          <span className="nav-icon">📊</span>
          <span className="nav-label">Statistiky</span>
        </Link>
        <Link to={"/profile"} className="nav-item">
          <span className="nav-icon">👤</span>
          <span className="nav-label">Profil</span>
        </Link>
      </nav>
    </div>
  );
}

export default Layout;
