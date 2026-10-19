import Layout from "../shared/layout/Layout";
import "./CrewPage.css";

function CrewPage() {
  return (
    <Layout>
      <section className="crew-page" aria-labelledby="crew-title">
        <header className="crew-header">
          <div>
            <h1 id="crew-title">Crew</h1>
            <p>Soukromé skupiny rybářů</p>
          </div>
          <button className="crew-add" type="button" disabled aria-label="Vytváření Crew zatím není dostupné">+</button>
        </header>

        <section className="crew-empty" aria-labelledby="crew-empty-title">
          <div className="crew-empty-mark" aria-hidden="true">◎</div>
          <h2 id="crew-empty-title">Zatím nejsi v žádné Crew</h2>
          <p>
            Skupiny a pozvánky budou dostupné až po zavedení bezpečného členství, soukromí a pravidel pro sdílené údaje.
          </p>
          <button type="button" disabled>Vytvořit Crew</button>
        </section>

        <section className="crew-challenge" aria-labelledby="crew-challenge-title">
          <span>Crew výzva</span>
          <h2 id="crew-challenge-title">Žádná aktivní týmová výzva</h2>
          <p>Výzvy se zobrazí až po spuštění týmových dat a pravidel.</p>
        </section>

        <section className="crew-map" aria-labelledby="crew-map-title">
          <h2 id="crew-map-title">Kde jsou členové</h2>
          <div className="crew-map-empty" role="img" aria-label="Mapa bez poloh členů">
            <span aria-hidden="true">⌖</span>
            <strong>Poloha členů se nesdílí</strong>
            <p>Žádná poloha nebyla vyžádána ani zveřejněna.</p>
          </div>
        </section>

        <p className="crew-entitlement-note">
          Vytvoření skupiny bude dostupné až po ověření podmínek členství.
        </p>
      </section>
    </Layout>
  );
}

export default CrewPage;
