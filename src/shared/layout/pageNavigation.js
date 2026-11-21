import { matchPath } from "react-router-dom";
import { FEATURES } from "../config/featureFlags.js";

// Order specific paths before paths with parameters.
const parents = [
  ["/fish-activity", "/"], ["/add", "/journal"],
  ["/catch/:id/edit", "/catch/:id"], ["/catch/:id/reward", "/catch/:id"],
  ["/catch/:id/share", "/catch/:id", "publicSharing"], ["/catch/:id", "/journal"],
  ["/journal/calendar", "/journal"], ["/journal/map", "/journal"],
  ["/gallery", "/journal"], ["/stats", "/journal"], ["/insights", "/journal"],
  ["/season-story", "/journal"], ["/year-summary", "/journal"], ["/hotspots", "/journal/map"],
  ["/trips", "/journal"], ["/trips/new", "/trips"], ["/trips/:id/edit", "/trips/:id"], ["/trips/:id", "/trips"],
  ["/waters", "/journal"], ["/waters/catalogue", "/waters"], ["/waters/catalogue/:catalogueId", "/waters/catalogue"],
  ["/waters/new", "/waters"], ["/waters/:waterId/chat", "/waters/:waterId", "waterChat"],
  ["/waters/:waterId/edit", "/waters/:waterId"], ["/waters/:waterId", "/waters"],
  ["/album", "/profile"], ["/species/:speciesKey/mastery", "/species/:speciesKey"], ["/species/:speciesKey", "/album"],
  ["/levels", "/profile"], ["/achievements", "/profile"], ["/challenges", "/profile"], ["/streak", "/profile"],
  ["/profile/social", "/profile", "publicProfiles"], ["/settings", "/profile"], ["/privacy", "/settings"],
  ["/privacy-policy", "/login"], ["/terms", "/login"], ["/admin/*", "/profile"], ["/supporter", "/profile", "supporter"],
  ["/friends", "/community", "friends"], ["/u/:identity", "/community", "publicProfiles"],
  ["/community/post/:postId", "/community", "community"], ["/community/catch/:catchId", "/community", "community"],
  ["/community/:postId/report", "/community", "community"], ["/nearby", "/community", "nearby"],
  ["/messages/:targetUid", "/messages", "directMessages"], ["/messages", "/friends", "directMessages"],
  ["/crew", "/community", "crew"], ["/notifications", "/profile"],
];

const publicEntries = new Set(["/", "/journal", "/profile", "/login", "/onboarding", "/map"]);
const normalizedPath = path => path.toLowerCase().replace(/\/+$/, "") || "/";

function matchPage(pathname) {
  for (const [pattern, fallback, feature] of parents) {
    const match = matchPath(pattern, pathname);
    if (match) return { fallback, feature, params: match.params };
  }
  return null;
}

export function isKnownPage(pathname, features = FEATURES) {
  const path = normalizedPath(pathname);
  if (publicEntries.has(path)) return true;
  if (path === "/community") return features.community === true;
  if (path === "/community/find") return features.community === true && features.userDiscovery === true;
  const page = matchPage(pathname);
  return Boolean(page && (!page.feature || features[page.feature] === true));
}

export function pageBackFallback(pathname, features = FEATURES) {
  const page = matchPage(pathname);
  if (!page || (page.feature && !features[page.feature])) return null;
  const fallback = page.fallback.replace(/:([A-Za-z]+)/g, (_, name) => encodeURIComponent(page.params[name]));
  return isKnownPage(fallback, features) ? fallback : "/profile";
}

export function rememberPage(entries, current, location, action) {
  if (current?.key === location.key) return current;
  if (action !== "POP" || !entries.has(location.key)) {
    const previous = action === "PUSH" ? current?.key : action === "REPLACE" ? current?.previous : undefined;
    entries.set(location.key, { key: location.key, pathname: location.pathname, hash: location.hash, previous });
    if (entries.size > 80) entries.delete(entries.keys().next().value);
  }
  return entries.get(location.key);
}

export function internalBackSteps(entries, current, { allowSamePage = false, features = FEATURES } = {}) {
  const path = normalizedPath(current.pathname);
  let key = current.previous;
  for (let steps = 1; key && steps <= entries.size; steps++) {
    const previous = entries.get(key);
    if (!previous || !isKnownPage(previous.pathname, features)) return 0;
    if (normalizedPath(previous.pathname) !== path || (allowSamePage && previous.hash !== current.hash)) return steps;
    key = previous.previous;
  }
  return 0;
}
