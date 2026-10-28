export const NOTIFICATION_TYPES = Object.freeze(["sync_problem", "achievement", "challenge", "active_trip", "app_update"]);

export const NOTIFICATION_TYPE_PRESENTATION = Object.freeze({
  sync_problem: Object.freeze({ label: "Problém se synchronizací", icon: "↻" }),
  achievement: Object.freeze({ label: "Úspěch", icon: "★" }),
  challenge: Object.freeze({ label: "Výzva", icon: "✓" }),
  active_trip: Object.freeze({ label: "Aktivní vycházka", icon: "⌖" }),
  app_update: Object.freeze({ label: "Aktualizace aplikace", icon: "i" }),
});

export const NOTIFICATION_COPY = Object.freeze({
  syncProblem: Object.freeze({
    title: "Synchronizace potřebuje pozornost",
    body: "Některé záznamy se nepodařilo synchronizovat. Místní data zůstávají uložená; zkus synchronizaci zopakovat.",
    deepLink: "/profile",
  }),
  achievement: Object.freeze({
    title: "Nový úspěch",
    bodyWithXp: "Odemkl(a) jsi nový úspěch a získal(a) {xp} XP.",
    bodyWithoutXp: "Odemkl(a) jsi nový úspěch. Podívej se na svůj postup.",
    deepLink: "/achievements",
  }),
  challenge: Object.freeze({
    title: "Výzva dokončena",
    bodyWithXp: "Dokončil(a) jsi výzvu a získal(a) {xp} XP.",
    bodyWithoutXp: "Dokončil(a) jsi svou výzvu.",
    deepLink: "/challenges",
  }),
});

export const NOTIFICATION_PREFERENCES = Object.freeze([
  { key: "morningFishActivity", title: "Ranní aktivita ryb", description: "Ranní přehled orientačních podmínek pro rybaření.", defaultEnabled: true },
  { key: "tomorrowGreatConditions", title: "Skvělé podmínky zítra", description: "Preference pro upozornění na vhodné podmínky.", defaultEnabled: false },
  { key: "friendActivity", title: "Aktivita přátel", description: "Preference pro nové úlovky a aktivitu přátel.", defaultEnabled: false },
  { key: "streaksAndChallenges", title: "Série a výzvy", description: "Preference pro připomenutí série a výzev.", defaultEnabled: true },
  { key: "friendLegendaryCatch", title: "Výjimečný úlovek přítele", description: "Preference pro výjimečné úlovky přátel.", defaultEnabled: false },
]);
