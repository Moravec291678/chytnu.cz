import { createProductionAccountDeletionHandler } from "../../src/server/accountDeletionApi.js";
import { withNativeApiCors } from "../../src/server/nativeApiCors.js";

const deleteAccount = withNativeApiCors(async (req, res) => {
  try {
    const accountDeletion = await createProductionAccountDeletionHandler();
    return await accountDeletion(req, res);
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ error: "account_deletion_unavailable" });
  }
});

export default async function handler(req, res) {
  if (req.query?.social === "1") {
    try {
      const { createProductionSocialHandler } = await import("../../src/features/social/server/socialApi.js");
      return await (await createProductionSocialHandler())(req, res);
    } catch {
      res.setHeader?.("Cache-Control", "no-store");
      return res.status(503).json({ error: "social_unavailable" });
    }
  }
  if (req.query?.admin === "1") {
    try {
      const { createProductionAdminHandler } = await import("../../src/features/admin/server/adminApi.js");
      return await (await createProductionAdminHandler())(req, res);
    } catch {
      res.setHeader?.("Cache-Control", "no-store");
      return res.status(503).json({ error: "admin_unavailable" });
    }
  }
  return deleteAccount(req, res);
}
