import { useState } from "react";
import { SPECIES_CATEGORIES } from "../shared/constants/constants";
import Layout from "../shared/layout/Layout";
import "./AddCatchPage.css";

function AddCatchPage() {
  const [displayFull, setDisplayFull] = useState(false);
  const [expandedCategoryKey, setExpandedCategoryKey] = useState(null);
  const [catchData, setCatchData] = useState({
    weightKg: "",
    lengthCm: "",

    girthCm: "",
    fightDurationMin: "",

    locationName: "",
    waterNumber: "",

    catchDate: "",
    catchTime: "",

    gpsLocation: "",

    depthM: "",
    bottomType: "",

    speciesKey: "",
    resultKey: "released",
  });
  const isActiveResult = catchData.resultKey === "released";
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
              !displayFull ? "mode-button mode-button-active" : "mode-button"
            }
            onClick={() => setDisplayFull(false)}
          >
            ⚡ Rychle
          </button>

          <button
            className={
              displayFull ? "mode-button mode-button-active" : "mode-button"
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
          <div className="species-list">
            {SPECIES_CATEGORIES.map((category) => {
              return (
                <div key={category.key} className="species-category">
                  <button
                    onClick={() => {
                      if (expandedCategoryKey !== category.key) {
                        setExpandedCategoryKey(category.key);
                      } else {
                        setExpandedCategoryKey(null);
                      }
                    }}
                    className="species-category-header"
                  >
                    <div className="species-category-label">
                      <span>{category.label}</span>
                    </div>

                    <span className="species-category-arrow">
                      {expandedCategoryKey === category.key ? "▼" : "▶"}
                    </span>
                  </button>

                  {expandedCategoryKey === category.key && (
                    <div className="species-category-content">
                      <p>TEST</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <section className="add-catch-section">
          <h2>📏 Míry</h2>

          <div
            className={
              displayFull
                ? "measurements-grid measurements-grid-full"
                : "measurements-grid"
            }
          >
            <label className="input-group">
              <span>Váha (kg)</span>

              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="Např. 4.70"
                value={catchData.weightKg}
                onChange={(e) => {
                  const value = e.target.value;

                  if (Number(value) < 0) return;

                  setCatchData({
                    ...catchData,
                    weightKg: value,
                  });
                }}
              />
            </label>

            <label className="input-group">
              <span>Délka (cm)</span>

              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="Např. 68"
                value={catchData.lengthCm}
                onChange={(e) => {
                  const value = e.target.value;

                  if (Number(value) < 0) return;

                  setCatchData({
                    ...catchData,
                    lengthCm: value,
                  });
                }}
              />
            </label>

            {displayFull && (
              <>
                <label className="input-group">
                  <span>Obvod (cm)</span>

                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="Např. 42"
                    value={catchData.girthCm}
                    onChange={(e) => {
                      const value = e.target.value;

                      if (Number(value) < 0) return;

                      setCatchData({
                        ...catchData,
                        girthCm: value,
                      });
                    }}
                  />
                </label>

                <label className="input-group input-group-full">
                  <span>Délka boje (min)</span>

                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="Např. 8"
                    value={catchData.fightDurationMin}
                    onChange={(e) => {
                      const value = e.target.value;

                      if (Number(value) < 0) return;

                      setCatchData({
                        ...catchData,
                        fightDurationMin: value,
                      });
                    }}
                  />
                </label>
              </>
            )}
          </div>
        </section>

        <section className="add-catch-section">
          <h2>📍 Místo a čas</h2>

          <div className="measurements-grid">
            <label className="input-group input-group-full">
              <span>Revír / lokalita</span>

              <input
                type="text"
                placeholder="Např. Lipno - sever"
                value={catchData.locationName}
                onChange={(e) =>
                  setCatchData({
                    ...catchData,
                    locationName: e.target.value,
                  })
                }
              />
            </label>

            {displayFull && (
              <label className="input-group input-group-full">
                <span>Číslo revíru (ČRS)</span>

                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="Např. 411001"
                  value={catchData.waterNumber}
                  onChange={(e) => {
                    const value = e.target.value;

                    if (Number(value) < 0) return;

                    setCatchData({
                      ...catchData,
                      waterNumber: value,
                    });
                  }}
                />
              </label>
            )}
            <label className="input-group">
              <span>Datum</span>

              <input
                type="date"
                value={catchData.catchDate}
                onChange={(e) =>
                  setCatchData({
                    ...catchData,
                    catchDate: e.target.value,
                  })
                }
              />
            </label>

            <label className="input-group">
              <span>Čas záběru</span>

              <input
                type="time"
                value={catchData.catchTime}
                onChange={(e) =>
                  setCatchData({
                    ...catchData,
                    catchTime: e.target.value,
                  })
                }
              />
            </label>
            {displayFull && (
              <>
                <label className="input-group input-group-full">
                  <span>GPS poloha</span>

                  <input
                    type="text"
                    placeholder="📍 Klepnout pro polohu"
                    value={catchData.gpsLocation}
                    onChange={(e) =>
                      setCatchData({
                        ...catchData,
                        gpsLocation: e.target.value,
                      })
                    }
                  />
                </label>

                <label className="input-group">
                  <span>Hloubka (m)</span>

                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    placeholder="Např. 3.5"
                    value={catchData.depthM}
                    onChange={(e) => {
                      const value = e.target.value;

                      if (Number(value) < 0) return;

                      setCatchData({
                        ...catchData,
                        depthM: value,
                      });
                    }}
                  />
                </label>

                <label className="input-group">
                  <span>Typ dna</span>

                  <select
                    value={catchData.bottomType}
                    onChange={(e) =>
                      setCatchData({
                        ...catchData,
                        bottomType: e.target.value,
                      })
                    }
                  >
                    <option value="">—</option>
                    <option value="mud">Bahno</option>
                    <option value="sand">Písek</option>
                    <option value="gravel">Štěrk</option>
                    <option value="rocks">Kamení</option>
                  </select>
                </label>
              </>
            )}
          </div>
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
            <button
              className={
                isActiveResult ? "result-button button-active" : "result-button"
              }
              onClick={() => {
                setCatchData({ ...catchData, resultKey: "released" });
              }}
            >
              ↩️ Puštěno zpět
            </button>

            <button
              className={
                !isActiveResult
                  ? "result-button button-active"
                  : "result-button"
              }
              onClick={() => {
                setCatchData({ ...catchData, resultKey: "kept" });
              }}
            >
              🧊 Necháno
            </button>
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
