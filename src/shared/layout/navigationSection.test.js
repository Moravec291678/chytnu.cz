import assert from "node:assert/strict";
import test from "node:test";
import { navigationSection } from "./navigationSection.js";

test("menu selection matches nested routes and accepts legacy casing and trailing slashes", () => {
  const routes = {
    "/": "home", "/fish-activity": "home", "/JOURNAL/": "journal", "/journal/map": "journal",
    "/catch/id/edit": "journal", "/trips/id/edit": "journal", "/hotspots": "journal",
    "/insights": "journal", "/species/pike/mastery": "profile", "/album": "profile", "/add/": "capture",
    "/community/post/id": "community", "/u/handle": "community", "/notifications": "community",
    "/waters/id/chat/": "community", "/waters/catalogue/id": "journal", "/waters": "journal",
    "/waters/water-1/edit": "journal", "/map": "journal", "/messages/user-1": "community",
    "/profile/social/": "profile", "/settings": "profile", "/admin/users/id": "profile",
  };
  for (const [path, expected] of Object.entries(routes)) assert.equal(navigationSection(path), expected, path);
  for (const path of ["/journalism", "/addition", "/login"]) assert.equal(navigationSection(path), null, path);
});
