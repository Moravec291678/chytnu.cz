import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout.jsx";
import { getEntitlementState, hasVerifiedEntitlement } from "../features/entitlements/data/entitlementAccess.js";
import { FREE_FEATURES, SUPPORTER_BENEFITS, SUPPORTER_COPY, SUPPORTER_COSMETICS } from "../product/config/supporter.js";
import "./SupporterPage.css";

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
          <p>{SUPPORTER_COPY.plan}</p>
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
          <h2 id="supporter-benefits-title">VÝHODY PODPOROVATELE</h2>
          <ul className="supporter-list">
            {SUPPORTER_BENEFITS.map((benefit) => (
              <li key={benefit}>
                <span>{benefit}</span>
                <span className={supporterActive ? "supporter-check" : "supporter-lock"} aria-label={supporterActive ? "Dostupné" : "Uzamčeno"}>{supporterActive ? "✓" : "Zamčeno"}</span>
              </li>
            ))}
          </ul>
          <button className="supporter-unavailable-button" type="button" disabled>
            {SUPPORTER_COPY.unavailable}
          </button>
          <p className="supporter-note">{SUPPORTER_COPY.note}</p>
        </section>

        <section className="supporter-list-section" aria-labelledby="supporter-free-title">
          <h2 id="supporter-free-title">VŽDY ZDARMA</h2>
          <ul className="supporter-list supporter-free-list">
          {FREE_FEATURES.map((feature) => <li key={feature}><span>{feature}</span><span aria-label="Vždy zdarma">✓</span></li>)}
          </ul>
        </section>

        <section className="supporter-cosmetics" aria-labelledby="supporter-cosmetics-title">
          <h2 id="supporter-cosmetics-title">KOSMETIKA · JEDNORÁZOVĚ</h2>
          <div className="supporter-cosmetic-grid">
            {SUPPORTER_COSMETICS.map((item) => (
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
