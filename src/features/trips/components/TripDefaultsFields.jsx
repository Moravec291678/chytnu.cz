import { useEffect, useState } from "react";
import { useDataScope } from "../../auth/context/dataScopeContextValue.js";
import { waterRepository } from "../../waters/data/waterRepository.js";
import { DEFAULT_BAITS, DEFAULT_METHODS } from "../../../shared/constants/constants.js";
import { formatBottomType } from "../../catches/data/catchFormatting.js";
import { TRIP_BOTTOM_TYPES } from "../data/tripModel.js";

export default function TripDefaultsFields({ values, onChange }) {
  const scope = useDataScope();
  const [stored, setStored] = useState({ scopeKey: null, waters: [] });
  useEffect(() => {
    if (scope.status !== "ready") return undefined;
    let active = true;
    waterRepository.list(scope).then(waters => { if (active) setStored({ scopeKey: scope.scopeKey, waters }); }).catch(() => {});
    return () => { active = false; };
  }, [scope]);
  const waters = stored.scopeKey === scope.scopeKey ? stored.waters : [];
  const keys = values.baitKeys ?? [];
  return <>
    <label>Uložený revír<select value={values.waterId ?? ""} onChange={event => onChange("waterId", event.target.value)}>
      <option value="">Bez přiřazeného revíru</option>
      {values.waterId && !waters.some(water => water.id === values.waterId) && <option value={values.waterId}>Dříve přiřazený revír</option>}
      {waters.map(water => <option key={water.id} value={water.id}>{water.name}{water.waterNumber ? ` · ${water.waterNumber}` : ""}</option>)}
    </select></label>
    <details className="trip-defaults-fields">
    <summary>Výchozí údaje pro rychlé úlovky</summary>
    <p>Tyto údaje se automaticky použijí u nových rychlých úlovků. Kdykoliv je můžeš změnit. Dřívější úlovky si zachovají původní údaje.</p>
    <label>Metoda lovu (volitelná)<select value={values.methodKey ?? ""} onChange={event => onChange("methodKey", event.target.value)}>
      <option value="">Neuvedena</option>{DEFAULT_METHODS.map(method => <option key={method.key} value={method.key}>{method.label}</option>)}
    </select></label>
    <fieldset><legend>Nástrahy pro tuto vycházku (nejvýše 5)</legend>
      <div className="bait-options">{DEFAULT_BAITS.map(bait => <label className="bait-chip" key={bait.key}>
        <input type="checkbox" checked={keys.includes(bait.key)} disabled={!keys.includes(bait.key) && keys.length >= 5}
          onChange={event => onChange("baitKeys", event.target.checked ? [...keys, bait.key] : keys.filter(key => key !== bait.key))} />{bait.label}
      </label>)}</div>
    </fieldset>
    <div className="trip-defaults-grid">
      <label>Výchozí hloubka lovu (m)<input type="text" inputMode="decimal" value={values.waterDepthM ?? ""} onChange={event => onChange("waterDepthM", event.target.value)} placeholder="Neznámá" /></label>
      <label>Typ dna<select value={values.bottomType ?? ""} onChange={event => onChange("bottomType", event.target.value)}>
        <option value="">Neuveden</option>{TRIP_BOTTOM_TYPES.map(value => <option key={value} value={value}>{formatBottomType(value)}</option>)}
      </select></label>
    </div>
    <fieldset className="trip-water-measurement">
      <legend>Vlastní měření vody (volitelné)</legend>
      <label>Teplota vody (°C)<input type="text" inputMode="decimal" value={values.waterTempC ?? ""} onChange={event => onChange("waterTempC", event.target.value)} placeholder="Nezměřena" /></label>
      <label>Čas měření teploty vody<input type="datetime-local" step="1" value={values.waterTempMeasuredAt ?? ""} onChange={event => onChange("waterTempMeasuredAt", event.target.value)} required={String(values.waterTempC ?? "").trim() !== ""} /></label>
      <p>Zadej skutečný čas měření. Úlovek zachová údaj i jeho stáří; nejde o nové měření při každé fotografii. Bez měření nech pole prázdná.</p>
    </fieldset>
  </details></>;
}
