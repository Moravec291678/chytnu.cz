import { NavLink } from "react-router-dom";
import "./JournalNavigation.css";

const items = [
  ["/journal", "Úlovky"],
  ["/trips", "Vycházky"],
  ["/gallery", "Galerie"],
  ["/journal/calendar", "Kalendář"],
  ["/stats", "Statistiky"],
  ["/waters", "Moje revíry"],
];

export default function JournalNavigation() {
  return <nav className="journal-tabs" aria-label="Části deníku">
    {items.map(([path, label]) => <NavLink key={path} end to={path} className={({ isActive }) => isActive ? "journal-tab journal-tab-active" : "journal-tab"}>
      {label}
    </NavLink>)}
  </nav>;
}
