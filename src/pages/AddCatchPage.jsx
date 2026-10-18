import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  DEFAULT_BAITS,
  DEFAULT_METHODS,
  SPECIES_CATEGORIES,
} from "../shared/constants/constants";
import Layout from "../shared/layout/Layout";
import { DEFAULT_SPECIES } from "../shared/constants/constants";
import "./AddCatchPage.css";
import { normalizeText } from "../shared/utils/helpers";
import { useCatches } from "../features/catches/context/useCatches";
import { catchToForm, createCatchRecord, validateCatchForm } from "../features/catches/data/catchModel";
import { useTrips } from "../features/trips/context/useTrips";
import { formatCoordinates } from "../features/catches/data/coordinates";

function localDateTime() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return { date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, time: `${pad(now.getHours())}:${pad(now.getMinutes())}` };
}

async function optimizePhoto(file) {
  if (typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const optimized = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Fotografii se nepodařilo připravit.")), "image/jpeg", 0.82));
    return optimized;
  } finally {
    bitmap.close();
  }
}

function AddCatchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, createCatch, updateCatch } = useCatches();
  const { state: tripState } = useTrips();
  const existingCatch = id ? state.catches.find((item) => item.id === id) : null;
  const [displayFull, setDisplayFull] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
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
  const photoUrlsRef = useRef(new Set());
  useEffect(() => {
    const photoUrls = photoUrlsRef.current;
    return () => photoUrls.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  const handleAddPhoto = () => {
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const removePhoto = () => {
    catchData.photos.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
        photoUrlsRef.current.delete(item.previewUrl);
      }
    });
    updateCatchData("photos", []);
  };

  const handleFileChange = async (event) => {
    const selectedPhoto = event.target.files[0];
    if (!selectedPhoto) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(selectedPhoto.type)) {
      setFormError("Podporované jsou fotografie JPG, PNG a WebP.");
      return;
    }
    if (selectedPhoto.size > 10 * 1024 * 1024) {
      setFormError("Fotografie může mít nejvýše 10 MB.");
      return;
    }
    setPhotoProcessing(true);
    try {
      const optimizedPhoto = await optimizePhoto(selectedPhoto);
      const previewUrl = URL.createObjectURL(optimizedPhoto);
      photoUrlsRef.current.add(previewUrl);
      catchData.photos.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
          photoUrlsRef.current.delete(item.previewUrl);
        }
      });

      const photo = {
        id: crypto.randomUUID(),
        blob: optimizedPhoto,
        name: selectedPhoto.name,
        type: optimizedPhoto.type || selectedPhoto.type,
        previewUrl,
      };

      setPhotos([photo]);
      setFormError("");
    } catch (error) {
      setFormError(error.message || "Fotografii se nepodařilo připravit.");
    } finally {
      setPhotoProcessing(false);
    }
  };

  const [catchData, setCatchData] = useState({
    weightKg: "",
    lengthCm: "",

    girthCm: "",
    fightDurationMin: "",

    locationName: "",
    waterNumber: "",

    catchDate: localDateTime().date,
    catchTime: localDateTime().time,

    gpsLocation: "",
    coordinates: null,

    depthM: "",
    bottomType: "",

    speciesKey: "",
    resultKey: "unspecified",

    fishingMethod: "",
    photos: [],
    baits: [], notes: "", isFavorite: false, tripId: "",
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("");
  const savingRef = useRef(false);
  const [loadedId, setLoadedId] = useState("");

  useEffect(() => {
    if (!id || !existingCatch || loadedId === id) return;
    const photoUrls = photoUrlsRef.current;
    const values = catchToForm(existingCatch);
    values.photos = values.photos.map((item) => {
      if (!(item.blob instanceof Blob)) return { ...item, previewUrl: "" };
      const previewUrl = URL.createObjectURL(item.blob);
      photoUrls.add(previewUrl);
      return { ...item, previewUrl };
    });
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setCatchData(values);
      setDisplayFull(true);
      setLoadedId(id);
    });
    return () => { active = false; };
  }, [existingCatch, id, loadedId]);

  const handleSave = async () => {
    if (savingRef.current) return;
    const errors = validateCatchForm(catchData);
    if (Object.keys(errors).length) {
      setFormError(Object.values(errors)[0]);
      return;
    }
    const selected = DEFAULT_SPECIES.find((item) => item.key === catchData.speciesKey);
    if (!selected) {
      setFormError("Vybraný druh ryby už není v katalogu. Vyber jej znovu.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFormError("");
    try {
      const record = createCatchRecord(catchData, selected, DEFAULT_METHODS, existingCatch, DEFAULT_BAITS);
      if (existingCatch) await updateCatch(record);
      else await createCatch(record);
      navigate(`/catch/${record.id}`, { replace: true, state: { saved: true } });
    } catch (error) {
      setFormError(error.message || "Úlovek se nepodařilo uložit. Zkus to znovu.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const photo = catchData.photos[0];
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
    setFormError("");
    setCatchData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateGpsLocation = (value, coordinates = null) => {
    setFormError("");
    setGpsMessage("");
    setCatchData((previous) => ({ ...previous, gpsLocation: value, coordinates }));
  };

  const useCurrentLocation = () => {
    if (gpsLoading) return;
    if (!navigator.geolocation) {
      setFormError("Tento prohlížeč polohu neposkytuje. Souřadnice můžeš zadat ručně.");
      return;
    }
    setGpsLoading(true);
    setFormError("");
    setGpsMessage("");
    navigator.geolocation.getCurrentPosition((position) => {
      const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      updateGpsLocation(formatCoordinates(coordinates), coordinates);
      setGpsMessage("Aktuální poloha byla vložena. Úlovek ji uloží až po potvrzení formuláře.");
      setGpsLoading(false);
    }, (locationError) => {
      setFormError(locationError.code === 1
        ? "Poloha nebyla povolena. Úlovek můžeš uložit bez ní nebo souřadnice zadat ručně."
        : "Polohu se nepodařilo zjistit. Úlovek můžeš uložit bez ní nebo souřadnice zadat ručně.");
      setGpsLoading(false);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  };
  const setPhotos = (photos) => {
    updateCatchData("photos", photos);
  };

  if (id && !state.loading && !existingCatch) {
    return <Layout><section className="add-catch-section"><h1>Úlovek nenalezen</h1><p>Tento úlovek mohl být smazán nebo není v místním deníku dostupný.</p><Link to="/">Zpět do deníku</Link></section></Layout>;
  }

  return (
    <Layout>
      <div className="add-catch-page">
        <header className="add-catch-header">
          <h1>{id ? "Upravit úlovek" : "Nový úlovek"}</h1>

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
            accept="image/jpeg,image/png,image/webp"
          />

          {photo ? (
            <>
              <div className="photo-preview-item">
                {photo.previewUrl ? <img src={photo.previewUrl} alt="Fotka úlovku" /> : <p>Fotografie je dostupná po dokončení synchronizace.</p>}
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
          <h2>🐟 Druh ryby *</h2>

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
                  type="text"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="Např. 4.70"
                value={catchData.weightKg}
                onChange={(e) => {
                  const value = e.target.value;

                  updateCatchData("weightKg", value);
                }}
              />
            </label>

            <label className="input-group">
              <span>Délka (cm)</span>

              <input
                type="text"
                inputMode="numeric"
                min="0"
                placeholder="Např. 68"
                value={catchData.lengthCm}
                onChange={(e) => {
                  const value = e.target.value;

                  updateCatchData("lengthCm", value);
                }}
              />
            </label>

            {displayFull && (
              <>
                <label className="input-group">
                  <span>Obvod (cm)</span>

                  <input
                    type="text"
                    inputMode="numeric"
                    min="0"
                    placeholder="Např. 42"
                    value={catchData.girthCm}
                    onChange={(e) => {
                      const value = e.target.value;

                      updateCatchData("girthCm", value);
                    }}
                  />
                </label>

                <label className="input-group input-group-full">
                  <span>Délka boje (min)</span>

                  <input
                    type="text"
                    inputMode="numeric"
                    min="0"
                    placeholder="Např. 8"
                    value={catchData.fightDurationMin}
                    onChange={(e) => {
                      const value = e.target.value;

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
                type="text"
                  inputMode="numeric"
                  min="0"
                  placeholder="Např. 411001"
                  value={catchData.waterNumber}
                  onChange={(e) => {
                    const value = e.target.value;

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
                  <span>GPS souřadnice (volitelné)</span>

                  <input
                    type="text"
                    placeholder="Např. 50.08, 14.42 — lze zadat ručně"
                    value={catchData.gpsLocation}
                    onChange={(e) => updateGpsLocation(e.target.value)}
                  />
                  <span className="gps-actions"><button type="button" className="photo-action-button" onClick={useCurrentLocation} disabled={gpsLoading}>{gpsLoading ? "Zjišťuji polohu…" : "Použít aktuální polohu"}</button>{catchData.gpsLocation && <button type="button" className="photo-action-button" onClick={() => updateGpsLocation("")}>Odstranit GPS</button>}</span>
                  {gpsMessage && <small className="gps-message" role="status">{gpsMessage}</small>}
                </label>

                <label className="input-group">
                  <span>Hloubka (m)</span>

                  <input
                    type="text"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    placeholder="Např. 3.5"
                    value={catchData.depthM}
                    onChange={(e) => {
                      const value = e.target.value;

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

              <div className="fishing-methods-grid">
                {DEFAULT_METHODS.map((method) => {
                  return (
                    <button
                      key={method.key}
                      type="button"
                      className={
                        catchData.fishingMethod === method.key
                          ? "fishing-method-card active"
                          : "fishing-method-card"
                      }
                      onClick={() =>
                        updateCatchData("fishingMethod", method.key)
                      }
                    >
                      <img
                        src={method.icon}
                        alt={method.label}
                        className="fishing-method-icon"
                      />

                      <span className="fishing-method-label">
                        {method.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="add-catch-section">
              <h2>🪱 Nástrahy</h2>
              {DEFAULT_BAITS.map((bait) => <label key={bait.key} className="favorite-checkbox"><input type="checkbox" checked={catchData.baits.includes(bait.key)} onChange={(event) => updateCatchData("baits", event.target.checked ? [...catchData.baits, bait.key] : catchData.baits.filter((key) => key !== bait.key))} />{bait.label}</label>)}
            </section>

          </>
        )}

        <section className="add-catch-section">
          <h2>🗺️ Výprava</h2>
          <label className="input-group">
            <span>Zařadit úlovek k výpravě</span>
            <select value={catchData.tripId} onChange={(event) => updateCatchData("tripId", event.target.value)} disabled={tripState.loading}>
              <option value="">Bez výpravy</option>
              {tripState.trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}{trip.endedAt ? " · dokončená" : " · aktivní"}</option>)}
            </select>
          </label>
          {tripState.error && <p role="status">Výpravy se nepodařilo načíst; úlovek lze uložit samostatně.</p>}
        </section>

        <section className="add-catch-section">
          <h2>🔁 Výsledek</h2>
          <div className="result-buttons">
            <button
              className={
                catchData.resultKey === "released" ? "result-button button-active" : "result-button"
              }
              onClick={() => {
                updateCatchData("resultKey", "released");
              }}
            >
              ↩️ Puštěno zpět
            </button>

            <button
              className={
                catchData.resultKey === "kept"
                  ? "result-button button-active"
                  : "result-button"
              }
              onClick={() => {
                updateCatchData("resultKey", "kept");
              }}
            >
              🧊 Necháno
            </button>
            <button
              className={catchData.resultKey === "unspecified" ? "result-button button-active" : "result-button"}
              onClick={() => updateCatchData("resultKey", "unspecified")}
            >
              Neuvedeno
            </button>
          </div>
        </section>

        {displayFull && (
          <section className="add-catch-section">
            <h2>📝 Poznámky</h2>

            <textarea value={catchData.notes} onChange={(event) => updateCatchData("notes", event.target.value)} placeholder="Poznámky k úlovku..." />

            <label className="favorite-checkbox">
              <input type="checkbox" checked={catchData.isFavorite} onChange={(event) => updateCatchData("isFavorite", event.target.checked)} />

              <span>⭐ Označit jako oblíbený</span>
            </label>
          </section>
        )}

        {formError && <p role="alert" className="catch-form-error">{formError}</p>}
        {state.error && <p role="alert" className="catch-form-error">{state.error}</p>}
        {id && state.loading && <p>Načítám úlovek…</p>}
        <button type="button" className="save-catch-button" onClick={handleSave} disabled={saving || photoProcessing || (id && !existingCatch)}>{photoProcessing ? "Připravuji fotografii…" : saving ? "Ukládám…" : id ? "✓ Uložit změny" : "✓ Uložit úlovek"}</button>
      </div>
    </Layout>
  );
}

export default AddCatchPage;
