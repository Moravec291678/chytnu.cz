import { Link } from "react-router-dom";
import "../styles/Layout.css";
function Layout({ children }) {
  return (
    <>
      <header></header>
      <main>{children}</main>
      <footer>
        <nav className="footer-nav">
          <Link to={"/"} className="footer-link">
            🏠
            <span>Denik</span>
          </Link>
          <Link to={"/trips"} className="footer-link">
            🗺️
            <span>Vylety</span>
          </Link>
          <Link to={"/add"} className="footer-link">
            <span>+</span>
          </Link>
          <Link to={"/stats"} className="footer-link">
            📊
            <span>Statistiky</span>
          </Link>
          <Link to={"/profile"} className="footer-link">
            👤
            <span>Profil</span>
          </Link>
        </nav>
      </footer>
    </>
  );
}

export default Layout;
