import { createProductionCloudinaryApi } from "../../src/server/cloudinaryApi.js";

import { withNativeApiCors } from "../../src/server/nativeApiCors.js";

export default withNativeApiCors((req, res) => {
  return createProductionCloudinaryApi().signUpload(req, res);
}, "POST");
