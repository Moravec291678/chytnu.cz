import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { createWaterRecord, validateWaterForm, WATER_TYPES } from "../features/waters/data/waterModel.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import { progressionLedger } from "../features/progression/data/progressionLedger.js";
import "./WaterCreatePage.css";

const COMMON_FISH = ["Kapr", "Štika", "Candát", "Lín", "Okoun", "Pstruh", "Sumec", "Amur"];

function WaterCreatePage() {
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
      return;
    }

    setSaving(true);
    setSubmitError("");
    try {
      const record = createWaterRecord({ ...formData, id: pendingWaterId.current }, scope);
      const stored = await waterRepository.put(record, scope);
      await progressionLedger.awardWater(stored, scope);
      window.dispatchEvent(new Event("chytnu:progression-changed"));
      navigate(`/waters/${record.id}`);
    } catch (err) {
      setSubmitError(err?.message || "Revír se nepodařilo uložit. Pokud už byl záznam uložen, můžeš akci bezpečně zkusit znovu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="water-create-page">
        <header className="water-create-header">
          <h1>Přidat revír</h1>
          <p>Ulož si vlastní revír do svého deníku</p>
        </header>

        <form className="water-create-form" onSubmit={handleSubmit}>
          <label>
            Název revíru *
            <input
              type="text"
              placeholder="Např. Vltava 6 nebo Rybník Rožmberk"
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && <span className="field-error" style={{ color: "var(--accent-red)", fontSize: "13px" }}>{errors.name}</span>}
          </label>

          <label>
            Číslo revíru (MRS / ČRS)
            <input
              type="text"
              placeholder="Např. 401 018"
              value={formData.waterNumber}
              onChange={(e) => updateField("waterNumber", e.target.value)}
            />
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
          </div>

          <label>
            Lokalita / Oblast
            <input
              type="text"
              placeholder="Např. Jihočeský kraj, České Budějovice"
              value={formData.area}
              onChange={(e) => updateField("area", e.target.value)}
            />
          </label>

          <div className="water-create-group">
            <span>Hlavní druhy ryb</span>
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
          </div>

          <label>
            Poznámky k revíru
            <textarea
              placeholder="Pravidla, tipy k lovu, parkování nebo přístup k vodě..."
              value={formData.notes}
              onChange={(e) => updateField("notes", e.target.value)}
            />
          </label>

          {submitError && <p role="alert" style={{ color: "var(--accent-red)", fontSize: "14px" }}>{submitError}</p>}
        </form>

        <p className="water-create-note">Revír bude uložen lokálně v tvém zařízení. Přesné GPS soukromých míst se nikdy veřejně nesdílí.</p>
        <Link className="water-create-back" to="/waters">Zpět na revíry</Link>

        <div className="water-create-submit">
          <button type="button" onClick={handleSubmit} disabled={saving || scope.status !== "ready"}>
            {saving ? "Ukládám…" : "Uložit revír"}
          </button>
        </div>
      </div>
    </Layout>
  );
}

export default WaterCreatePage;
