import { normalizeText } from "../../../shared/utils/helpers.js";
import { isMeasuredCatchWeight } from "./catchWeight.js";
import { compareCatchSize, hasCatchLength, selectBestCatch } from "./catchSize.js";
import { isCatchDateEligibleForProgression } from "./catchVerification.js";

const SEASONS = [
  { key: "winter", months: [11, 0, 1] },
  { key: "spring", months: [2, 3, 4] },
  { key: "summer", months: [5, 6, 7] },
  { key: "autumn", months: [8, 9, 10] },
];

function seasonKey(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  const season = SEASONS.find(({ months }) => months.includes(date.getMonth()));
  const year = date.getMonth() === 11 ? date.getFullYear() + 1 : date.getFullYear();
  return `${year}-${season.key}`;
}

export function getCatchRecognition(catchRecord, catches, now = new Date()) {
  if (!isCatchDateEligibleForProgression(catchRecord, now)) {
    return { personalBest: false, personalBestDelta: null, speciesRecord: false, seasonRecord: false, newLocation: false };
  }
  const others = catches.filter((record) => record.id !== catchRecord.id && isCatchDateEligibleForProgression(record, now));
  const previousPersonalBest = selectBestCatch(others);
  const speciesMatches = others.filter((record) => catchRecord.speciesKey
    ? record.speciesKey === catchRecord.speciesKey
    : normalizeText(record.species ?? "") === normalizeText(catchRecord.species ?? ""));
  const previousSpeciesBest = selectBestCatch(speciesMatches);
  const currentSeason = seasonKey(catchRecord.caughtAt);
  const previousSeasonBest = selectBestCatch(others
    .filter((record) => seasonKey(record.caughtAt) === currentSeason)
  );
  const normalizedLocation = normalizeText(catchRecord.locationName ?? "");

  return {
    personalBest: (hasCatchLength(catchRecord) || isMeasuredCatchWeight(catchRecord))
      && (!previousPersonalBest || compareCatchSize(catchRecord, previousPersonalBest) >= 0),
    personalBestDelta: previousPersonalBest && hasCatchLength(catchRecord) && hasCatchLength(previousPersonalBest)
      ? catchRecord.lengthCm - previousPersonalBest.lengthCm
      : previousPersonalBest && isMeasuredCatchWeight(catchRecord) && isMeasuredCatchWeight(previousPersonalBest)
        ? catchRecord.weightKg - previousPersonalBest.weightKg : null,
    personalBestUnit: !previousPersonalBest || (!hasCatchLength(catchRecord) && !isMeasuredCatchWeight(catchRecord))
      ? null : hasCatchLength(catchRecord) ? "cm" : "kg",
    speciesRecord: (hasCatchLength(catchRecord) || isMeasuredCatchWeight(catchRecord))
      && (!previousSpeciesBest || compareCatchSize(catchRecord, previousSpeciesBest) >= 0),
    seasonRecord: currentSeason !== null && (hasCatchLength(catchRecord) || isMeasuredCatchWeight(catchRecord))
      && (!previousSeasonBest || compareCatchSize(catchRecord, previousSeasonBest) >= 0),
    newLocation: Boolean(normalizedLocation)
      && !others.some((record) => normalizeText(record.locationName ?? "") === normalizedLocation),
  };
}

export function isNewLengthRecord(catchRecord, catches, now = new Date()) {
  if (!Number.isFinite(catchRecord?.lengthCm) || !isCatchDateEligibleForProgression(catchRecord, now)) return false;
  const previousLengths = (catches || [])
    .filter((record) => record.id !== catchRecord.id
      && isCatchDateEligibleForProgression(record, now)
      && (catchRecord.speciesKey ? record.speciesKey === catchRecord.speciesKey : record.species === catchRecord.species)
      && Number.isFinite(record.lengthCm))
    .map((record) => record.lengthCm);
  return previousLengths.length === 0 || catchRecord.lengthCm > Math.max(...previousLengths);
}
