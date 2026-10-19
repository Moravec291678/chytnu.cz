export const FEATURES = Object.freeze({
  seasonalChallenges: false,
  weeklyChallenges: false,
  streaks: false,
  rarity: false,
  speciesMastery: false,
  waters: false,
  community: false,
  friends: false,
  nearby: false,
  crew: false,
  notifications: false,
  supporter: false,
  aiInsights: false,
  dailyTips: false,
  seasonStory: false,
  publicSharing: false,
});

export function isFeatureEnabled(name) {
  return FEATURES[name] === true;
}
