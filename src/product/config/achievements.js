import { PRODUCT_LIMITS } from "./limits.js";

// Product data only. Keep IDs stable: they are embedded in progression ledger reason keys.
export const ACHIEVEMENT_DEFINITIONS = Object.freeze([
  { id: "first-catch", ruleKey: "catch-count", name: "První úlovek", description: "Zaznamenej první úlovek.", category: "Úlovky", xp: 30, goal: 1 },
  { id: "first-kilo", ruleKey: "weight-at-least", name: "První kilo", description: "Zaznamenej úlovek o hmotnosti alespoň 1 kg.", category: "Úlovky", xp: 30, goal: 1, unit: "kg", threshold: 1 },
  { id: "trophy-catch", ruleKey: "weight-at-least", name: "Trofejní úlovek", description: "Zaznamenej úlovek o hmotnosti alespoň 10 kg.", category: "Úlovky", xp: 100, goal: 10, unit: "kg", threshold: 10 },
  { id: "ten-catches", ruleKey: "catch-count", name: "Prvních deset", description: "Zaznamenej deset úlovků.", category: "Úlovky", xp: 50, goal: 10 },
  { id: "fifty-catches", ruleKey: "catch-count", name: "Padesát úlovků", description: "Zaznamenej 50 úlovků.", category: "Úlovky", xp: 100, goal: 50 },
  { id: "five-hundred-catches", ruleKey: "catch-count", name: "Pět set úlovků", description: "Zaznamenej 500 úlovků.", category: "Úlovky", xp: 200, goal: 500 },
  { id: "five-species", ruleKey: "species-count", name: "Lovec druhů I", description: "Zaznamenej pět různých druhů.", category: "Druhy", xp: 50, goal: 5 },
  { id: "ten-species", ruleKey: "species-count", name: "Lovec druhů II", description: "Zaznamenej deset různých druhů.", category: "Druhy", xp: 75, goal: 10 },
  { id: "twenty-five-species", ruleKey: "species-count", name: "Lovec druhů III", description: "Zaznamenej 25 různých druhů.", category: "Druhy", xp: 150, goal: 25 },
  { id: "fifty-species", ruleKey: "species-count", name: "Rybí encyklopedie", description: "Zaznamenej 50 různých druhů.", category: "Druhy", xp: 200, goal: 50 },
  { id: "five-waters", ruleKey: "water-count", name: "Objevitel vod I", description: "Zaznamenej úlovky z pěti různých revírů.", category: "Explorace", xp: 50, goal: 5 },
  { id: "ten-waters", ruleKey: "water-count", name: "Objevitel vod II", description: "Zaznamenej úlovky z deseti různých revírů.", category: "Explorace", xp: 100, goal: 10 },
  { id: "twenty-five-waters", ruleKey: "water-count", name: "Objevitel vod III", description: "Zaznamenej úlovky z 25 různých revírů.", category: "Explorace", xp: 200, goal: 25 },
  { id: "summer-catch", ruleKey: "month-catch", months: [5, 6, 7], name: "Letní rybář", description: "Zaznamenej úlovek v létě.", category: "Sezóny", xp: 30, goal: 1 },
  { id: "winter-catch", ruleKey: "month-catch", months: [11, 0, 1], name: "Zimní rybář", description: "Zaznamenej úlovek v zimě.", category: "Sezóny", xp: 30, goal: 1 },
  { id: "four-week-streak", ruleKey: "streak", name: "Čtyři týdny u vody", description: "Udrž týdenní sérii po dobu čtyř týdnů.", category: "Série", xp: 75, goal: 4 },
  { id: "twelve-week-streak", ruleKey: "streak", name: "Sezóna v rytmu", description: "Udrž týdenní sérii po dobu 12 týdnů.", category: "Série", xp: 150, goal: 12 },
  { id: "fifty-two-week-streak", ruleKey: "streak", name: "Rok aktivního rybaření", description: "Udrž týdenní sérii po dobu 52 týdnů.", category: "Série", xp: 200, goal: 52 },
  { id: "night-catch", ruleKey: "night-catch", name: "Noční vlk", description: "Zaznamenej úlovek mezi 22:00 a 04:00.", category: "Skryté", xp: 50, hidden: true },
  { id: "marathon-trip", ruleKey: "trip-duration", name: "Maratonec", description: "Dokonči vycházku trvající alespoň osm hodin.", category: "Skryté", xp: 75, hidden: true, durationHours: PRODUCT_LIMITS.marathonTripHours },
].map((item) => Object.freeze({ ...item, ...(item.months ? { months: Object.freeze([...item.months]) } : {}) })));
