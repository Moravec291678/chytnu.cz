import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { createWaterRecord, updateWaterRecord, validateWaterForm, WATER_TYPES } from "../features/waters/data/waterModel.js";
import { resolveWaterEditorView } from "../features/waters/data/waterEditorState.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import { EmptyState, ErrorState } from "../shared/components/UIStates.jsx";
import "./WaterCreatePage.css";
import WaterSelector from "../features/waters/components/WaterSelector.jsx";
import { prefillWaterEditor } from "../features/waters/data/waterSelection.js";

const COMMON_FISH = ["Kapr", "Štika", "Candát", "Lín", "Okoun", "Pstruh", "Sumec", "Amur"];

function WaterCreatePage() {
  const { waterId } = useParams();
  const location = useLocation();
  const returnToAddCatch = location.state?.returnToAddCatch
    || new URLSearchParams(location.search).get("returnToAddCatch") === "1";
  const scope = useDataScope();
  const navigate = useNavigate();
  const pendingWaterId = useRef(crypto.randomUUID());
  const dirtyFields = useRef(new Set());

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
    dirtyFields.current.add(key);
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: "" }));
    }
  };

  const toggleFish = (fish) => {
    dirtyFields.current.add("targetFish");
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
      if (!waterId && returnToAddCatch) {
        navigate("/add", { replace: true, state: { preselectedWaterId: record.id } });
      } else {
        navigate(`/waters/${record.id}`);
      }
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
    return <Layout><div className="water-create-page"><EmptyState title="Revír nenalezen" description="Záznam mohl být smazán nebo patří do jiného profilu." action={<Link className="water-create-back" to={returnToAddCatch ? "/add" : "/waters"}>Zpět</Link>} /></div></Layout>;
  }
  if (editorView === "error") {
    return <Layout><div className="water-create-page"><ErrorState title="Revír se nepodařilo načíst" message={loadError} /></div></Layout>;
  }

  return (
    <Layout>
      <div className="water-create-page">
        <header className="water-create-header">
          <h1>{waterId ? "Upravit revír" : "Přidat revír"}</h1>
          <p>{waterId ? "Uprav údaje uloženého revíru" : "Vyber revír ČRS nebo zadej vlastní vodu."}</p>
        </header>

        {!waterId && <WaterSelector disabled={saving} onSelect={water=>{
          setExistingWater(water);setFormData(current=>prefillWaterEditor(current,water,dirtyFields.current));setErrors({});
        }} />}
        {existingWater?.catalogueId && <p className="water-create-note">ČRS revír je propojený s osobním záznamem. <Link to={`/waters/catalogue/${existingWater.catalogueId}`} target="_blank" rel="noopener noreferrer">Popis, pravidla, druh a veřejná poloha v katalogu RIS ↗</Link> Ruční úpravy polí zůstávají zachované.</p>}
        {loadingWater && <p className="loading-state" role="status">Načítám revír…</p>}

        {!waterId && <h2>{existingWater ? "Zkontrolovat a upravit údaje" : "Nebo zadat vlastní revír ručně"}</h2>}
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
        <Link className="water-create-back" to={returnToAddCatch ? "/add" : "/waters"}>Zpět{returnToAddCatch ? " k úlovku" : " na revíry"}</Link>

        <div className="water-create-submit">
          <button type="submit" form="water-create-form" disabled={saving || loadingWater || scope.status !== "ready" || Boolean(waterId && !existingWater)}>
            {saving ? "Ukládám…" : existingWater ? "Uložit změny" : "Uložit vlastní revír"}
          </button>
        </div>
      </div>
    </Layout>
  );
}

export default WaterCreatePage;
