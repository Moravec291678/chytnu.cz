import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { createWaterRecord, updateWaterRecord, validateWaterForm, WATER_TYPES } from "../features/waters/data/waterModel.js";
import { resolveWaterEditorView } from "../features/waters/data/waterEditorState.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import { EmptyState, ErrorState } from "../shared/components/UIStates.jsx";
import "./WaterCreatePage.css";

const COMMON_FISH = ["Kapr", "Štika", "Candát", "Lín", "Okoun", "Pstruh", "Sumec", "Amur"];

function WaterCreatePage() {
  const { waterId } = useParams();
  const scope = useDataScope();
  const navigate = useNavigate();
  const pendingWaterId = useRef(crypto.randomUUID());

  const [formData, setFormData] = useState({
    name: "",
    waterNumber: "",
    type: "Rybník",
    area: "",
    notes: "",
    targetFish: [],
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [existingWater, setExistingWater] = useState(null);
  const [loadingWater, setLoadingWater] = useState(Boolean(waterId));
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!waterId || scope.status !== "ready") return undefined;
    let active = true;
    waterRepository.get(waterId, scope).then((record) => {
      if (!active) return;
      if (!record) {
        setExistingWater(null);
        setLoadError("");
        return;
      }
      setExistingWater(record);
      setFormData({
        name: record.name ?? "",
        waterNumber: record.waterNumber ?? "",
        type: record.type ?? "Rybník",
        area: record.area ?? "",
        notes: record.notes ?? "",
        targetFish: record.targetFish ?? [],
      });
      setLoadError("");
    }).catch((loadError) => {
      if (active) setLoadError(loadError?.message || "Revír se nepodařilo načíst.");
    }).finally(() => {
      if (active) setLoadingWater(false);
    });
    return () => { active = false; };
  }, [waterId, scope]);

  const updateField = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: "" }));
    }
  };

  const toggleFish = (fish) => {
    setFormData((prev) => {
      const exists = prev.targetFish.includes(fish);
      return {
        ...prev,
        targetFish: exists ? prev.targetFish.filter((f) => f !== fish) : [...prev.targetFish, fish],
      };
    });
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (scope.status !== "ready") {
      setSubmitError("Aktivní profil ještě není připravený. Zkus to znovu za chvíli.");
      return;
    }
    const validationErrors = validateWaterForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setSubmitError("Zkontroluj označená pole.");
      return;
    }

    setSaving(true);
    setSubmitError("");
    try {
      const record = existingWater
        ? updateWaterRecord(existingWater, formData)
        : createWaterRecord({ ...formData, id: pendingWaterId.current }, scope);
      await waterRepository.put(record, scope);
      navigate(`/waters/${record.id}`);
    } catch (err) {
      setSubmitError(err?.message || "Revír se nepodařilo uložit. Pokud už byl záznam uložen, můžeš akci bezpečně zkusit znovu.");
    } finally {
      setSaving(false);
    }
  };

  const editorView = resolveWaterEditorView({
    waterId,
    loading: loadingWater || Boolean(waterId && existingWater && existingWater.scopeKey !== scope.scopeKey),
    record: existingWater,
    error: loadError,
  });
  if (editorView === "loading") {
    return <Layout><div className="water-create-page"><p className="loading-state" role="status">Načítám uložený revír…</p></div></Layout>;
  }
  if (editorView === "not-found") {
    return <Layout><div className="water-create-page"><EmptyState title="Revír nenalezen" description="Záznam mohl být smazán nebo patří do jiného profilu." action={<Link className="water-create-back" to="/waters">Zpět na revíry</Link>} /></div></Layout>;
  }
  if (editorView === "error") {
    return <Layout><div className="water-create-page"><ErrorState title="Revír se nepodařilo načíst" message={loadError} /></div></Layout>;
  }

  return (
    <Layout>
      <div className="water-create-page">
        <header className="water-create-header">
          <h1>{waterId ? "Upravit revír" : "Přidat revír"}</h1>
          <p>{waterId ? "Uprav údaje uloženého revíru" : "Ulož si vlastní revír do svého deníku"}</p>
        </header>

        {loadingWater && <p className="loading-state" role="status">Načítám revír…</p>}

        <form id="water-create-form" className="water-create-form" onSubmit={handleSubmit}>
          <label>
            Název revíru *
            <input
              type="text"
              placeholder="Např. Vltava 6 nebo Rybník Rožmberk"
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && <span className="water-create-error">{errors.name}</span>}
          </label>

          <label>
            Číslo revíru (MRS / ČRS)
            <input
              type="text"
              placeholder="Např. 401 018"
              value={formData.waterNumber}
              onChange={(e) => updateField("waterNumber", e.target.value)}
              aria-invalid={Boolean(errors.waterNumber)}
            />
            {errors.waterNumber && <span className="water-create-error">{errors.waterNumber}</span>}
          </label>

          <div className="water-create-group">
            <span>Druh vody</span>
            <div className="water-create-chips" role="group" aria-label="Druh vody">
              {WATER_TYPES.map((type) => (
                <button
                  type="button"
                  key={type}
                  className={formData.type === type ? "active" : ""}
                  aria-pressed={formData.type === type}
                  onClick={() => updateField("type", type)}
                >
                  {type}
                </button>
              ))}
            </div>
            {errors.type && <span className="water-create-error">{errors.type}</span>}
          </div>

          <label>
            Poloha / oblast
            <input
              type="text"
              placeholder="Např. Jihočeský kraj, České Budějovice"
              value={formData.area}
              onChange={(e) => updateField("area", e.target.value)}
              aria-invalid={Boolean(errors.area)}
            />
            {errors.area && <span className="water-create-error">{errors.area}</span>}
          </label>

          <section className="water-create-location" aria-labelledby="water-location-title">
            <div>
              <strong id="water-location-title">Označit na mapě</strong>
              <p>Výběr bodu na mapě zatím není připojený. Uloží se pouze textová poloha výše.</p>
            </div>
            <button type="button" disabled>Mapa není dostupná</button>
          </section>

          <div className="water-create-group">
            <span>Druhy ryb</span>
            <div className="water-create-chips" role="group" aria-label="Druhy ryb">
              {COMMON_FISH.map((fish) => {
                const isSelected = formData.targetFish.includes(fish);
                return (
                  <button
                    type="button"
                    key={fish}
                    className={isSelected ? "active" : ""}
                    aria-pressed={isSelected}
                    onClick={() => toggleFish(fish)}
                  >
                    {isSelected ? `✓ ${fish}` : fish}
                  </button>
                );
              })}
            </div>
            {errors.targetFish && <span className="water-create-error">{errors.targetFish}</span>}
          </div>

          <label>
            Poznámky k revíru
            <textarea
              placeholder="Pravidla, tipy k lovu, parkování nebo přístup k vodě..."
              value={formData.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              aria-invalid={Boolean(errors.notes)}
            />
            {errors.notes && <span className="water-create-error">{errors.notes}</span>}
          </label>

          {submitError && <p className="water-create-submit-error" role="alert">{submitError}</p>}
        </form>

        {!waterId && <p className="water-create-note">
          Revír se uloží lokálně se stavem „čeká na schválení“. Veřejná moderace zatím není připojená a za lokální uložení se neuděluje XP.
        </p>}
        <Link className="water-create-back" to="/waters">Zpět na revíry</Link>

        <div className="water-create-submit">
          <button type="submit" form="water-create-form" disabled={saving || loadingWater || scope.status !== "ready" || Boolean(waterId && !existingWater)}>
            {saving ? "Ukládám…" : waterId ? "Uložit změny" : "Uložit jako čekající"}
          </button>
        </div>
      </div>
    </Layout>
  );
}

export default WaterCreatePage;
