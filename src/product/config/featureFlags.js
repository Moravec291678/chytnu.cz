export const PRIVATE_JOURNAL_PILOT = (import.meta.env?.VITE_PRIVATE_JOURNAL_PILOT
  ?? globalThis.process?.env?.VITE_PRIVATE_JOURNAL_PILOT) === "1";

export const FEATURES = Object.freeze({
  socialNetwork: false,
  publicProfiles: !PRIVATE_JOURNAL_PILOT,
  userDiscovery: !PRIVATE_JOURNAL_PILOT,
  seasonalChallenges: false,
  weeklyChallenges: false,
  streaks: false,
  rarity: false,
  speciesMastery: false,
  waters: false,
  community: !PRIVATE_JOURNAL_PILOT,
  friends: !PRIVATE_JOURNAL_PILOT,
  nearby: false,
  waterPresence: false,
  waterChat: false,
  directMessages: false,
  waterCommunity: false,
  crew: false,
  notifications: false,
  supporter: false,
  seasonStory: false,
  publicSharing: !PRIVATE_JOURNAL_PILOT,
});
