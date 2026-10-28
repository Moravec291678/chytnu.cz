import { PRODUCT_LIMITS } from "./limits.js";

export const XP_RULES = Object.freeze({
  catch: Object.freeze({ base: 10, photo: 15, gpsAndWeather: 20 }),
  catchVerificationMultiplier: Object.freeze({ strong: 1, standard: 1, limited: 0.25, unverified: 0 }),
  limitedCatch: Object.freeze({ dailyCap: PRODUCT_LIMITS.limitedCatchDailyXp }),
  newSpecies: 50,
  newWater: 30,
  dailyChallenge: 25,
  weeklyChallenge: 75,
  streakBonus: 50,
  achievement: Object.freeze({ min: 30, max: 200 }),
  communityContribution: 5,
  publicShare: 10,
  legendaryRarity: 200,
});
