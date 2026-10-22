import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  DEFAULT_BAITS,
  DEFAULT_METHODS,
  DEFAULT_SPECIES,
  SPECIES_CATEGORIES,
} from "../shared/constants/constants";
import Layout from "../shared/layout/Layout";
import "./AddCatchPage.css";
import { useCatches } from "../features/catches/context/useCatches";
import { catchToForm, createCatchRecord, updateCatchFormField, validateCatchForm } from "../features/catches/data/catchModel";
import { resolveCatchTripId } from "../features/catches/data/catchTripDefault.js";
import { useTrips } from "../features/trips/context/useTrips";
import { getActiveTrip } from "../features/trips/data/tripModel.js";
import { formatCoordinates, parseCoordinateText } from "../features/catches/data/coordinates";
import { normalizeCatchPrivacy } from "../features/privacy/data/privacyModel";
import { privacyRepository } from "../features/privacy/data/privacyRepository.js";
import { readPreferences } from "../features/preferences/data/preferences.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import { findNearestSavedWater } from "../features/waters/data/nearbyWaterMatch.js";
import { fetchCatchWeather, replaceAutomaticConditions } from "../shared/data/catchWeather.js";
import { calculateMoonPhase } from "../shared/utils/moonPhase.js";
import {
  filterSpeciesCatalog,
  getPrimarySpeciesCategoryKey,
  getSpeciesCategory,
  getSpeciesForCategory,
} from "../features/catches/data/speciesPicker.js";
import {
  MAX_QUICK_SPECIES,
  readQuickSpeciesIds,
  saveQuickSpeciesIds,
  toggleQuickSpecies,
} from "../features/preferences/data/quickSpeciesPreferences.js";
import PhotoFrameEditor from "../features/catches/components/PhotoFrameEditor.jsx";
import { photoFrameStyle } from "../features/catches/data/photoFraming.js";
import { MAX_PHOTOS_PER_CATCH, normalizePrimaryPhotoId } from "../features/catches/data/catchPhotos.js";
import { preparePhotoForStorageAndUpload } from "../features/catches/data/photoInput.js";
import { recordPhotoUploadTrace } from "../features/catches/data/photoUploadTrace.js";

const MOON_PHASES = [
  ["new", "Nov"],
  ["waxingCrescent", "Dorůstající srpek"],
  ["firstQuarter", "První čtvrt"],
  ["waxingGibbous", "Dorůstající"],
  ["full", "Úplněk"],
  ["waningGibbous", "Ubývající"],
  ["lastQuarter", "Poslední čtvrt"],
  ["waningCrescent", "Ubývající srpek"],
];

function localDateTime() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return { date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, time: `${pad(now.getHours())}:${pad(now.getMinutes())}` };
}

function SpeciesManagementRow({ species, selected, pinned, onSelect, onTogglePin }) {
  return <div className={selected ? "species-picker-row species-picker-row-selected" : "species-picker-row"}>
    <button className="species-picker-select" type="button" aria-pressed={selected} onClick={onSelect}>
      <span className="species-item-label">{species.label}</span>
      {species.latinName && <span className="species-picker-latin">{species.latinName}</span>}
    </button>
    <button className={pinned ? "species-pin-button species-pin-button-active" : "species-pin-button"} type="button" aria-pressed={pinned} aria-label={pinned ? `Odebrat ${species.label} z rychlého výběru` : `Přidat ${species.label} do rychlého výběru`} onClick={onTogglePin}>
      {pinned ? "★ Odepnout" : "☆ Připnout"}
    </button>
  </div>;
}

function AddCatchPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { state, createCatch, updateCatch } = useCatches();
  const { state: tripState } = useTrips();
  const scope = useDataScope();
  const preferenceAppliedScopeRef = useRef(null);
  const privacyTouchedScopeRef = useRef(null);
  const privacyDefaultsAppliedScopeRef = useRef(null);
  const [availableWaters, setAvailableWaters] = useState([]);
  const [watersError, setWatersError] = useState("");
  const existingCatch = id ? state.catches.find((item) => item.id === id) : null;
  const [displayFull, setDisplayFull] = useState(() => readPreferences(globalThis.localStorage, scope.scopeKey).detailMode === "detailed");
  useEffect(() => {
    if (scope.status !== "ready") return undefined;
    let active = true;
    waterRepository.list(scope).then((items) => { if (active) { setAvailableWaters(items); setWatersError(""); } })
      .catch((error) => { if (active) setWatersError(error?.message || "Revíry se nepodařilo načíst."); });
    return () => { active = false; };
  }, [scope]);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);
  const [editingPhotoId, setEditingPhotoId] = useState(null);
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(() => readPreferences(globalThis.localStorage, scope.scopeKey).detailMode === "detailed");
  const [selectedSpeciesCategoryKey, setSelectedSpeciesCategoryKey] = useState("");
  const [quickSpeciesOverride, setQuickSpeciesOverride] = useState(null);
  const quickSpeciesIds = quickSpeciesOverride?.scopeKey === scope.scopeKey
    ? quickSpeciesOverride.ids
    : readQuickSpeciesIds(scope.scopeKey);
  const [quickSpeciesError, setQuickSpeciesError] = useState("");
  const [waterSuggestionDismissed, setWaterSuggestionDismissed] = useState(false);
  const [manualWaterChoice, setManualWaterChoice] = useState(Boolean(existingCatch?.waterId || existingCatch?.locationName || location.state?.preselectedWaterId));
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

  const removePhoto = (photoId) => {
    const photos = catchData.photos.filter((item) => item.id !== photoId);
    const removed = catchData.photos.find((item) => item.id === photoId);
    if (removed?.previewUrl) {
      URL.revokeObjectURL(removed.previewUrl);
      photoUrlsRef.current.delete(removed.previewUrl);
    }
    updateCatchData("photos", photos);
    updateCatchData("primaryPhotoId", normalizePrimaryPhotoId(photos, catchData.primaryPhotoId === photoId ? null : catchData.primaryPhotoId));
  };

  const handleFileChange = async (event) => {
    const selectedPhotos = [...(event.target.files ?? [])];
    if (!selectedPhotos.length) return;
    setPhotoProcessing(true);
    const additions = [];
    try {
      const room = MAX_PHOTOS_PER_CATCH - catchData.photos.length;
      if (room <= 0) throw new Error(`Můžeš přidat nejvýše ${MAX_PHOTOS_PER_CATCH} fotografií.`);
      for (const selectedPhoto of selectedPhotos.slice(0, room)) {
        const photoId = crypto.randomUUID();
        recordPhotoUploadTrace(photoId, "photo_selected", {
          sourceMimeType: selectedPhoto.type, sourceBytes: selectedPhoto.size,
          originalExtension: selectedPhoto.name.split(".").pop().toLowerCase(),
        });
        const preparedPhoto = await preparePhotoForStorageAndUpload(selectedPhoto);
        recordPhotoUploadTrace(photoId, "blob_created", {
          preparedMimeType: preparedPhoto.type, preparedBytes: preparedPhoto.size, conversion: "jpeg",
        });
        const optimizedPhoto = preparedPhoto.blob;
        const previewUrl = URL.createObjectURL(optimizedPhoto);
        photoUrlsRef.current.add(previewUrl);
        additions.push({ id: photoId, blob: optimizedPhoto,
          name: selectedPhoto.name.replace(/\.[^.]+$/, ".jpg"),
          type: preparedPhoto.type, size: preparedPhoto.size, contentSha256: preparedPhoto.sha256,
          uploadReady: true,
          previewUrl });
      }
      const nextPhotos = [...catchData.photos, ...additions];
      setPhotos(nextPhotos);
      if (!catchData.primaryPhotoId && nextPhotos[0]) updateCatchData("primaryPhotoId", nextPhotos[0].id);
      if (selectedPhotos.length > room) setFormError(`Přidáno ${room} fotografií. Limit je ${MAX_PHOTOS_PER_CATCH}.`);
      else setFormError("");
    } catch (error) {
      additions.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
        photoUrlsRef.current.delete(item.previewUrl);
      });
      setFormError(error.message || "Fotografii se nepodařilo připravit.");
    } finally {
      setPhotoProcessing(false);
    }
  };

  const [catchData, setCatchData] = useState({
    weightKg: "",
    weightSource: "estimated",
    lengthCm: "",

    girthCm: "",
    fightDurationMin: "",

    locationName: "",
    waterId: "",
    waterNumber: "",

    catchDate: localDateTime().date,
    catchTime: localDateTime().time,

    gpsLocation: "",
    coordinates: null,

    depthM: "",
    bottomType: "",

    speciesKey: "",
    resultKey: displayFull ? "unspecified" : "released",

    conditions: { airTempC: "", waterTempC: "", pressureHpa: "", windKmh: "", moonPhase: "" },
    conditionSources: {},
    fishingMethod: "",
    photos: [],
    baits: [], notes: "", isFavorite: false, tripId: location.state?.tripId ?? "",
    privacy: normalizeCatchPrivacy(null),
  });
  const activeTrip = getActiveTrip(tripState.trips);
  useEffect(() => {
    if (id || tripState.loading) return;
    const nextTripId = resolveCatchTripId({
      isEditing: false,
      currentTripId: catchData.tripId,
      requestedTripId: location.state?.tripId,
      activeTripId: activeTrip?.id,
    });
    if (nextTripId && nextTripId !== catchData.tripId) {
      queueMicrotask(() => setCatchData((current) => ({
        ...current,
        tripId: resolveCatchTripId({
          isEditing: false,
          currentTripId: current.tripId,
          requestedTripId: location.state?.tripId,
          activeTripId: activeTrip?.id,
        }),
      })));
    }
  }, [activeTrip?.id, catchData.tripId, id, location.state, tripState.loading]);
  useEffect(() => {
    if (id || scope.status !== "ready" || privacyDefaultsAppliedScopeRef.current === scope.scopeKey) return undefined;
    privacyDefaultsAppliedScopeRef.current = scope.scopeKey;
    let active = true;
    privacyRepository.get(scope).then((defaults) => {
      if (!active || privacyTouchedScopeRef.current === scope.scopeKey) return;
      setCatchData((current) => ({
        ...current,
        privacy: normalizeCatchPrivacy({
          visibility: defaults.defaultCatchVisibility,
          photoVisibility: defaults.defaultPhotoVisibility,
          privateSpot: defaults.privateSpotDefault,
          locationPrecision: defaults.defaultLocationPrecision,
          nearbyEligible: false,
          heatmapEligible: false,
        }),
      }));
    }).catch(() => {
      // Private form defaults remain in place if saved preferences cannot be read.
    });
    return () => { active = false; };
  }, [id, scope]);
  useEffect(() => {
    if (id || !location.state?.preselectedWaterId || !availableWaters.length) return undefined;
    const selectedWater = availableWaters.find((water) => water.id === location.state.preselectedWaterId);
    if (!selectedWater) return undefined;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setCatchData((current) => ({ ...current, waterId: selectedWater.id, locationName: selectedWater.name }));
      setManualWaterChoice(true);
    });
    return () => { active = false; };
  }, [availableWaters, id, location.state]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("");
  const [weatherStatus, setWeatherStatus] = useState({ state: "idle", message: "" });
  const manualConditionFieldsRef = useRef(new Set());
  const automaticConditionsRef = useRef({});
  const savingRef = useRef(false);
  const [loadedId, setLoadedId] = useState("");

  useEffect(() => {
    if (id || scope.status !== "ready" || preferenceAppliedScopeRef.current === scope.scopeKey) return;
    preferenceAppliedScopeRef.current = scope.scopeKey;
    const detailed = readPreferences(globalThis.localStorage, scope.scopeKey).detailMode === "detailed";
    queueMicrotask(() => {
      setDisplayFull(detailed);
      setShowSpeciesPicker(detailed);
      setCatchData((current) => ({
        ...current,
        resultKey: detailed && current.resultKey === "released" ? "unspecified" : !detailed && current.resultKey === "unspecified" ? "released" : current.resultKey,
      }));
    });
  }, [id, scope.scopeKey, scope.status]);

  useEffect(() => {
    manualConditionFieldsRef.current = new Set();
    automaticConditionsRef.current = {};
  }, [id]);

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
      manualConditionFieldsRef.current = new Set(Object.entries(values.conditionSources ?? {}).filter(([, source]) => source === "manual").map(([field]) => field));
      for (const [field, value] of Object.entries(values.conditions ?? {})) {
        if (value !== "" && value !== null && value !== undefined && values.conditionSources?.[field] !== "auto") manualConditionFieldsRef.current.add(field);
      }
      automaticConditionsRef.current = Object.fromEntries(Object.entries(values.conditions ?? {}).filter(([field, value]) => value !== "" && value !== null && value !== undefined && values.conditionSources?.[field] === "auto"));
      setCatchData(values);
      setManualWaterChoice(Boolean(values.waterId || values.locationName));
      setDisplayFull(true);
      setShowSpeciesPicker(true);
      setSelectedSpeciesCategoryKey(getPrimarySpeciesCategoryKey(DEFAULT_SPECIES.find((species) => species.key === values.speciesKey)));
      setLoadedId(id);
    });
    return () => { active = false; };
  }, [existingCatch, id, loadedId]);

  useEffect(() => {
    if (!displayFull) return undefined;
    const controller = new AbortController();
    let timer;
    const coordinates = catchData.coordinates;
    const nextMoon = calculateMoonPhase(catchData.catchDate, catchData.catchTime);
    const automatic = nextMoon ? { moonPhase: nextMoon } : {};
    setCatchData((previous) => {
      const conditions = replaceAutomaticConditions(
        previous.conditions,
        automaticConditionsRef.current,
        automatic,
        manualConditionFieldsRef.current,
      );
      const conditionSources = { ...(previous.conditionSources ?? {}) };
      for (const [field, value] of Object.entries(automaticConditionsRef.current)) {
        if (conditions[field] !== value && !manualConditionFieldsRef.current.has(field)) delete conditionSources[field];
      }
      for (const [field, value] of Object.entries(automatic)) {
        if (!manualConditionFieldsRef.current.has(field) && conditions[field] === value) conditionSources[field] = "auto";
      }
      automaticConditionsRef.current = Object.fromEntries(
        Object.entries(automatic).filter(([field, value]) => !manualConditionFieldsRef.current.has(field) && conditions[field] === value),
      );
      return { ...previous, conditions, conditionSources };
    });

    if (!coordinates || !Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) {
      setWeatherStatus({ state: "idle", message: "" });
      return () => controller.abort();
    }

    setWeatherStatus({ state: "loading", message: "Načítám počasí pro místo a čas úlovku…" });
    timer = setTimeout(async () => {
      try {
        const values = await fetchCatchWeather(coordinates.latitude, coordinates.longitude, catchData.catchDate, catchData.catchTime, { signal: controller.signal });
        setCatchData((previous) => {
          const conditions = replaceAutomaticConditions(previous.conditions, {}, values, manualConditionFieldsRef.current);
          const conditionSources = { ...(previous.conditionSources ?? {}) };
          automaticConditionsRef.current = {
            ...automaticConditionsRef.current,
            ...Object.fromEntries(Object.entries(values).filter(([field, value]) => !manualConditionFieldsRef.current.has(field) && conditions[field] === value)),
          };
          for (const [field, value] of Object.entries(values)) {
            if (!manualConditionFieldsRef.current.has(field) && conditions[field] === value) conditionSources[field] = "auto";
          }
          return { ...previous, conditions, conditionSources };
        });
        setWeatherStatus({ state: "loaded", message: "Dostupné počasí bylo doplněno; ruční hodnoty zůstávají beze změny." });
      } catch (error) {
        if (!controller.signal.aborted) setWeatherStatus({ state: "error", message: error.message || "Počasí pro tento čas není dostupné. Úlovek lze uložit i bez něj." });
      }
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [catchData.coordinates, catchData.coordinates?.latitude, catchData.coordinates?.longitude, catchData.catchDate, catchData.catchTime, displayFull]);

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
      let progressionEventIds = [];
      if (existingCatch) await updateCatch(record);
      else progressionEventIds = (await createCatch(record))?.progressionEventIds ?? [];
      navigate(existingCatch ? `/catch/${record.id}` : `/catch/${record.id}/reward`, {
        replace: true,
        state: existingCatch ? { saved: true } : { rewardEventIds: progressionEventIds },
      });
    } catch (error) {
      setFormError(error.message || "Úlovek se nepodařilo uložit. Zkus to znovu.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const editingPhoto = catchData.photos.find((item) => item.id === editingPhotoId);
  const selectedSpecies = DEFAULT_SPECIES.find(
    (species) => catchData.speciesKey === species.key,
  );
  const [speciesSearch, setSpeciesSearch] = useState("");
  const filteredSpecies = filterSpeciesCatalog(DEFAULT_SPECIES, speciesSearch);
  const filteredPinnedSpecies = quickSpeciesIds
    .map((speciesId) => filteredSpecies.find((species) => species.key === speciesId))
    .filter(Boolean);
  const filteredUnpinnedSpecies = filteredSpecies.filter((species) => !quickSpeciesIds.includes(species.key));
  const nearestWater = findNearestSavedWater(catchData.coordinates, availableWaters);
  const waterSuggestion = !catchData.waterId && !manualWaterChoice && !waterSuggestionDismissed ? nearestWater : null;
  const selectedSpeciesCategory = getSpeciesCategory(selectedSpeciesCategoryKey);
  const categorySpecies = selectedSpeciesCategoryKey
    ? getSpeciesForCategory(selectedSpeciesCategoryKey, filteredSpecies)
    : [];

  const updateCatchData = (field, value) => {
    setFormError("");
    if (field === "privacy") privacyTouchedScopeRef.current = scope.scopeKey;
    setCatchData((previous) => updateCatchFormField(previous, field, value));
  };

  const togglePinnedSpecies = (speciesId) => {
    if (scope.status !== "ready" || !scope.scopeKey) {
      setQuickSpeciesError("Načítám profil. Zkus připnutí za okamžik znovu.");
      return;
    }
    const validIds = new Set(DEFAULT_SPECIES.map((species) => species.key));
    const result = toggleQuickSpecies(quickSpeciesIds, speciesId, validIds);
    if (result.error) {
      setQuickSpeciesError(result.error);
      return;
    }
    try {
      const saved = saveQuickSpeciesIds(scope.scopeKey, result.ids, globalThis.localStorage, validIds);
      setQuickSpeciesOverride({ scopeKey: scope.scopeKey, ids: saved });
      setQuickSpeciesError("");
    } catch (error) {
      setQuickSpeciesError(error.message || "Rychlý výběr se nepodařilo uložit.");
    }
  };

  const updateConditions = (field, value) => {
    setFormError("");
    manualConditionFieldsRef.current.add(field);
    setCatchData((previous) => ({
      ...previous,
      conditions: { ...(previous.conditions ?? {}), [field]: value },
      conditionSources: { ...(previous.conditionSources ?? {}), [field]: "manual" },
    }));
  };

  const removeSelectedSpecies = () => {
    updateCatchData("speciesKey", "");
    setSelectedSpeciesCategoryKey("");
    setSpeciesSearch("");
    setShowSpeciesPicker(true);
  };

  const applyWaterSuggestion = () => {
    if (!waterSuggestion) return;
    setManualWaterChoice(true);
    updateCatchData("waterId", waterSuggestion.water.id);
    updateCatchData("locationName", waterSuggestion.water.name);
    updateCatchData("waterNumber", String(waterSuggestion.water.waterNumber || "").replace(/\D/g, ""));
    setWaterSuggestionDismissed(true);
  };

  const updateGpsLocation = (value, coordinates = null) => {
    setFormError("");
    setGpsMessage("");
    const parsedCoordinates = coordinates ?? parseCoordinateText(value);
    setCatchData((previous) => ({ ...previous, gpsLocation: value, coordinates: parsedCoordinates }));
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

  const savePhotoFrame = (frame) => {
    setPhotos(catchData.photos.map((item) => item.id === editingPhotoId ? { ...item, ...frame } : item));
    setPhotoEditorOpen(false);
    setEditingPhotoId(null);
  };

  if (id && !state.loading && !existingCatch) {
    return <Layout><section className="add-catch-section"><h1>Úlovek nenalezen</h1><p>Tento úlovek mohl být smazán nebo není v místním deníku dostupný.</p><Link to="/journal">Zpět do deníku</Link></section></Layout>;
  }

  return (
    <Layout>
      <div className="add-catch-page">
        <header className="add-catch-header">
          <Link className="add-catch-back" to={id ? `/catch/${id}` : "/journal"} aria-label={id ? "Zpět na detail úlovku" : "Zpět do deníku"}>←</Link>
          <div>
            <h1>{id ? "Upravit úlovek" : "Nový úlovek"}</h1>
            <p>Rychlý zápis, nebo podrobnosti podle potřeby.</p>
          </div>
        </header>

        <section className="add-catch-mode-switch">
          <button
            type="button"
            className={
              !displayFull ? "mode-button mode-button-active" : "mode-button"
            }
            onClick={() => {
              setDisplayFull(false);
              setShowSpeciesPicker(false);
              setSpeciesSearch("");
              if (catchData.resultKey === "unspecified") updateCatchData("resultKey", "released");
            }}
          >
            Rychle (3 kroky)
          </button>

          <button
            type="button"
            className={
              displayFull ? "mode-button mode-button-active" : "mode-button"
            }
            onClick={() => { setDisplayFull(true); setShowSpeciesPicker(true); setSelectedSpeciesCategoryKey(""); setSpeciesSearch(""); }}
          >
            Plný záznam
          </button>
        </section>

        <section className="add-catch-photo-section">
          <input
            type="file"
            ref={fileInputRef}
            hidden
            onChange={handleFileChange}
            accept="image/*,.heic,.heif"
            multiple
          />

          {catchData.photos.length > 0 && <div className="catch-photo-manager">
            {catchData.photos.map((item) => <article className={`photo-preview-item${item.id === catchData.primaryPhotoId ? " photo-preview-primary" : ""}`} key={item.id}>
              {item.previewUrl ? <img src={item.previewUrl} alt={`Fotografie úlovku – ${item.name}`} style={photoFrameStyle(item)} /> : <p>Fotografie je dostupná pouze po načtení místního souboru.</p>}
              {item.uploadReady === false && <p className="catch-form-hint" role="status">Původní soubor je uložený v tomto zařízení, ale nepodařilo se ho připravit pro synchronizaci. Zkus fotografii převést na JPG, PNG nebo WebP a nahradit ji.</p>}
              <div className="photo-actions">
                <button type="button" className="photo-action-button" aria-pressed={item.id === catchData.primaryPhotoId} onClick={() => updateCatchData("primaryPhotoId", item.id)}>{item.id === catchData.primaryPhotoId ? "★ Hlavní" : "Nastavit hlavní"}</button>
                {item.previewUrl && <button type="button" className="photo-action-button" onClick={() => { setEditingPhotoId(item.id); setPhotoEditorOpen(true); }}>Upravit výřez</button>}
                <button type="button" className="photo-action-button" onClick={() => removePhoto(item.id)}>Odebrat</button>
              </div>
            </article>)}
          </div>}
          {catchData.photos.length < MAX_PHOTOS_PER_CATCH && <button type="button" onClick={handleAddPhoto} className="photo-upload-button">
              <span className="photo-upload-icon" aria-hidden="true">⌑</span>
              <span>{catchData.photos.length ? "Přidat fotografie" : `Přidat fotografie${existingCatch ? "" : " · +5 XP"}`}</span>
            </button>}
        </section>
        {photoEditorOpen && editingPhoto?.previewUrl && <PhotoFrameEditor photo={editingPhoto} onSave={savePhotoFrame} onCancel={() => { setPhotoEditorOpen(false); setEditingPhotoId(null); }} />}
        <section className="add-catch-section">
          <h2>Druh ryby *</h2>

          {selectedSpecies ? (
            <div className="selected-species">
              <div className="selected-species-content">
                <span className="selected-species-name">
                  {selectedSpecies.label}
                </span>
                {selectedSpecies.latinName && <span className="selected-species-latin">{selectedSpecies.latinName}</span>}
              </div>
              <div className="selected-species-actions">
                <button className="selected-species-button" type="button" onClick={() => { setShowSpeciesPicker(true); setSpeciesSearch(""); if (displayFull && !selectedSpeciesCategoryKey) setSelectedSpeciesCategoryKey(getPrimarySpeciesCategoryKey(selectedSpecies)); }}>
                  ✏️ Změnit
                </button>
                <button className="selected-species-remove" type="button" onClick={removeSelectedSpecies} aria-label={`Odebrat druh ${selectedSpecies.label}`}>
                  × Odebrat
                </button>
              </div>
            </div>
          ) : displayFull ? (
            <p className="species-picker-hint">Vyber druh z kompletního katalogu.</p>
          ) : (
            <>
              <div className="quick-species-grid">
                {quickSpeciesIds.map((speciesId) => DEFAULT_SPECIES.find((species) => species.key === speciesId)).filter(Boolean).map((species) => (
                  <button
                    className="quick-species-button"
                    key={species.key}
                    type="button"
                    aria-label={`Vybrat ${species.label}`}
                    onClick={() => updateCatchData("speciesKey", species.key)}
                  ><span className="quick-species-fish" aria-hidden="true">◀</span>{species.label}</button>
                ))}
                <button className="quick-species-button quick-species-other" type="button" onClick={() => { setShowSpeciesPicker(true); setSpeciesSearch(""); }}>
                  <span aria-hidden="true">＋</span>Upravit +
                </button>
              </div>
              {quickSpeciesIds.length === 0 && <p className="species-picker-hint">Připni si oblíbené druhy, nebo vyber libovolný z katalogu.</p>}
            </>
          )}

          {displayFull && showSpeciesPicker ? <div className="species-selection">
            {!selectedSpeciesCategoryKey ? (
              <div className="species-list species-category-list" aria-label="Kategorie druhů ryb">
                {SPECIES_CATEGORIES.map((category) => <button
                  className="species-category"
                  type="button"
                  key={category.key}
                  aria-label={`Otevřít kategorii ${category.label.replace(/^\S+\s/, "")}`}
                  onClick={() => { setSelectedSpeciesCategoryKey(category.key); setSpeciesSearch(""); }}
                >
                  <span>{category.label}</span>
                  <span className="species-category-arrow" aria-hidden="true">›</span>
                </button>)}
              </div>
            ) : <>
            <div className="species-selection-header">
              <div className="species-selection-title">{selectedSpeciesCategory?.label}</div>
              <button className="species-back-button" type="button" onClick={() => { setSelectedSpeciesCategoryKey(""); setSpeciesSearch(""); }}>← Kategorie</button>
            </div>
            <div className="species-search">
              <input
                className="species-search-input"
                aria-label="Hledat druh podle českého nebo latinského názvu"
                value={speciesSearch}
                onChange={(e) => setSpeciesSearch(e.target.value)}
                type="search"
                placeholder="Hledat druh nebo latinský název..."
              />
              {speciesSearch && <button className="species-search-clear" type="button" aria-label="Vymazat hledání" onClick={() => setSpeciesSearch("")}>✕</button>}
            </div>
            {categorySpecies.length === 0 ? (
              <div className="species-empty"><span className="species-empty-icon">🐟</span><p className="species-empty-title">Žádná ryba nebyla nalezena</p><p className="species-empty-text">Zkus jiný název nebo vymaž hledání.</p></div>
            ) : (
              <div className="species-items species-items-full" aria-label={`Druhy v kategorii ${selectedSpeciesCategory?.label}`}>
                {categorySpecies.map((species) => (
                  <button className={species.key === catchData.speciesKey ? "species-picker-select species-picker-select-full species-picker-row-selected" : "species-picker-select species-picker-select-full"} key={species.key} type="button" aria-pressed={species.key === catchData.speciesKey} onClick={() => { updateCatchData("speciesKey", species.key); setSpeciesSearch(""); setShowSpeciesPicker(false); }}>
                    <span className="species-item-label">{species.label}</span>
                    {species.latinName && <span className="species-picker-latin">{species.latinName}</span>}
                  </button>
                ))}
              </div>
            )}
            </>}
          </div> : showSpeciesPicker && <div className="species-selection">
            <div className="species-selection-header">
              <div className="species-selection-title">Všechny druhy</div>
              <button className="species-back-button" type="button" onClick={() => { setShowSpeciesPicker(false); setSpeciesSearch(""); setQuickSpeciesError(""); }}>Zavřít</button>
            </div>
            <div className="species-search">
              <input
                className="species-search-input"
                aria-label="Hledat druh podle českého nebo latinského názvu"
                value={speciesSearch}
                onChange={(e) => setSpeciesSearch(e.target.value)}
                type="search"
                placeholder="Hledat druh nebo latinský název..."
              />
              {speciesSearch && <button className="species-search-clear" type="button" aria-label="Vymazat hledání" onClick={() => setSpeciesSearch("")}>✕</button>}
            </div>
            {quickSpeciesError && <p className="species-preference-error" role="alert">{quickSpeciesError}</p>}
            {filteredSpecies.length === 0 ? (
              <div className="species-empty"><span className="species-empty-icon">🐟</span><p className="species-empty-title">Žádná ryba nebyla nalezena</p><p className="species-empty-text">Zkus jiný název nebo vymaž hledání.</p></div>
            ) : (
              <div className="quick-species-management">
                {filteredPinnedSpecies.length > 0 && <>
                  <h3 className="species-management-heading">Připnuté</h3>
                  <div className="species-items" aria-label="Připnuté druhy ryb">
                    {filteredPinnedSpecies.map((species) => <SpeciesManagementRow key={species.key} species={species} selected={species.key === catchData.speciesKey} pinned onSelect={() => { updateCatchData("speciesKey", species.key); setSpeciesSearch(""); setQuickSpeciesError(""); setShowSpeciesPicker(false); }} onTogglePin={() => togglePinnedSpecies(species.key)} />)}
                  </div>
                </>}
                {filteredUnpinnedSpecies.length > 0 && <>
                  <h3 className="species-management-heading">Všechny druhy</h3>
                  <div className="species-items" aria-label="Všechny druhy ryb">
                    {filteredUnpinnedSpecies.map((species) => <SpeciesManagementRow key={species.key} species={species} selected={species.key === catchData.speciesKey} pinned={false} onSelect={() => { updateCatchData("speciesKey", species.key); setSpeciesSearch(""); setQuickSpeciesError(""); setShowSpeciesPicker(false); }} onTogglePin={() => togglePinnedSpecies(species.key)} />)}
                  </div>
                </>}
              </div>
            )}
            <p className="species-preference-count">Rychlý výběr: {quickSpeciesIds.length}/{MAX_QUICK_SPECIES}</p>
          </div>}
        </section>

        <section className="add-catch-section">
          <h2>Míry</h2>

          <div
            className={
              displayFull
                ? "measurements-grid measurements-grid-full"
                : "measurements-grid"
            }
          >
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
              <span className="weight-estimate-note" aria-hidden="true">&nbsp;</span>
            </label>

            <label className="input-group">
              <span>Váha (kg)</span>
              <input type="text" inputMode="decimal" step="0.01" min="0" placeholder="Např. 4.70" value={catchData.weightKg} onChange={(e) => updateCatchData("weightKg", e.target.value)} />
              <span className="weight-estimate-note">{catchData.weightSource === "estimated" && String(catchData.weightKg).trim() !== "" && Number.isFinite(Number(String(catchData.weightKg).replace(",", "."))) ? "Odhad podle délky a druhu" : "\u00a0"}</span>
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

        {displayFull && <section className="add-catch-section">
          <h2>Místo a čas</h2>

          <div className="measurements-grid">
            <label className="input-group input-group-full">
              <span>Uložený revír</span>
              <select aria-label="Vybrat uložený revír" value={catchData.waterId || ""} onChange={(event) => {
                const water = availableWaters.find((item) => item.id === event.target.value);
                setManualWaterChoice(true);
                updateCatchData("waterId", water?.id || "");
                if (water) {
                  updateCatchData("locationName", water.name);
                  const numericWaterNumber = String(water.waterNumber || "").replace(/\D/g, "");
                  updateCatchData("waterNumber", numericWaterNumber || "");
                }
                setWaterSuggestionDismissed(true);
              }}>
                <option value="">Bez uloženého revíru / vlastní lokalita</option>
                {catchData.waterId && !availableWaters.some((item) => item.id === catchData.waterId) && <option value={catchData.waterId}>Dříve vybraný revír (nedostupný)</option>}
                {availableWaters.map((water) => <option value={water.id} key={water.id}>{water.name}{water.waterNumber ? ` · ${water.waterNumber}` : ""}</option>)}
              </select>
              {watersError && <span className="field-error" role="alert">{watersError}</span>}
              {!availableWaters.length && !watersError && <span><Link to="/waters/new">Přidat revír →</Link></span>}
            </label>
            <label className="input-group input-group-full">
              <span>Revír / lokalita</span>

              <input
                type="text"
                placeholder="Např. Lipno - sever"
                value={catchData.locationName}
                onChange={(e) => { setManualWaterChoice(true); setWaterSuggestionDismissed(true); updateCatchData("locationName", e.target.value); updateCatchData("waterId", ""); }}
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

                    setManualWaterChoice(true);
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
                  {waterSuggestion && <div className="water-suggestion" role="status"><span>Nejbližší uložený revír: <strong>{waterSuggestion.water.name}</strong>{waterSuggestion.water.waterNumber ? ` · ${waterSuggestion.water.waterNumber}` : ""} ({waterSuggestion.distanceMeters} m). Návrh podle GPS může být nepřesný.</span><button type="button" onClick={applyWaterSuggestion}>Použít</button><button type="button" aria-label="Skrýt návrh revíru" onClick={() => setWaterSuggestionDismissed(true)}>×</button></div>}
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
        </section>}

        {displayFull && (
          <>
            <section className="add-catch-section">
              <h2>Metoda lovu</h2>

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
              <h2>Nástrahy</h2>
              <div className="bait-options">{DEFAULT_BAITS.map((bait) => <label key={bait.key} className={catchData.baits.includes(bait.key) ? "bait-chip bait-chip-active" : "bait-chip"}><input type="checkbox" checked={catchData.baits.includes(bait.key)} onChange={(event) => updateCatchData("baits", event.target.checked ? [...catchData.baits, bait.key] : catchData.baits.filter((key) => key !== bait.key))} />{bait.label}</label>)}</div>
            </section>

          </>
        )}

        {displayFull && <section className="add-catch-section">
          <h2>Výprava</h2>
          <label className="input-group">
            <span>Zařadit úlovek k výpravě</span>
            <select value={catchData.tripId} onChange={(event) => updateCatchData("tripId", event.target.value)} disabled={tripState.loading}>
              <option value="">Bez výpravy</option>
              {tripState.trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}{trip.endedAt ? " · dokončená" : " · aktivní"}</option>)}
            </select>
          </label>
          {tripState.error && <p role="status">Výpravy se nepodařilo načíst; úlovek lze uložit samostatně.</p>}
        </section>}

        {displayFull && <section className="add-catch-section">
          <h2>Podmínky</h2>
          {weatherStatus.message && <p className={`catch-weather-status catch-weather-status-${weatherStatus.state}`} role="status">{weatherStatus.message}</p>}
          <div className="measurements-grid conditions-grid">
            <label className="input-group">
              <span>Vzduch (°C)</span>
              <input type="text" inputMode="decimal" placeholder="Např. 11" value={catchData.conditions?.airTempC ?? ""} onChange={(event) => updateConditions("airTempC", event.target.value)} />
            </label>
            <label className="input-group">
              <span>Voda (°C)</span>
              <input type="text" inputMode="decimal" placeholder="Např. 12" value={catchData.conditions?.waterTempC ?? ""} onChange={(event) => updateConditions("waterTempC", event.target.value)} />
            </label>
            <label className="input-group">
              <span>Tlak (hPa)</span>
              <input type="text" inputMode="decimal" placeholder="Např. 1018" value={catchData.conditions?.pressureHpa ?? ""} onChange={(event) => updateConditions("pressureHpa", event.target.value)} />
            </label>
            <label className="input-group">
              <span>Vítr (km/h)</span>
              <input type="text" inputMode="decimal" placeholder="Např. 9" value={catchData.conditions?.windKmh ?? ""} onChange={(event) => updateConditions("windKmh", event.target.value)} />
            </label>
          </div>
          <div className="conditions-moon">
            <h3>Fáze měsíce</h3>
            <div className="conditions-moon-grid" role="group" aria-label="Fáze měsíce">
              {MOON_PHASES.map(([key, label]) => (
                <button
                  aria-pressed={catchData.conditions?.moonPhase === key}
                  className={catchData.conditions?.moonPhase === key ? "conditions-moon-button conditions-moon-button-active" : "conditions-moon-button"}
                  key={key}
                  type="button"
                  onClick={() => updateConditions("moonPhase", catchData.conditions?.moonPhase === key ? "" : key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>}

        <section className="add-catch-section">
          <h2>Výsledek</h2>
          <div className="result-buttons">
            <button
              className={
                catchData.resultKey === "released" ? "result-button button-active" : "result-button"
              }
              onClick={() => {
                updateCatchData("resultKey", "released");
              }}
            >
              Puštěno zpět
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
              Necháno
            </button>
            {displayFull && <button
              className={catchData.resultKey === "unspecified" ? "result-button button-active" : "result-button"}
              onClick={() => updateCatchData("resultKey", "unspecified")}
            >
              Neuvedeno
            </button>}
          </div>
        </section>

        {displayFull && (
          <>
          <section className="add-catch-section">
            <h2>📝 Poznámky</h2>

            <textarea value={catchData.notes} onChange={(event) => updateCatchData("notes", event.target.value)} placeholder="Poznámky k úlovku..." />

            <label className="favorite-checkbox">
              <input type="checkbox" checked={catchData.isFavorite} onChange={(event) => updateCatchData("isFavorite", event.target.checked)} />

              <span>⭐ Označit jako oblíbený</span>
            </label>
          </section>

          <section className="add-catch-section" aria-labelledby="catch-privacy-title">
            <h2 id="catch-privacy-title">🔒 Soukromí úlovku</h2>
            <label className="input-group">
              <span>Viditelnost úlovku</span>
              <select
                value={catchData.privacy?.visibility ?? "private"}
                onChange={(event) => updateCatchData("privacy", { ...(catchData.privacy ?? {}), visibility: event.target.value })}
              >
                <option value="private">Soukromý</option>
                <option value="public">Veřejný</option>
              </select>
            </label>
            <label className="input-group">
              <span>Viditelnost fotografie</span>
              <select
                value={catchData.privacy?.photoVisibility ?? "private"}
                onChange={(event) => updateCatchData("privacy", { ...(catchData.privacy ?? {}), photoVisibility: event.target.value })}
              >
                <option value="private">Soukromá</option>
                <option value="public">Veřejná</option>
              </select>
            </label>
            <label className="input-group">
              <span>Přesnost polohy</span>
              <select
                value={catchData.privacy?.privateSpot ? "none" : (catchData.privacy?.locationPrecision ?? "none")}
                disabled={catchData.privacy?.privateSpot}
                onChange={(event) => updateCatchData("privacy", { ...(catchData.privacy ?? {}), locationPrecision: event.target.value })}
              >
                <option value="none">Nezveřejňovat polohu</option>
                <option value="approximate">Přibližná oblast</option>
                <option value="exact">Přesná poloha</option>
              </select>
            </label>
            <label className="favorite-checkbox">
              <input
                type="checkbox"
                checked={catchData.privacy?.privateSpot ?? true}
                onChange={(event) => updateCatchData("privacy", { ...(catchData.privacy ?? {}), privateSpot: event.target.checked })}
              />
              <span>Považovat místo za soukromé (vždy skryje polohu)</span>
            </label>
          </section>
          </>
        )}

        {formError && <p role="alert" className="catch-form-error">{formError}</p>}
        {state.error && <p role="alert" className="catch-form-error">{state.error}</p>}
        {id && state.loading && <p className="loading-state" role="status">Načítám úlovek…</p>}
        <button type="button" className="save-catch-button" onClick={handleSave} disabled={saving || photoProcessing || (id && !existingCatch)}>{photoProcessing ? "Připravuji fotografii…" : saving ? "Ukládám…" : id ? "Uložit změny" : "Uložit úlovek"}</button>
      </div>
    </Layout>
  );
}

export default AddCatchPage;
