import { useRef, useState } from "react";
import { SPECIES_CATEGORIES } from "../shared/constants/constants";
import Layout from "../shared/layout/Layout";
import { DEFAULT_SPECIES } from "../shared/constants/constants";
import "./AddCatchPage.css";
import { normalizeText } from "../shared/utils/helpers";

function AddCatchPage() {
  const [displayFull, setDisplayFull] = useState(false);
  const [expandedCategoryKey, setExpandedCategoryKey] = useState(null);
  const visibleSpecies = DEFAULT_SPECIES.filter((species) => {
    if (expandedCategoryKey === "predators") {
      return species.isPredator;
    }
    if (expandedCategoryKey === "common") {
      return species.isCommon;
    }
    if (expandedCategoryKey === "protected") {
      return species.isProtected;
    }
    if (expandedCategoryKey === "nonNative") {
      return species.isNonNative;
    }

    return species.categoryKey === expandedCategoryKey;
  });
  const fileInputRef = useRef(null);
  const handleAddPhoto = () => {
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const removePhoto = () => {
    updateCatchData("photos", []);
  };

  const handleFileChange = (event) => {
    const selectedPhoto = event.target.files[0];
    if (!selectedPhoto) return;

    const previewUrl = URL.createObjectURL(selectedPhoto);

    const photo = {
      id: crypto.randomUUID(),
      file: selectedPhoto,
      previewUrl,
    };

    setPhotos([photo]);
  };

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

    photos: [],
  });

  const photo = catchData.photos[0];
  const isActiveResult = catchData.resultKey === "released";
  const selectedSpecies = DEFAULT_SPECIES.find(
    (species) => catchData.speciesKey === species.key,
  );
  const [speciesSearch, setSpeciesSearch] = useState("");
  const normalizedSearch = normalizeText(speciesSearch);
  const filteredSpecies = visibleSpecies.filter((species) => {
    return normalizeText(species.label).includes(normalizedSearch);
  });

  const selectedCategory = SPECIES_CATEGORIES.find(
    (category) => category.key === expandedCategoryKey,
  );

  const updateCatchData = (field, value) => {
    setCatchData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };
  const setPhotos = (photos) => {
    updateCatchData("photos", photos);
  };
  return (
    <Layout>
      <div className="add-catch-page">
        <header className="add-catch-header">
          <h1>Nový úlovek</h1>

          <p>Přidej svůj úlovek</p>
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
          <input
            type="file"
            ref={fileInputRef}
            hidden
            onChange={handleFileChange}
            accept=".jpg,.jpeg,.png,.webp,.heic"
          />

          {photo ? (
            <>
              <div className="photo-preview-item">
                <img src={photo.previewUrl} alt="Fotka úlovku" />
              </div>

              <div className="photo-actions">
                <button className="photo-action-button" onClick={removePhoto}>
                  🗑 Smazat
                </button>

                <button
                  className="photo-action-button"
                  onClick={handleAddPhoto}
                >
                  ✏️ Změnit
                </button>
              </div>
            </>
          ) : (
            <button onClick={handleAddPhoto} className="photo-upload-button">
              <span>📷</span>
              <span>Přidat fotku</span>
            </button>
          )}
        </section>
        <section className="add-catch-section">
          <h2>🐟 Druh ryby</h2>

          {selectedSpecies ? (
            <div className="selected-species">
              <span className="selected-species-title">Vybraná ryba</span>

              <div className="selected-species-content">
                <span className="selected-species-name">
                  {selectedSpecies.label}
                </span>

                <button
                  className="selected-species-button"
                  onClick={() => {
                    updateCatchData("speciesKey", "");

                    setExpandedCategoryKey(null);
                  }}
                >
                  ✏️ Změnit
                </button>
              </div>
            </div>
          ) : (
            <>
              {expandedCategoryKey === null && (
                <div className="species-list">
                  {SPECIES_CATEGORIES.map((category) => {
                    return (
                      <div key={category.key} className="species-category">
                        <button
                          className="species-category-header"
                          onClick={() => {
                            setExpandedCategoryKey(
                              expandedCategoryKey === category.key
                                ? null
                                : category.key,
                            );
                          }}
                        >
                          <div className="species-category-label">
                            <span>{category.label}</span>
                          </div>

                          <span className="species-category-arrow">›</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {expandedCategoryKey !== null && (
                <div className="species-selection">
                  <div className="species-selection-header">
                    <div className="species-selection-title">
                      {selectedCategory.label}
                    </div>
                    <button
                      className="species-back-button"
                      onClick={() => {
                        setExpandedCategoryKey(null);
                        setSpeciesSearch("");
                      }}
                    >
                      ← Kategorie
                    </button>
                  </div>

                  <div className="species-search">
                    <input
                      className="species-search-input"
                      value={speciesSearch}
                      onChange={(e) => setSpeciesSearch(e.target.value)}
                      type="text"
                      placeholder="Hledat rybu..."
                    />

                    {speciesSearch && (
                      <button
                        className="species-search-clear"
                        onClick={() => setSpeciesSearch("")}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {filteredSpecies.length === 0 ? (
                    <div className="species-empty">
                      <span className="species-empty-icon">🐟</span>

                      <p className="species-empty-title">
                        Žádná ryba nebyla nalezena
                      </p>

                      <p className="species-empty-text">
                        Zkus jiný název nebo vymaž hledání.
                      </p>
                    </div>
                  ) : (
                    <div className="species-items">
                      {filteredSpecies.map((species) => (
                        <button
                          key={species.key}
                          className="species-item"
                          onClick={() => {
                            setSpeciesSearch("");
                            updateCatchData("speciesKey", species.key);

                            setExpandedCategoryKey(null);
                          }}
                        >
                          <span className="species-item-label">
                            {species.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
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

                  updateCatchData("weightKg", value);
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
                  updateCatchData("lengthCm", value);
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
                      updateCatchData("girthCm", value);
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
                      updateCatchData("fightDurationMin", value);
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
                  updateCatchData("locationName", e.target.value)
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
                    updateCatchData("waterNumber", value);
                  }}
                />
              </label>
            )}
            <label className="input-group">
              <span>Datum</span>

              <input
                type="date"
                value={catchData.catchDate}
                onChange={(e) => updateCatchData("catchDate", e.target.value)}
              />
            </label>

            <label className="input-group">
              <span>Čas záběru</span>

              <input
                type="time"
                value={catchData.catchTime}
                onChange={(e) => updateCatchData("catchTime", e.target.value)}
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
                      updateCatchData("gpsLocation", e.target.value)
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
                      updateCatchData("depthM", value);
                    }}
                  />
                </label>

                <label className="input-group">
                  <span>Typ dna</span>

                  <select
                    value={catchData.bottomType}
                    onChange={(e) =>
                      updateCatchData("bottomType", e.target.value)
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
                updateCatchData("resultKey", "released");
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
                updateCatchData("resultKey", "kept");
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
