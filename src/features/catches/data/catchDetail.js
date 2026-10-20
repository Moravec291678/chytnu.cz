import { normalizeText } from "../../../shared/utils/helpers.js";
import { isMeasuredCatchWeight } from "./catchWeight.js";

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

export function getCatchRecognition(catchRecord, catches) {
  const others = catches.filter((record) => record.id !== catchRecord.id);
  const measuredOthers = others.filter(isMeasuredCatchWeight);
  const previousPersonalBest = measuredOthers.reduce(
    (best, record) => Math.max(best, record.weightKg),
    Number.NEGATIVE_INFINITY,
  );
  const speciesMatches = others.filter((record) => catchRecord.speciesKey
    ? record.speciesKey === catchRecord.speciesKey
    : normalizeText(record.species ?? "") === normalizeText(catchRecord.species ?? ""));
  const previousSpeciesBest = speciesMatches.reduce(
    (best, record) => isMeasuredCatchWeight(record) ? Math.max(best, record.weightKg) : best,
    Number.NEGATIVE_INFINITY,
  );
  const currentSeason = seasonKey(catchRecord.caughtAt);
  const previousSeasonBest = others
    .filter((record) => seasonKey(record.caughtAt) === currentSeason)
    .reduce(
      (best, record) => isMeasuredCatchWeight(record) ? Math.max(best, record.weightKg) : best,
      Number.NEGATIVE_INFINITY,
    );
  const normalizedLocation = normalizeText(catchRecord.locationName ?? "");

  return {
    personalBest: isMeasuredCatchWeight(catchRecord)
      && catchRecord.weightKg >= previousPersonalBest,
    personalBestDelta: Number.isFinite(previousPersonalBest) && isMeasuredCatchWeight(catchRecord)
      ? catchRecord.weightKg - previousPersonalBest
      : null,
    speciesRecord: isMeasuredCatchWeight(catchRecord)
      && catchRecord.weightKg >= previousSpeciesBest,
    seasonRecord: currentSeason !== null && isMeasuredCatchWeight(catchRecord)
      && catchRecord.weightKg >= previousSeasonBest,
    newLocation: Boolean(normalizedLocation)
      && !others.some((record) => normalizeText(record.locationName ?? "") === normalizedLocation),
  };
}

export function isNewLengthRecord(catchRecord, catches) {
  if (!Number.isFinite(catchRecord?.lengthCm)) return false;
  const previousLengths = (catches || [])
    .filter((record) => record.id !== catchRecord.id
      && (catchRecord.speciesKey ? record.speciesKey === catchRecord.speciesKey : record.species === catchRecord.species)
      && Number.isFinite(record.lengthCm))
    .map((record) => record.lengthCm);
  return previousLengths.length === 0 || catchRecord.lengthCm > Math.max(...previousLengths);
}
