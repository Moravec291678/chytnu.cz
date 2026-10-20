import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout.jsx";
import { getEntitlementState, hasVerifiedEntitlement } from "../features/entitlements/data/entitlementAccess.js";
import "./SupporterPage.css";

const supporterBenefits = [
  "AI příběh sezóny",
  "Pokročilé statistiky",
  "Zmrazení série 2×",
  "Export deníku do PDF",
  "Nápověda ke skrytým achievementům",
  "Vytvoření crew",
  "Badge Supporter",
];

const freeFeatures = [
  "Neomezený deník",
  "XP, levely a achievementy",
  "Feed a okolí podle dostupnosti služby",
  "Základní statistiky",
  "Revíry",
];

const cosmeticExamples = [
  { name: "Rám avatara", proposedPrice: "29 Kč" },
  { name: "Badge", proposedPrice: "39 Kč" },
  { name: "Zlatý záblesk", proposedPrice: "49 Kč" },
];

export default function SupporterPage() {
  // No billing or entitlement provider is configured in this app. Never infer a
  // purchase from a feature flag, profile field, or local storage value.
  const entitlementSnapshot = null;
  const supporterState = getEntitlementState(entitlementSnapshot, "supporter");
  const supporterActive = hasVerifiedEntitlement(entitlementSnapshot, "supporter");

  return (
    <Layout>
      <main className="supporter-page">
        <header className="supporter-header">
          <Link to="/profile" aria-label="Zpět na profil">← Profil</Link>
          <h1>Supporter</h1>
          <p>Plán podpory · návrh ceny od 69 Kč měsíčně</p>
        </header>

        <section className="supporter-status" aria-live="polite">
          <span className={`supporter-status-indicator${supporterActive ? " is-active" : ""}`} aria-hidden="true" />
          <div>
            <strong>{supporterActive ? "Supporter aktivní" : "Supporter není aktivní"}</strong>
            <p>{supporterState === "unavailable"
              ? "Ověření členství ani nákup zatím nejsou dostupné. Žádná platba nebyla provedena."
              : supporterActive ? "Výhody jsou dostupné podle ověřeného oprávnění." : "Pro tento profil není ověřeno aktivní oprávnění."}</p>
            <p>Supporter nemění XP za úlovky, rarity ani osobní rekordy.</p>
          </div>
        </section>

        <section className="supporter-list-section" aria-labelledby="supporter-benefits-title">
          <h2 id="supporter-benefits-title">SUPPORTER VÝHODY</h2>
          <ul className="supporter-list">
            {supporterBenefits.map((benefit) => (
              <li key={benefit}>
                <span>{benefit}</span>
                <span className={supporterActive ? "supporter-check" : "supporter-lock"} aria-label={supporterActive ? "Dostupné" : "Uzamčeno"}>{supporterActive ? "✓" : "Zamčeno"}</span>
              </li>
            ))}
          </ul>
          <button className="supporter-unavailable-button" type="button" disabled>
            Nákup zatím není dostupný
          </button>
          <p className="supporter-note">Cena je pouze návrh produktu. Checkout ani platby nejsou aktivní.</p>
        </section>

        <section className="supporter-list-section" aria-labelledby="supporter-free-title">
          <h2 id="supporter-free-title">VŽDY ZDARMA</h2>
          <ul className="supporter-list supporter-free-list">
            {freeFeatures.map((feature) => <li key={feature}><span>{feature}</span><span aria-label="Vždy zdarma">✓</span></li>)}
          </ul>
        </section>

        <section className="supporter-cosmetics" aria-labelledby="supporter-cosmetics-title">
          <h2 id="supporter-cosmetics-title">KOSMETIKA · JEDNORÁZOVĚ</h2>
          <div className="supporter-cosmetic-grid">
            {cosmeticExamples.map((item) => (
              <article key={item.name}>
                <strong>{item.name}</strong>
                <span>Návrh {item.proposedPrice}</span>
                <small>Nákup není dostupný</small>
              </article>
            ))}
          </div>
          <p>Bez výhody ve hře, jen vzhled.</p>
        </section>
      </main>
    </Layout>
  );
}
