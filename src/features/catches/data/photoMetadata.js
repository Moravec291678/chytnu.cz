import { sha256Blob } from "./photoCloudProvider.js";

export async function preserveSyncedPhotoMetadata(incoming, current) {
  if (!Array.isArray(incoming?.photos) || !Array.isArray(current?.photos)) return incoming;
  const currentById = new Map(current.photos.filter((photo) => photo?.id).map((photo) => [photo.id, photo]));
  const photos = await Promise.all(incoming.photos.map(async (photo) => {
    const latest = currentById.get(photo?.id);
    if (latest?.cloud?.state !== "synced" || latest.cloud.provider !== "cloudinary") return photo;
    if (photo.blob instanceof Blob) {
      if (await sha256Blob(photo.blob) !== latest.cloud.sha256) return photo;
    } else if (photo.size !== latest.size || photo.type !== latest.type) return photo;
    return { ...photo, cloud: latest.cloud };
  }));
  return { ...incoming, photos };
}
