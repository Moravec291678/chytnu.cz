import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
import { resolveApiUrl } from "../../../platform/api.js";
import { deleteLocalScopeData } from "./localDataDeletion.js";

export async function deleteCloudAccount(scope, password, {
  reauthenticate = firebaseAuth.reauthenticateForAccountDeletion,
  idToken = firebaseAuth.currentIdToken,
  request = globalThis.fetch,
  clearLocal = deleteLocalScopeData,
  signOut = firebaseAuth.signOut,
} = {}) {
  if (!scope?.ownerId || scope.status !== "ready") throw new Error("Účet není připravený ke smazání.");
  const completed = await reauthenticate(password);
  if (!completed) return { redirected: true };
  const token = await idToken(true);
  if (!token) throw new Error("Ověření účtu se nepodařilo. Zkus to znovu.");
  const response = await request(resolveApiUrl("/api/account/delete"), {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}", cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 403) throw new Error("Pro smazání účtu se znovu přihlas a zkus to znovu.");
    throw new Error("Mazání účtu se nepodařilo zahájit. Zkus to znovu.");
  }
  let localCleanupError = false;
  try { await clearLocal(scope); } catch { localCleanupError = true; }
  try { await signOut(); } catch { /* Server already revoked this account. */ }
  return { redirected: false, localCleanupError };
}
