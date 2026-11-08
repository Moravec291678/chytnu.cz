import { useEffect, useState } from "react";
import { useDataScope } from "../../auth/context/dataScopeContextValue.js";
import { waterRepository } from "../../waters/data/waterRepository.js";
import { DEFAULT_BAITS } from "../../../shared/constants/constants.js";

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
  return <details className="trip-defaults-fields">
    <summary>Výchozí údaje pro rychlé úlovky</summary>
    <p>Volitelné volby se použijí u dalších fotografií v této vycházce. Starší úlovky se nemění.</p>
    <label>Uložený revír<select value={values.waterId ?? ""} onChange={event => onChange("waterId", event.target.value)}>
      <option value="">Bez přiřazeného revíru</option>
      {values.waterId && !waters.some(water => water.id === values.waterId) && <option value={values.waterId}>Dříve přiřazený revír</option>}
      {waters.map(water => <option key={water.id} value={water.id}>{water.name}</option>)}
    </select></label>
    <fieldset><legend>Nástrahy pro tuto vycházku (nejvýše 5)</legend>
      <div className="bait-options">{DEFAULT_BAITS.map(bait => <label className="bait-chip" key={bait.key}>
        <input type="checkbox" checked={keys.includes(bait.key)} disabled={!keys.includes(bait.key) && keys.length >= 5}
          onChange={event => onChange("baitKeys", event.target.checked ? [...keys, bait.key] : keys.filter(key => key !== bait.key))} />{bait.label}
      </label>)}</div>
    </fieldset>
  </details>;
}
