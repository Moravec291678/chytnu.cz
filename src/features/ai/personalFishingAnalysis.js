import { DEFAULT_SPECIES } from "../../shared/constants/speciesCatalog.js";

export const HOME_ANALYSIS_VERSION = "personal-fishing-v1";
export const personalRecordCountLabel = count => `${count} ${count === 1 ? "záznam" : count >= 2 && count <= 4 ? "záznamy" : "záznamů"}`;
const DAY = 86_400_000;
const text = value => typeof value === "string" ? value.trim().slice(0, 120) : "";
const number = value => new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(value);
const round = value => Math.round(value * 10) / 10;
const positiveLength = value => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 350 ? value : null;
const sorted = values => [...new Set(values)].sort();
const mean = rows => rows.reduce((sum, row) => sum + row.length, 0) / rows.length;
const speciesNames = new Map(DEFAULT_SPECIES.map(item => [item.key, item.label]));
const limitation = "Četnost úlovků není úspěšnost za hodinu. Neznáme všechny neúspěšné vycházky ani vliv ostatních podmínek.";
const validCatchDate = value => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (!match) return false;
  const [, year, month, day] = match.map(Number), date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

// A deterministic freshness checksum, not an authentication/signature primitive.
// The server independently rebuilds the analysis from owner-authorized records.
function checksum(value) {
  const source = JSON.stringify(value);
  let a = 2166136261, b = 2246822519, c = 3266489917, d = 668265263;
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    a = Math.imul(a ^ code, 16777619); b = Math.imul(b ^ code, 3266489917);
    c = Math.imul(c ^ code, 668265263); d = Math.imul(d ^ code, 374761393);
  }
  return [a, b, c, d].map(part => (part >>> 0).toString(16).padStart(8, "0")).join("");
}
const groups = (rows, keyOf) => {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b));
};
const independentDays = rows => new Set(rows.map(row => row.day)).size;
const supported = (a, b, minimum = 4) => a.length >= minimum && b.length >= minimum && independentDays(a) >= 3 && independentDays(b) >= 3;

function cleanRows(catches, now, formatter) {
  const seen = new Set();
  return (Array.isArray(catches) ? catches : []).filter(record => record && !record.deleted && text(record.id)
    && validCatchDate(record.caughtAt) && Date.parse(record.caughtAt) <= now + 300_000)
    .sort((a, b) => Date.parse(b.caughtAt) - Date.parse(a.caughtAt) || a.id.localeCompare(b.id)).filter(record => {
      if (seen.has(record.id)) return false;
      seen.add(record.id); return true;
    }).slice(0, 500).map(record => {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(record.caughtAt)).map(part => [part.type, part.value]));
      const hour = Number(parts.hour);
      const monthNumber = Number(parts.month), year = Number(parts.year);
      const season = monthNumber === 12 || monthNumber < 3 ? `${monthNumber === 12 ? year + 1 : year}-0 zima`
        : monthNumber < 6 ? `${year}-1 jaro` : monthNumber < 9 ? `${year}-2 léto` : `${year}-3 podzim`;
      const bucket = hour < 6 || hour >= 22 ? "noc (22–6 h)" : hour < 11 ? "ráno (6–11 h)" : hour < 17 ? "den (11–17 h)" : "večer (17–22 h)";
      const key = text(record.speciesKey);
      const confirmed = key && !["unknown", "unidentified", "unspecified"].includes(key.toLowerCase())
        && record.quickCatch?.provenance?.speciesKey !== "ai_suggestion";
      const conditions = Object.fromEntries(["airTempC", "pressureHpa", "windKmh"].map(field => {
        const value = record.conditions?.[field];
        const ranges = { airTempC: [-60, 60], pressureHpa: [800, 1100], windKmh: [0, 200] };
        return [field, typeof value === "number" && Number.isFinite(value) && value >= ranges[field][0] && value <= ranges[field][1] ? value : null];
      }));
      return { id: record.id, timestamp: Date.parse(record.caughtAt), day: `${parts.year}-${parts.month}-${parts.day}`,
        month: `${parts.year}-${parts.month}`, season, bucket, speciesKey: confirmed ? key : "", species: speciesNames.get(key) || text(record.species) || "Neurčený druh",
        method: text(record.method?.key), methodLabel: text(record.method?.label) || "zapsaná metoda",
        baits: sorted((Array.isArray(record.baits) ? record.baits : []).map(bait => text(bait?.key)).filter(Boolean)).slice(0, 12),
        baitLabels: Object.fromEntries((Array.isArray(record.baits) ? record.baits : []).filter(item => text(item?.key)).slice(0, 12).map(item => [text(item.key), text(item.label) || "zapsaná nástraha"])),
        water: text(record.waterId) ? `id:${text(record.waterId)}` : text(record.locationName) ? `name:${text(record.locationName)}` : "",
        waterLabel: text(record.locationName), tripId: text(record.tripId), length: positiveLength(record.lengthCm), conditions };
    });
}

/** Pure descriptive analysis. No requests, mutation, guessed weather or invented fishing effort. */
export function buildPersonalFishingAnalysis(catches = [], { trips = [], waters = [], now = Date.now(), timeZone = "Europe/Prague" } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) throw new TypeError("Invalid analysis time.");
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" });
  const rows = cleanRows(catches, nowMs, formatter);
  const cleanTrips = (Array.isArray(trips) ? trips : []).filter(trip => trip && !trip.deleted && text(trip.id))
    .sort((a, b) => a.id.localeCompare(b.id)).slice(0, 500).map(trip => ({ id: text(trip.id), start: Date.parse(trip.startedAt),
      end: Date.parse(trip.endedAt), method: text(trip.methodKey), waterId: text(trip.waterId), baitKey: text(trip.baitKey) }));
  const waterNames = new Map((Array.isArray(waters) ? waters : []).filter(water => water && !water.deleted).map(water => [water.id, text(water.name)]));
  for (const row of rows) row.waterLabel = waterNames.get(row.water.slice(3)) || row.waterLabel || "zapsaná voda";
  const fingerprint = checksum([HOME_ANALYSIS_VERSION, timeZone, rows.map(({ species, methodLabel, baitLabels, waterLabel, ...row }) => {
    void species; void methodLabel; void baitLabels; void waterLabel; return row;
  }), cleanTrips.map(trip => ({ ...trip, start: Number.isFinite(trip.start) ? trip.start : null, end: Number.isFinite(trip.end) ? trip.end : null }))]);
  const candidates = [];
  const add = ({ family, key, title, observation, numbers, interpretation, experiment, uncertainty = limitation, evidence, strength = 0 }) => {
    const ids = sorted(evidence.map(row => typeof row === "string" ? row : row.id));
    candidates.push({ id: `${family}:${checksum(key)}`, family, title, observation, numbers, interpretation, experiment, uncertainty,
      evidenceIds: ids, score: round(Math.min(ids.length, 30) + Math.min(independentDays(evidence.filter(row => typeof row !== "string")), 12) * 2 + strength),
      basedOnRecords: ids.length, isInsight: family !== "specific-next-step", source: "Tip z deníku" });
  };
  for (const [speciesKey, speciesRows] of groups(rows.filter(row => row.speciesKey), row => row.speciesKey)) {
    const species = speciesRows[0].species;
    // Interaction, not just the most common hour: method composition in one
    // time window differs from other windows for the same species.
    for (const [window, a] of groups(speciesRows, row => row.bucket)) {
      const b = speciesRows.filter(row => row.bucket !== window);
      if (!supported(a, b)) continue;
      for (const [method, matches] of groups(a.filter(row => row.method), row => row.method)) {
        const knownA = a.filter(row => row.method), knownB = b.filter(row => row.method);
        const otherMatches = knownB.filter(row => row.method === method);
        if (!supported(knownA, knownB) || matches.length < 4) continue;
        const difference = matches.length / knownA.length - otherMatches.length / knownB.length;
        if (difference < 0.25) continue;
        add({ family: "species-time-method", key: [speciesKey, window, method], title: `${species}: ${window} se pojí s jinou metodou`,
          observation: `V okně ${window} máš ${a.length} z ${speciesRows.length} zapsaných úlovků tohoto druhu. ${matches[0].methodLabel} je u ${matches.length} z ${knownA.length} úlovků se známou metodou v tomto okně, mimo něj u ${otherMatches.length} z ${knownB.length}.`,
          numbers: { windowCatches: a.length, speciesCatches: speciesRows.length, methodInWindow: matches.length, knownInWindow: knownA.length, methodOutside: otherMatches.length, knownOutside: knownB.length, shareDifferencePoints: round(difference * 100) },
          interpretation: "Čas a metoda se v tvém deníku překrývají. Samotné počty proto neumějí oddělit vliv denní doby od volby metody.",
          experiment: `Při další vycházce se stejnou metodou porovnej okno ${window} s jiným časem na stejné vodě. Zapiš dobu obou částí i část bez úlovku.`, evidence: speciesRows, strength: 12 + difference * 10 });
      }
    }
    // Local water identities remain local; only anonymous numeric comparisons
    // are included in providerSummary below.
    for (const [water, a] of groups(speciesRows.filter(row => row.water), row => row.water)) {
      const b = speciesRows.filter(row => row.water && row.water !== water);
      if (!supported(a, b)) continue;
      for (const bait of sorted(a.flatMap(row => row.baits))) {
        const knownA = a.filter(row => row.baits.length), knownB = b.filter(row => row.baits.length);
        const nA = knownA.filter(row => row.baits.includes(bait)), nB = knownB.filter(row => row.baits.includes(bait));
        if (!supported(knownA, knownB) || nA.length < 4 || nA.length / knownA.length - nB.length / knownB.length < 0.3) continue;
        add({ family: "species-water-bait", key: [speciesKey, water, bait], title: `${species}: nástrahu ověř také mimo ${a[0].waterLabel}`,
          observation: `Nástraha ${nA[0].baitLabels[bait]} je na vodě ${a[0].waterLabel} u ${nA.length} z ${knownA.length} úlovků se zapsanou nástrahou, na ostatních známých vodách u ${nB.length} z ${knownB.length}.`,
          numbers: { baitAtWater: nA.length, knownAtWater: knownA.length, baitElsewhere: nB.length, knownElsewhere: knownB.length },
          interpretation: "Nástraha může být svázaná s tím, kam chodíš lovit. Záznamy zatím nedokazují její samostatný účinek.",
          experiment: "Na stejné vodě a srovnatelnou dobu porovnej tuto nástrahu s druhou. Neměň zároveň metodu a zapisuj i úseky bez ryby.", evidence: [...knownA, ...knownB], strength: 13 });
      }
    }
    const lengths = speciesRows.filter(row => row.length !== null).sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    const compareLengths = (a, b, family, key, title, labels, experiment, extraWarning = "") => {
      if (!supported(a, b) || Math.abs(mean(a) - mean(b)) < 5) return;
      const averageA = round(mean(a)), averageB = round(mean(b));
      add({ family, key: [speciesKey, key], title,
        observation: `${labels[0]}: průměrná zapsaná délka ${number(averageA)} cm (${a.length} ryb); ${labels[1]}: ${number(averageB)} cm (${b.length} ryb). Porovnání zahrnuje jen stejný druh.`,
        numbers: { countA: a.length, countB: b.length, meanLengthA: averageA, meanLengthB: averageB, differenceCm: round(averageA - averageB) },
        interpretation: "Rozdíl je podnět k ověření, ne důkaz lepší techniky či podmínek. Změna místa, velikosti nástrahy nebo selektivní zapisování mohou výsledek vysvětlit.",
        experiment, uncertainty: `Malé soubory a zapsané délky nepopisují všechny ulovené ryby. ${extraWarning}`.trim(), evidence: [...a, ...b], strength: 15 });
    };
    for (const [method, a] of groups(lengths.filter(row => row.method), row => row.method)) {
      const b = lengths.filter(row => row.method && row.method !== method);
      compareLengths(a, b, "species-method-length", method, `${species}: rozdíl v délce stojí za ověření`,
        [a[0].methodLabel, "Ostatní zapsané metody"], "Porovnej obě metody na stejné vodě v podobném čase. Změř každý úlovek stejného druhu a zapiš i lov bez ryby.");
      // Weather comparisons hold species and method constant, use actual
      // recorded values only, and never substitute air/water temperatures.
      const fields = [
        ["airTempC", "teploty vzduchu", value => value < 10 ? "pod 10 °C" : value < 20 ? "10 až 20 °C" : "20 °C a více"],
        ["pressureHpa", "tlaku", value => value < 1010 ? "pod 1010 hPa" : value < 1020 ? "1010 až 1020 hPa" : "1020 hPa a více"],
        ["windKmh", "větru", value => value < 10 ? "pod 10 km/h" : value < 25 ? "10 až 25 km/h" : "25 km/h a více"],
      ];
      for (const [field, label, bin] of fields) {
        const measured = a.filter(row => row.conditions[field] !== null);
        for (const [range, weatherA] of groups(measured, row => bin(row.conditions[field]))) {
          const weatherB = measured.filter(row => bin(row.conditions[field]) !== range);
          compareLengths(weatherA, weatherB, "species-method-weather-length", [method, field, range], `${species}: jiná délka při stejné metodě a jiné hodnotě ${label}`,
            [`${a[0].methodLabel}, ${range}`, "Stejná metoda, ostatní zapsané hodnoty"],
            "Při dalších vycházkách stejnou metodou na stejné vodě změř všechny ryby tohoto druhu a uchovej skutečné počasí i dobu lovu.",
            "Počasí může být ručně zapsané nebo odvozené z meteorologického modelu, nikoli přímo naměřené na místě.");
        }
      }
    }
    if (lengths.length >= 8) {
      const split = Math.floor(lengths.length / 2), older = lengths.slice(0, split), newer = lengths.slice(split);
      compareLengths(newer, older, "species-length-change", "chronological-halves", `${species}: v novější části deníku se změnily délky`,
        ["Novější polovina měřených záznamů", "Starší polovina měřených záznamů"],
        "Při další vycházce zachovej stejnou metodu a měř všechny ryby tohoto druhu. Ověř, zda rozdíl trvá i na stejné vodě.");
    }
    if (lengths.length >= 3 && independentDays(lengths) >= 3) {
      let previousBest = lengths[0], latestImprovement = null;
      for (const row of lengths.slice(1)) if (row.length > previousBest.length) { latestImprovement = { before: previousBest, after: row }; previousBest = row; }
      if (latestImprovement && latestImprovement.after.length - latestImprovement.before.length >= 3) {
        const { before, after } = latestImprovement;
        add({ family: "species-personal-record", key: [speciesKey, after.id], title: `${species}: poslední posun zapsaného rekordu`,
          observation: `Nejdelší zapsaná ryba tohoto druhu se posunula z ${number(before.length)} na ${number(after.length)} cm, tedy o ${number(after.length - before.length)} cm. Podkladem je ${lengths.length} záznamů s délkou.`,
          numbers: { previousBestCm: before.length, newBestCm: after.length, increaseCm: round(after.length - before.length), measuredCount: lengths.length },
          interpretation: "Jde o skutečný posun v tvých zapsaných délkách. Sám o sobě nedokazuje dlouhodobé zlepšování ani účinek poslední nástrahy.",
          experiment: "Otevři oba rekordní záznamy a při příští srovnatelné vycházce ověř jeden rozdíl v metodě nebo místě; ostatní podmínky pokud možno zachovej.",
          uncertainty: "Rekord platí jen pro zapsané délky; chybějící měření a změny vod mohou srovnání ovlivnit.", evidence: lengths, strength: 8 });
      }
    }
    for (const [periodField, family, periodLabel] of [["month", "species-month-method-change", "měsíci"], ["season", "species-season-method-change", "sezonami"]]) {
    const periods = groups(speciesRows.filter(row => row.method), row => row[periodField]).filter(([, entries]) => entries.length >= 4 && independentDays(entries) >= 3);
    if (periods.length >= 2) {
      const [oldMonth, oldRows] = periods.at(-2), [newMonth, newRows] = periods.at(-1);
      for (const [method, matches] of groups(newRows, row => row.method)) {
        const oldMatches = oldRows.filter(row => row.method === method), difference = matches.length / newRows.length - oldMatches.length / oldRows.length;
        if (matches.length < 3 || difference < 0.3) continue;
        add({ family, key: [speciesKey, method, newMonth], title: `${species}: mezi ${periodLabel} se změnila skladba metod`,
          observation: `${matches[0].methodLabel} je v období ${newMonth} u ${matches.length} z ${newRows.length} záznamů se známou metodou, v ${oldMonth} u ${oldMatches.length} z ${oldRows.length}.`,
          numbers: { currentCount: matches.length, currentTotal: newRows.length, previousCount: oldMatches.length, previousTotal: oldRows.length, shareDifferencePoints: round(difference * 100) },
          interpretation: "Změna může odrážet tvé rozhodování, sezónu nebo jiné vody. Nejde o důkaz, že se účinnost metody změnila.",
          experiment: "V příštím měsíci porovnej obě metody na stejné vodě se zapsanou dobou lovu. Odděl tak změnu svého výběru od změny zaznamenaných výsledků.", evidence: [...oldRows, ...newRows], strength: 10 });
      }
    }
    }
  }
  // Effort denominator includes ended, known-duration trips WITHOUT catches.
  // Overlapping trip intervals are excluded to avoid double-counted hours.
  const ended = cleanTrips.filter(trip => Number.isFinite(trip.start) && Number.isFinite(trip.end) && trip.end > trip.start
    && trip.end <= nowMs && trip.end - trip.start <= 14 * DAY && trip.method);
  const nonoverlap = ended.filter(trip => !ended.some(other => other.id !== trip.id && other.start < trip.end && trip.start < other.end));
  for (const [method, a] of groups(nonoverlap, trip => trip.method)) {
    const b = nonoverlap.filter(trip => trip.method !== method);
    if (a.length < 3 || b.length < 3) continue;
    const cohort = entries => {
      const ids = new Set(entries.map(trip => trip.id));
      const records = rows.filter(row => ids.has(row.tripId) && entries.some(trip => trip.id === row.tripId && row.timestamp >= trip.start && row.timestamp <= trip.end));
      return { hours: entries.reduce((sum, trip) => sum + (trip.end - trip.start) / 3_600_000, 0), records };
    };
    const first = cohort(a), second = cohort(b);
    if (first.hours < 3 || second.hours < 3 || first.records.length + second.records.length < 6) continue;
    const rateA = first.records.length / first.hours, rateB = second.records.length / second.hours;
    if (Math.abs(rateA - rateB) < 0.3) continue;
    const label = rows.find(row => row.method === method)?.methodLabel || "Vybraná metoda";
    add({ family: "recorded-trip-effort", key: method, title: "Rozdíl přetrvává i po započtení délky zapsaných vycházek",
      observation: `${label}: ${first.records.length} úlovků za ${number(first.hours)} h na ${a.length} ukončených vycházkách (${number(rateA)} úlovku/h). Ostatní metody: ${second.records.length} za ${number(second.hours)} h na ${b.length} vycházkách (${number(rateB)} úlovku/h). Zahrnuty jsou i zapsané vycházky bez ryby.`,
      numbers: { countA: first.records.length, countB: second.records.length, tripsA: a.length, tripsB: b.length, hoursA: round(first.hours), hoursB: round(second.hours), recordedRateA: round(rateA), recordedRateB: round(rateB) },
      interpretation: "Toto je poměr zapsaných úlovků k zapsané délce vycházek, nikoli pravděpodobnost úspěchu. Rozdíl může souviset také s druhem ryb, vodou a sezonou.",
      experiment: "Porovnej metody na stejné vodě v podobném období a zapisuj začátek, konec, přestávky i nulové vycházky.",
      uncertainty: "Délka vycházky může zahrnovat přestávky. Nezapsané vycházky neznáme; překrývající se nebo neukončené intervaly jsou vynechány.", evidence: [...first.records, ...second.records], strength: 18 });
  }
  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const diverse = [], families = new Map();
  for (const candidate of candidates) {
    if ((families.get(candidate.family) ?? 0) >= 2) continue;
    diverse.push(candidate); families.set(candidate.family, (families.get(candidate.family) ?? 0) + 1);
    if (diverse.length >= 12) break;
  }
  if (!diverse.length) {
    const latest = rows[0], measured = rows.filter(row => row.length !== null);
    const reference = rows.find(row => row.speciesKey && row.methodKey) ?? rows.find(row => row.speciesKey) ?? latest;
    const species = reference?.speciesKey ? `při lovu druhu „${reference.species}“` : "při lovu stejného druhu";
    add({ family: "specific-next-step", key: [latest?.id ?? "empty", rows.length], title: latest ? "Z další vycházky udělej malé vlastní srovnání" : "První záznam může založit užitečné srovnání",
      observation: latest ? `V dostupném deníku máš ${personalRecordCountLabel(rows.length)}, z toho ${measured.length} s délkou. V porovnávaných kombinacích zatím nevychází dostatečně podložený rozdíl z více dnů.` : "Deník zatím neobsahuje platný datovaný úlovek; osobní vzorec z něj nelze odvodit.",
      numbers: { records: rows.length, measuredLengths: measured.length },
      interpretation: "Jednotlivé úlovky popisují konkrétní zážitek, nikoli spolehlivý vzorec.",
      experiment: latest ? `Na další vycházce ${species} porovnej dvě stejně dlouhé části${reference.methodLabel ? ` s metodou „${reference.methodLabel}“` : " se stejnou metodou"} na stejné vodě. Zapiš začátek a konec obou částí, i když bude jedna bez ryby.` : "Na první vycházce zaznamenej začátek a konec lovu i při nulovém úlovku. To později umožní odlišit počet ryb od času stráveného lovem.",
      uncertainty: "Pro srovnání délek potřebujeme alespoň čtyři ryby v každé skupině a alespoň tři různé dny na obou stranách.", evidence: latest ? [latest, ...(reference !== latest ? [reference] : [])] : [], strength: 0 });
    diverse.push(candidates.at(-1));
  }
  const providerSummary = { version: HOME_ANALYSIS_VERSION, recordCount: rows.length, candidates: diverse.filter(item => item.isInsight).slice(0, 3)
    .map((item, index) => ({ candidate: index + 1, family: item.family, numbers: item.numbers, evidenceCount: item.evidenceIds.length,
      limitation: item.family === "recorded-trip-effort" ? "Recorded trip time may include breaks; no catch probability or causal conclusion." : "Recorded catches only; no complete effort denominator or causal conclusion." })) };
  return { version: HOME_ANALYSIS_VERSION, fingerprint, candidates: diverse, strongest: diverse[0], recordCount: rows.length,
    evidenceIds: rows.map(row => row.id), providerSummary, truncated: Array.isArray(catches) && catches.length > 500 };
}

export function selectPersonalInsight(candidates, seenIds = [], currentId = null) {
  if (!candidates?.length) return null;
  if (currentId) return candidates.find(item => item.id === currentId) ?? candidates[0];
  const seen = new Set(seenIds);
  return candidates.find(item => !seen.has(item.id)) ?? candidates[0];
}
