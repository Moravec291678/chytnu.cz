const sections = {
  home: ["fish-activity"],
  journal: ["journal", "catch", "species", "gallery", "album", "map", "stats", "insights", "season-story", "year-summary", "trips", "hotspots"],
  community: ["community", "u", "friends", "nearby", "crew", "notifications"],
  profile: ["profile", "waters", "settings", "privacy", "privacy-policy", "terms", "achievements", "levels", "challenges", "streak", "supporter", "admin"],
};

export function navigationSection(pathname) {
  const path = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  if (path === "/add") return "capture";
  if (/^\/waters\/[^/]+\/chat$/.test(path)) return "community";
  const firstSegment = path.split("/")[1];
  return Object.keys(sections).find(section => sections[section].includes(firstSegment)) ?? null;
}
