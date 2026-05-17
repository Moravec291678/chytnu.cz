import { useState } from "react";
import Layout from "../shared/layout/Layout";
import "./AddCatchPage.css";
function AddCatchPage() {
  const [displayFull, setDisplayFull] = useState(false);
  return (
    <Layout>
      <div className="add-catch-page">
        <header className="add-catch-header">
          <div>
            <h1>Nový úlovek</h1>
            <p>Přidej svůj úlovek</p>
          </div>
        </header>

        <section className="add-catch-mode-switch">
          <button
            className={
              !displayFull ? "mode-button mode-button-active" : " mode-button"
            }
            onClick={() => setDisplayFull(false)}
          >
            ⚡ Rychle
          </button>

          <button
            className={
              displayFull ? "mode-button mode-button-active" : " mode-button"
            }
            onClick={() => setDisplayFull(true)}
          >
            📋 Plný záznam
          </button>
        </section>

        <section className="add-catch-photo-section">
          <button className="photo-upload-button">
            <span>📷</span>
            <span>Přidat fotku</span>
          </button>
        </section>

        <section className="add-catch-section">
          <h2>🐟 Druh ryby</h2>

          <div className="species-grid"></div>
        </section>

        <section className="add-catch-section">
          <h2>📏 Míry</h2>

          <div className="measurements-grid">
            {/* {displayFull && input.delkaBoje} */}
          </div>
        </section>

        <section className="add-catch-section">
          <h2>📍 Místo a čas</h2>
          {/* {displayFull && input.cisloReviru, typ dna, hloubka, } */}
        </section>

        {displayFull && (
          <>
            <section className="add-catch-section">
              <h2>🎣 Metoda lovu</h2>
            </section>

            <section className="add-catch-section">
              <h2>🪱 Nástraha</h2>
            </section>

            <section className="add-catch-section">
              <h2>🌤️ Podmínky</h2>
            </section>
          </>
        )}

        <section className="add-catch-section">
          <h2>🔁 Výsledek</h2>

          <div className="result-buttons">
            <button>↩️ Puštěno zpět</button>

            <button>🧊 Necháno</button>
          </div>
        </section>

        {displayFull && (
          <section className="add-catch-section">
            <h2>📝 Poznámky</h2>

            <textarea placeholder="Například počasí, aktivita ryb..."></textarea>

            <label className="favorite-checkbox">
              <input type="checkbox" />

              <span>⭐ Označit jako oblíbený</span>
            </label>
          </section>
        )}

        <button className="save-catch-button">✓ Uložit úlovek</button>
      </div>
    </Layout>
  );
}

export default AddCatchPage;
