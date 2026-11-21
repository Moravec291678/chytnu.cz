import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
import { resolveApiUrl } from "../../../platform/api.js";
import { deleteLocalScopeData } from "./localDataDeletion.js";
import { getPhotoCloudProvider } from "../../catches/data/photoCloudProvider.js";

export async function deleteCloudAccount(scope, password, {
  reauthenticate = firebaseAuth.reauthenticateForAccountDeletion,
  idToken = firebaseAuth.currentIdToken,
  request = globalThis.fetch,
  currentUserId = firebaseAuth.currentUserId,
  clearLocal = deleteLocalScopeData,
  cancelNativeUploads = ({ ownerId }) => getPhotoCloudProvider().cancelUploadsForOwner?.({ ownerId }),
  signOut = firebaseAuth.signOutIfCurrent,
} = {}) {
  if (!scope?.ownerId || scope.status !== "ready") throw new Error("Účet není připravený ke smazání.");
  const checkOwner = () => {
    if (currentUserId() !== scope.ownerId) throw new Error("Přihlášený účet se změnil. Žádost nebyla odeslána.");
  };
  checkOwner();
  const completed = await reauthenticate(password, scope.ownerId);
  if (!completed) return { redirected: true };
  checkOwner();
  const token = await idToken(true);
  if (!token) throw new Error("Ověření účtu se nepodařilo. Zkus to znovu.");
  let localCleanupError = false;
  try { await cancelNativeUploads({ ownerId: scope.ownerId }); } catch { localCleanupError = true; }
  checkOwner();
  const response = await request(resolveApiUrl("/api/account/delete"), {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedUid: scope.ownerId }), cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 403) throw new Error("Pro smazání účtu se znovu přihlas a zkus to znovu.");
    throw new Error("Mazání účtu se nepodařilo zahájit. Zkus to znovu.");
  }
  try { await clearLocal(scope); } catch { localCleanupError = true; }
  try { if (currentUserId() === scope.ownerId) await signOut(scope.ownerId); } catch { /* Server already revoked this account. */ }
  return { redirected: false, localCleanupError };
}
