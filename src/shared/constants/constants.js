import ledgering from "../../assets/method-icons/ledgering.png";
import feeder from "../../assets/method-icons/feeder.png";
import float from "../../assets/method-icons/float.png";
import spinning from "../../assets/method-icons/spinning.png";
import flyFishing from "../../assets/method-icons/flyFishing.png";
import winterFishing from "../../assets/method-icons/winterFishing.png";
export { MOON_PHASE_EMOJI } from "./moonPhaseEmoji.js";
export { DEFAULT_SPECIES, SPECIES_CATEGORIES } from "./speciesCatalog.js";
export const DEFAULT_METHODS = [
  {
    key: "ledgering",
    label: "Položená",
    icon: ledgering,
    isCustom: false,
  },
  {
    key: "feeder",
    label: "Feeder",
    icon: feeder,
    isCustom: false,
  },
  {
    key: "float",
    label: "Plavaná",
    icon: float,
    isCustom: false,
  },
  {
    key: "spinning",
    label: "Přívlač",
    icon: spinning,
    isCustom: false,
  },
  {
    key: "flyFishing",
    label: "Muškaření",
    icon: flyFishing,
    isCustom: false,
  },
  {
    key: "winterFishing",
    label: "Dírky",
    icon: winterFishing,
    isCustom: false,
  },
];
export const DEFAULT_BAITS = [
  { key: "corn", label: "Kukuřice", isCustom: false },
  { key: "boilies", label: "Boilies", isCustom: false },
  { key: "worms", label: "Červi", isCustom: false },
  { key: "pellets", label: "Pelety", isCustom: false },
  { key: "dough", label: "Těsto", isCustom: false },
  { key: "liveFish", label: "Živá rybka", isCustom: false },
  { key: "maggots", label: "Oparák", isCustom: false },
  { key: "other", label: "Jiná", isCustom: false },
];
