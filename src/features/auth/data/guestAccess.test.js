import test from "node:test";
import assert from "node:assert/strict";
import { clearGuestAccess, confirmGuestAccess, isGuestAccessConfirmed } from "./guestAccess.js";

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test("guest access requires explicit confirmation and can be cleared", () => {
  const localStorage = storage();
  assert.equal(isGuestAccessConfirmed(localStorage), false);
  confirmGuestAccess(localStorage);
  assert.equal(isGuestAccessConfirmed(localStorage), true);
  clearGuestAccess(localStorage);
  assert.equal(isGuestAccessConfirmed(localStorage), false);
});

test("guest access marker never contains a password", () => {
  const localStorage = storage();
  confirmGuestAccess(localStorage);
  assert.equal([...Object.values(localStorage)].some((value) => String(value).includes("password")), false);
});
