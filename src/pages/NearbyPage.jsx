import Layout from "../shared/layout/Layout";
import "./NearbyPage.css";

function NearbyPage() {
  return (
    <Layout>
      <section className="nearby-page" aria-labelledby="nearby-title">
        <header className="nearby-header">
          <div>
            <h1 id="nearby-title">Okolí</h1>
            <p>Anonymní přehled polohy</p>
          </div>
          <button className="nearby-search" type="button" disabled aria-label="Hledání v okolí zatím není dostupné">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 5 5" />
            </svg>
          </button>
        </header>

        <div className="nearby-map-empty" role="img" aria-label="Mapa bez zobrazených uživatelů nebo poloh">
          <div className="nearby-map-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z" />
              <circle cx="12" cy="9" r="2.2" />
            </svg>
          </div>
          <strong>Mapa zatím není dostupná</strong>
          <p>Bezpečné anonymní zobrazení okolí ještě není připravené.</p>
        </div>

        <p className="nearby-privacy-note">
          Přesná poloha se nikomu nezobrazuje. Údaje o okolí budou dostupné až po zavedení anonymizace a ochrany soukromí.
        </p>

        <section className="nearby-catches" aria-labelledby="nearby-catches-title">
          <h2 id="nearby-catches-title">Poslední úlovky poblíž · 24 h</h2>
          <p>Veřejné úlovky se zobrazí pouze po souhlasu autora a ověření bezpečné polohové projekce.</p>
        </section>

        <section className="nearby-privacy-card" aria-label="Stav soukromí polohy">
          <strong>Poloha se nepoužívá</strong>
          <span>Není uložena ani sdílena</span>
        </section>

        <button className="nearby-check-in" type="button" disabled>
          Jsem tady
        </button>
      </section>
    </Layout>
  );
}

export default NearbyPage;
