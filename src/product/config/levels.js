// Rank and mastery titles/thresholds are product data. Existing level values are stable.
export const MAX_LEVEL = 100;
export const LEVEL_XP_BASE = 50;

export const RANKS = Object.freeze([
  { minLevel: 1, maxLevel: 5, name: "Nováček", title: "Rybářský nadšenec" },
  { minLevel: 6, maxLevel: 15, name: "Rybář", title: "U vody" },
  { minLevel: 16, maxLevel: 29, name: "Zkušený rybář", title: "Znalec vod" },
  { minLevel: 30, maxLevel: 49, name: "Senior rybář", title: "Mistr prutu" },
  { minLevel: 50, maxLevel: 74, name: "Expert", title: "Vodní vlk" },
  { minLevel: 75, maxLevel: 99, name: "Legenda", title: "Kapitán vod" },
  { minLevel: 100, maxLevel: 100, name: "Prestige I+", title: "Rybářská legenda" },
]);

export const MASTERY_LEVELS = Object.freeze([
  { level: 1, catches: 1, xp: 50, title: "První úlovek" },
  { level: 2, catches: 5, xp: 30, title: "Znalec druhu" },
  { level: 3, catches: 20, xp: 50, title: "Zkušený lovec" },
  { level: 4, catches: 50, xp: 100, title: "Mistr druhu" },
  { level: 5, catches: 100, xp: 200, title: "Legenda druhu" },
]);
