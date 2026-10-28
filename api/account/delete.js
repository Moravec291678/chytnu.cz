import { createProductionAccountDeletionHandler } from "../../src/server/accountDeletionApi.js";

export default async function handler(req, res) {
  try {
    const accountDeletion = await createProductionAccountDeletionHandler();
    return await accountDeletion(req, res);
  } catch {
    return res.status(503).json({ error: "account_deletion_unavailable" });
  }
}
