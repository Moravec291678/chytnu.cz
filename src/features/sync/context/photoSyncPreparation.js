/** Create the provider-bound photo service before legacy normalization needs it. */
export async function preparePhotoSyncService({ serviceRef, providerRef, provider, ownerId, createService, force = false }) {
  if (!serviceRef.current || providerRef.current !== provider) {
    providerRef.current = provider;
    serviceRef.current = createService(provider);
  }
  await serviceRef.current.normalizeLegacyPhotoIds(ownerId, { force });
  return serviceRef.current;
}
