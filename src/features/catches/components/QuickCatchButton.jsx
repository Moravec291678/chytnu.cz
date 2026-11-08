import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCatches } from "../context/useCatches.js";
import { useTrips } from "../../trips/context/useTrips.js";
import { getActiveTrip } from "../../trips/data/tripModel.js";
import { DEFAULT_METHODS, DEFAULT_BAITS } from "../../../shared/constants/constants.js";
import { waterRepository } from "../../waters/data/waterRepository.js";
import { useDataScope } from "../../auth/context/dataScopeContextValue.js";
import { getCatchPhotoHash } from "../data/catchVerification.js";
import "./QuickCatchButton.css";

export default function QuickCatchButton() {
  const camera = useRef(null);
  const gallery = useRef(null);
  const { quickCaptureState: state, saveQuickCapture, state: catches } = useCatches();
  const { state: trips } = useTrips();
  const scope = useDataScope();
  const [savedWaters, setSavedWaters] = useState({ scopeKey: null, waters: [] });
  useEffect(() => {
    if (scope.status !== "ready") return undefined;
    let active = true;
    const load = () => waterRepository.list(scope).then(waters => { if (active) setSavedWaters({ scopeKey: scope.scopeKey, waters }); }).catch(() => {});
    void load();
    window.addEventListener("chytnu:outbox-changed", load);
    return () => { active = false; window.removeEventListener("chytnu:outbox-changed", load); };
  }, [scope]);
  const locked = state.status === "saving" || state.status === "canceling" || scope.status !== "ready";
  const select = (event, inputSource) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void saveQuickCapture(file, inputSource, { trip: getActiveTrip(trips.trips), methods: DEFAULT_METHODS, baits: DEFAULT_BAITS,
      waters: savedWaters.scopeKey === scope.scopeKey ? savedWaters.waters : [],
      usedPhotoHashes: new Set(catches.catches.flatMap(record => (record.photos ?? []).map(getCatchPhotoHash)).filter(Boolean)) });
  };
  return <section className="quick-catch" aria-label="Rychlé uložení úlovku">
    <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={event => select(event, "camera")} />
    <input ref={gallery} type="file" hidden accept="image/*" onChange={event => select(event, "gallery")} />
    <div className="quick-catch-actions">
      <button className="quick-catch-primary" type="button" disabled={locked || state.status === "error"} onClick={() => camera.current?.click()}>Rychlý úlovek</button>
      <button className="quick-catch-gallery" type="button" disabled={locked || (state.status === "error" && !state.canReplace)} onClick={() => gallery.current?.click()}>{state.status === "error" ? "Vybrat jinou fotografii" : "Z galerie"}</button>
    </div>
    {state.status === "saving" && <p role="status">Ukládám fotografii…</p>}
    {state.status === "canceling" && <p role="status">Ruším rozpracované uložení…</p>}
    {state.status === "saved" && <p role="status">Úlovek uložen · <Link to={`/catch/${state.id}/edit`}>Doplnit později</Link></p>}
    {state.status === "error" && <div role="alert"><p>{state.error}</p><p>Fotografie zůstává připravená v této aplikaci.</p><button type="button" onClick={() => void saveQuickCapture()}>Zkusit uložit znovu</button></div>}
  </section>;
}
