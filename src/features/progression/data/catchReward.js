import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";
import { getBiggestCatch } from "../../home/utils/profileStats.js";
import { normalizeText } from "../../../shared/utils/helpers.js";

export function getCatchRecordStatus(record, catches = []) {
  const previousCatches = catches.filter((item) => item?.id !== record?.id);
  const speciesKey = record?.speciesKey || normalizeText(record?.species ?? "");
  const previousSpeciesCatches = speciesKey
    ? previousCatches.filter((item) => (item?.speciesKey || normalizeText(item?.species ?? "")) === speciesKey)
    : [];
  const previousPersonalRecord = getBiggestCatch(previousCatches);
  const previousSpeciesRecord = getBiggestCatch(previousSpeciesCatches);
  const measured = isMeasuredCatchWeight(record);
  return {
    personalRecord: measured && (!previousPersonalRecord || record.weightKg > previousPersonalRecord.weightKg),
    speciesRecord: measured && (!previousSpeciesRecord || record.weightKg > previousSpeciesRecord.weightKg),
  };
}

