import { createProductionServerProgressionApi } from "../../src/server/progressionApi.js";

export default async function handler(req, res) {
  const api = await createProductionServerProgressionApi();
  return api.claim(req, res);
}
