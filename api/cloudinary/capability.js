import { createProductionCloudinaryApi } from "../../src/server/cloudinaryApi.js";

export default async function handler(req, res) {
  return createProductionCloudinaryApi().capability(req, res);
}
