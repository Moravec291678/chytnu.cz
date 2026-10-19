import "./CommunityPage.css";
import Layout from "../shared/layout/Layout";

const FEED_TABS = ["Přátelé", "Okolí", "Všichni"];

function CommunityPage() {
  return (
    <Layout>
      <section className="community-page" aria-labelledby="community-title">
        <header className="community-header">
          <div>
            <h1 id="community-title">Komunita</h1>
            <p>Sdílené úlovky na jednom místě</p>
          </div>
          <button className="community-search" type="button" disabled aria-label="Hledání v komunitě zatím není dostupné">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 5 5" />
            </svg>
          </button>
        </header>

        <nav className="community-tabs" aria-label="Filtr komunitního feedu">
          {FEED_TABS.map((tab, index) => (
            <button
              className={index === 0 ? "community-tab community-tab-active" : "community-tab"}
              type="button"
              disabled
              key={tab}
            >
              {tab}
            </button>
          ))}
        </nav>

        <aside className="community-nearby">
          <span className="community-nearby-dot" aria-hidden="true" />
          <div>
            <strong>Rybáře v okolí zatím nezobrazujeme</strong>
            <p>Okolí bude dostupné až s anonymizovanou polohou a dostatečným počtem lidí.</p>
          </div>
          <span className="community-nearby-link" aria-hidden="true">Mapa →</span>
        </aside>

        <section className="community-empty" aria-labelledby="community-empty-title">
          <div className="community-empty-mark" aria-hidden="true">↗</div>
          <h2 id="community-empty-title">Feed zatím čeká na veřejně sdílené úlovky</h2>
          <p>
            Tvoje úlovky zůstávají soukromé. Veřejné příspěvky se zobrazí až po výslovném souhlasu,
            s bezpečně skrytými místy a připravenou moderací.
          </p>
          <button className="community-compose" type="button" disabled>
            Přidat příspěvek
          </button>
        </section>
      </section>
    </Layout>
  );
}

export default CommunityPage;
