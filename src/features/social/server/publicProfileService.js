import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { configuredOwnerUid, configuredCoCreatorUid } from "../../admin/server/adminAccess.js";
import { publicCatchProjection, sectionAllowed } from "../data/publicProfileModel.js";
import { createSocialRepository } from "./socialRepository.js";
import { moderationKey } from "../../admin/server/adminSupportStore.js";
import { createAvatarCoordinator } from "./socialAvatarCoordinator.js";
import { createDiscoveryService } from "./discoveryService.js";
import { createFriendsService } from "./friendsService.js";
import { relationshipView } from "../data/relationshipModel.js";
import { createPublicationService } from "./publicationService.js";
import { createSocialPhotoCoordinator } from "./socialPhotoCoordinator.js";
import { createSocialCursor } from "./socialCursor.js";
import { legacyShareApproval } from "./legacyShareApproval.js";
import { activeSocialPhoto } from "./socialAccess.js";
import { publicFishingStats } from "../data/publicFishingStats.js";
import { publicAchievementChoices } from "../data/publicProgressionModel.js";
import { projectPublicProgression } from "./publicProgressionService.js";
export const profileError = (code, status = 400) => Object.assign(new Error(code), { code, status });
export function createPublicProfileService({ db, auth, avatar, socialPhoto, env = {}, cursorSecret, now = () => Date.now() }) {
  const repository = createSocialRepository({ db, auth, now, profilesEnabled: true });
  const avatars = createAvatarCoordinator({ db, avatar, now });
  const media = socialPhoto ? createSocialPhotoCoordinator({db,photo:socialPhoto,now}) : null;
  const publications = createPublicationService({db,media,cursors:createSocialCursor({env,secret:cursorSecret,now}),env,now});
  async function identity(token) {
    if (!token) throw profileError("authentication_required", 401);
    try { return (await auth.verifyIdToken(token, true)).uid; } catch { throw profileError("authentication_required", 401); }
  }
  async function limited(uid, action) {
    return db.runTransaction(async tx => {
      const day = Math.floor(now() / 86_400_000), minute = Math.floor(now() / 60_000);
      const limits = [["social-http-day", day, 2000], ["social-http-minute", minute, 120],
        ...(uid ? [[`social-http-${createHash("sha256").update(uid).digest("hex")}`, minute, 60]] : []),
        ...(action === "avatar.set" ? [["social-avatar-day", day, 30]] : [])];
      if (action === "search") limits.push([`social-search-${createHash("sha256").update(uid).digest("hex")}`, minute, 30],
        [`social-search-day-${createHash("sha256").update(uid).digest("hex")}`, day, 150]);
      if (action === "progression.compare") limits.push([`social-comparison-${createHash("sha256").update(uid).digest("hex")}`,minute,5]);
      const rows = await Promise.all(limits.map(([key]) => tx.get(db.doc(`serverRateLimits/${key}`))));
      limits.forEach(([key, window, limit], i) => {
        const old = rows[i].data(), count = old?.window === window ? old.count : 0;
        if (!Number.isSafeInteger(count) || count < 0 || count >= limit) throw profileError("request_limit", 429);
        tx.set(db.doc(`serverRateLimits/${key}`), { window, count: count + 1 });
      });
    });
  }
  async function projection({ tx, profile, audience }, { summaryOnly = false } = {}) {
    const result = { uid: profile.uid, handle: profile.handle, displayName: profile.displayName, bio: profile.bio,
      badgeRole: profile.uid === configuredOwnerUid(env) ? "OWNER" : profile.uid === configuredCoCreatorUid(env) ? "CO_CREATOR" : null,
      ...(profile.avatarVersion ? { avatarVersion: createHash("sha256").update(profile.avatarAssetId).digest("hex").slice(0, 16) } : {}) };
    if (sectionAllowed(profile.sections.interests, audience)) Object.assign(result, { region: profile.region, specialization: profile.specialization, favoriteSpecies: profile.favoriteSpecies });
    if (summaryOnly) {
      delete result.bio;
      if (!profile.regionDiscoverable) delete result.region;
    }
    const relevant = !summaryOnly && ["statistics", "catches", "trophies"].some(k => sectionAllowed(profile.sections[k], audience));
    const catches = relevant ? (await Promise.all(profile.sharedCatchIds.map(async id => {
      const [record, moderation] = await Promise.all([tx.get(db.doc(`users/${profile.uid}/catches/${id}`)), tx.get(db.doc(`adminPublicModeration/${moderationKey(profile.uid, id)}`))]);
      const row = record.data();
      return row?.ownerId === profile.uid && moderation.data()?.hidden !== true && profile.shareApprovals[id] === legacyShareApproval(row) ? publicCatchProjection({ ...row, id }) : null;
    }))).filter(Boolean) : [];
    if (!summaryOnly && sectionAllowed(profile.sections.catches, audience)) result.catches = catches;
    if (!summaryOnly && ["statistics","trophies"].some(k=>sectionAllowed(profile.sections[k],audience))) {
      const posts=await publications.profileSummary(tx,profile,audience);
      const shared=publicFishingStats(catches,posts.records,{partial:posts.partial});
      if (sectionAllowed(profile.sections.statistics,audience)) result.statistics=shared.statistics;
      if (sectionAllowed(profile.sections.trophies,audience)) result.trophies=shared.trophies;
    }
    if (!summaryOnly && sectionAllowed(profile.sections.gallery, audience)) result.photos = (await Promise.all(profile.sharedPhotos.map(async reference => {
      const [catchRow, photo, moderation] = await Promise.all([tx.get(db.doc(`users/${profile.uid}/catches/${reference.catchId}`)), tx.get(db.doc(`users/${profile.uid}/catches/${reference.catchId}/photos/${reference.photoId}`)), tx.get(db.doc(`adminPublicModeration/${moderationKey(profile.uid, reference.catchId)}`))]);
      const record = photo.data();
      return moderation.data()?.hidden !== true && activeSocialPhoto(catchRow.data(),record,profile.uid,reference.photoId) && record.type === "image/jpeg" && record.cloud?.state === "synced"
        && profile.shareApprovals[`${reference.catchId}/${reference.photoId}`] === legacyShareApproval(catchRow.data(),record) ? reference : null;
    }))).filter(Boolean);
    Object.assign(result,await projectPublicProgression({tx,db,profile,audience,summaryOnly}));
    return result;
  }
  const read = (token, target, options) => repository.readProfileSnapshot(token, target, projection, options);
  const discovery = createDiscoveryService({ db, repository, env, cursorSecret, now, project: context => projection(context, { summaryOnly: true }) });
  const friends = createFriendsService({ db, repository, env, cursorSecret, now, project: context => projection(context, { summaryOnly: true }) });
  async function own(token, reader) { const uid = await identity(token); return repository.readProfileSnapshot(token, uid, reader); }
  return { async execute(action, payload, token) {
    const uid = token ? await identity(token) : null;
    if (!uid && !["view", "image", "posts.list", "posts.image"].includes(action)) throw profileError("authentication_required", 401);
    await limited(uid, action);
    if (action === "progression.compare") return repository.compareProfiles(token,payload.targetUid,projection);
    if (action === "posts.save") return publications.save(uid,payload);
    if (action === "posts.own") return publications.own(uid,payload);
    if (action === "posts.list") return publications.list(uid,payload);
    if (action === "posts.delete") return publications.remove(uid,payload);
    if (action === "posts.image") return publications.image(uid,payload);
    if (action === "search") return discovery.search(token, uid, payload);
    if (action === "friends") return friends.list(token, uid, payload);
    if (action === "friends.status") return { relationship: await repository.friendStatus(token, payload.targetUid) };
    if (action === "relationship") {
      const operations = ["request", "accept", "reject", "cancel", "unfriend", "remove"];
      if (!operations.includes(payload.operation)) throw profileError("invalid_request");
      const relation = await repository.relationship(token, payload.targetUid, payload.operation, { friendships: true, operationId: payload.operationId, expectedRevision: payload.expectedRevision });
      return { relationship: relationshipView(relation, uid, { canRequest: false }) };
    }
    if (action === "view") return { profile: await read(token, payload.identity) };
    if (action === "preview") return { profile: await read(token, uid, { audience: payload.audience }) };
    if (action === "self") {
      // Guard existing account state even before the first public profile is created.
      const state = await Promise.all(["accountSuspensions", "accountDeletions"].map(c => db.doc(`${c}/${uid}`).get()));
      if (state.some(row => row.exists)) throw profileError("account_unavailable", 403);
      const profile = await repository.getProfile(token, uid);
      const blocked = await db.collection(`socialBlocks/${uid}/blocked`).limit(50).get();
      const recent = await db.collection(`users/${uid}/catches`).orderBy("caughtAt", "desc").limit(20).get();
      const rows = new Map(recent.docs.map(row => [row.id, row]));
      for (const id of new Set([...(profile?.sharedCatchIds ?? []), ...(profile?.sharedPhotos ?? []).map(p => p.catchId)])) {
        if (!rows.has(id)) rows.set(id, await db.doc(`users/${uid}/catches/${id}`).get());
      }
      const candidateCatches = (await Promise.all([...rows.values()].filter(row => row.exists).map(async row => {
        if (row.data().ownerId !== uid) return null;
        const item = publicCatchProjection({ ...row.data(), id: row.id }); if (!item) return null;
        const photos = await row.ref.collection("photos").limit(4).get(), choices = new Map(photos.docs.map(p => [p.id, p]));
        for (const reference of (profile?.sharedPhotos ?? []).filter(p => p.catchId === row.id)) {
          if (!choices.has(reference.photoId)) choices.set(reference.photoId, await row.ref.collection("photos").doc(reference.photoId).get());
        }
        return { ...item, photos: [...choices.values()].filter(p => activeSocialPhoto(row.data(),p.data(),uid,p.id) && p.data().type === "image/jpeg" && p.data().cloud?.state === "synced").map(p => ({ photoId: p.id })) };
      }))).filter(Boolean);
      return { uid, profile, candidateCatches,achievementChoices:publicAchievementChoices(), blockedAccounts: blocked.docs.map(row => ({ uid: row.id })) };
    }
    if (action === "save") return { profile: await repository.saveProfile(token, payload.profile) };
    if (action === "block") { await repository.block(token, payload.targetUid, payload.blocked); return { blocked: payload.blocked }; }
    if (action === "report") {
      const profile = await read(token, payload.targetUid);
      if (!profile || profile.uid === uid) throw profileError("profile_unavailable", 404);
      if (typeof payload.reason !== "string" || !payload.reason.trim() || payload.reason.length > 500) throw profileError("invalid_request");
      const key = createHash("sha256").update(`${uid}/${profile.uid}/${Math.floor(now() / 86_400_000)}`).digest("hex");
      await db.doc(`socialReports/${key}`).set({ reporterUid: uid, targetUid: profile.uid, reason: payload.reason.trim(), status: "new", createdAt: now() });
      return { reported: true };
    }
    if (action === "avatar.set" || action === "avatar.remove") {
      const profile = await own(token, ({ profile }) => profile);
      if (!profile) throw profileError("save_profile_first");
      if (action === "avatar.remove") await avatars.remove(uid);
      else await avatars.save(uid, payload.jpegBase64);
      return { avatar: action === "avatar.set" };
    }
    if (action === "image") {
      const authorized = () => repository.readProfileSnapshot(token, payload.identity, async context => {
        const { profile, tx, audience } = context;
        if (payload.kind === "avatar" && profile.avatarVersion) return {avatar:true,uid:profile.uid,assetId:profile.avatarAssetId};
        if (payload.kind !== "catch" || !sectionAllowed(profile.sections.gallery, audience) || !profile.sharedPhotos.some(p => p.catchId === payload.catchId && p.photoId === payload.photoId)) throw profileError("profile_unavailable", 404);
        const [parent, photo, moderation] = await Promise.all([tx.get(db.doc(`users/${profile.uid}/catches/${payload.catchId}`)), tx.get(db.doc(`users/${profile.uid}/catches/${payload.catchId}/photos/${payload.photoId}`)), tx.get(db.doc(`adminPublicModeration/${moderationKey(profile.uid, payload.catchId)}`))]);
        if (moderation.data()?.hidden === true || !activeSocialPhoto(parent.data(),photo.data(),profile.uid,payload.photoId)) throw profileError("profile_unavailable", 404);
        if (profile.shareApprovals[`${payload.catchId}/${payload.photoId}`] !== legacyShareApproval(parent.data(),photo.data())) throw profileError("profile_unavailable",404);
        return {uid:profile.uid,photo:photo.data()};
      });
      const initial=await authorized(); if (!initial) throw profileError("profile_unavailable",404);
      let bytes;
      if (initial.avatar) bytes=await avatar.delivery(initial.uid,initial.assetId);
      else {
        if (!media) throw profileError("photo_unavailable",503);
        const identity={uid:initial.uid,catchId:payload.catchId,photoId:payload.photoId};
        const receipt=await media.prepare(identity,initial.photo);
        bytes=await media.delivery(identity,initial.photo,receipt);
      }
      const final=await authorized();
      if (!final || final.uid !== initial.uid || final.assetId !== initial.assetId || final.photo?.cloud?.sha256 !== initial.photo?.cloud?.sha256) throw profileError("profile_unavailable",404);
      return { jpegBase64: Buffer.from(bytes).toString("base64") };
    }
    throw profileError("invalid_request");
  } };
}
