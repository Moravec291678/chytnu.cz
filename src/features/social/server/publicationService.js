import { FieldPath } from "firebase-admin/firestore";
import { Buffer } from "node:buffer";
import catalogue from "../../../../public/data/ris/be90ad549cf77679/index.json" with { type: "json" };
import { canonicalPair, socialUid } from "../data/socialModel.js";
import { sectionAllowed } from "../data/publicProfileModel.js";
import { publicationId, publicationInput, publicationContent, contentFingerprint } from "../data/publicationModel.js";
import { configuredOwnerUid, configuredCoCreatorUid } from "../../admin/server/adminAccess.js";
import { moderationKey } from "../../admin/server/adminSupportStore.js";
import { assertSocialInteraction, activeSocialPhoto } from "./socialAccess.js";
const waters = new Map(catalogue.map(w => [w.id,w]));
const fail = (code = "post_unavailable") => { throw new Error(code); };
export function createPublicationService({ db, media, cursors, env = {}, now = () => Date.now() }) {
  async function guard(tx, uid) {
    const [config,suspended,deleting] = await Promise.all(["adminConfig/social",`accountSuspensions/${uid}`,`accountDeletions/${uid}`].map(p => tx.get(db.doc(p))));
    if (config.data()?.profilesEnabled === false || config.data()?.postsEnabled === false) fail("social_disabled");
    if (suspended.exists || deleting.exists) fail("account_unavailable");
  }
  async function source(tx, uid, catchId, photoId) {
    const parent = (await tx.get(db.doc(`users/${uid}/catches/${socialUid(catchId)}`))).data();
    if (!parent || parent.deleted || parent.ownerId !== uid) fail();
    let water;
    if (parent.waterId) {
      const saved = (await tx.get(db.doc(`users/${uid}/waters/${socialUid(parent.waterId)}`))).data();
      if (saved?.ownerId === uid && !saved.deleted) water = waters.get(saved.catalogueId);
    }
    let photo = null;
    if (photoId) {
      photo = (await tx.get(db.doc(`users/${uid}/catches/${catchId}/photos/${socialUid(photoId)}`))).data();
      if (!activeSocialPhoto(parent,photo,uid,photoId) || photo.type !== "image/jpeg" || photo.cloud?.state !== "synced") fail();
    }
    return { parent, water, photo };
  }
  const fingerprint = (src,input) => contentFingerprint({ content: publicationContent(src.parent,input,src.water), privacy: src.parent.privacy ?? "private", photoSha: src.photo?.cloud?.sha256 ?? null });
  async function permitted(tx, uid, row, { ownerOnly = false, previewAudience } = {}) {
    if (!row || row.deleted || row.moderationState !== "visible") return null;
    await guard(tx, uid ?? row.ownerUid);
    const profile = (await tx.get(db.doc(`publicProfiles/${row.ownerUid}`))).data();
    if (!profile || profile.uid !== row.ownerUid) return null;
    let audience = "stranger";
    if (previewAudience !== undefined && (uid !== row.ownerUid || !["stranger","friend"].includes(previewAudience))) fail("forbidden");
    if (uid === row.ownerUid && !previewAudience) audience = "owner";
    else {
      if (ownerOnly) return null;
      if (previewAudience) audience=previewAudience;
      else if (uid) {
        try { await assertSocialInteraction({ tx,db,uid,targetUid:row.ownerUid }); } catch { return null; }
        const relationship = (await tx.get(db.doc(`socialRelationships/${canonicalPair(uid,row.ownerUid)}`))).data();
        if (relationship?.status === "accepted") audience = "friend";
      }
      if (!sectionAllowed(profile.visibility,audience) || !sectionAllowed(row.visibility,audience)
        || !sectionAllowed(profile.sections?.[row.sourcePhotoId ? "gallery" : "catches"] ?? "private",audience)) return null;
    }
    const moderation = await tx.get(db.doc(`adminPublicModeration/${moderationKey(row.ownerUid,row.sourceCatchId)}`));
    if (moderation.data()?.hidden === true) return null;
    let src;
    try { src = await source(tx,row.ownerUid,row.sourceCatchId,row.sourcePhotoId); }
    catch { return null; }
    if (fingerprint(src,row) !== row.sourceFingerprint) return null;
    return { row,src,profile,audience };
  }
  function dto({ row,profile,audience }) {
    return { id:row.id,author:{uid:row.ownerUid,handle:profile.handle,displayName:profile.displayName,
      badgeRole:row.ownerUid === configuredOwnerUid(env) ? "OWNER" : row.ownerUid === configuredCoCreatorUid(env) ? "CO_CREATOR" : null},
    visibility:row.visibility,revision:row.revision,createdAt:row.createdAt,updatedAt:row.updatedAt,content:row.content,hasPhoto:!!row.sourcePhotoId,deleted:row.deleted,
    ...(audience === "owner" ? { sourceCatchId:row.sourceCatchId,sourcePhotoId:row.sourcePhotoId,fields:row.fields } : {}) };
  }
  return {
    async profileSummary(tx,profile,audience) {
      const config=(await tx.get(db.doc("adminConfig/social"))).data();
      if (config?.postsEnabled === false) return {records:[],partial:false};
      let query=db.collection("socialPosts").where("ownerUid","==",profile.uid);
      if (audience === "stranger") query=query.where("visibility","==","public");
      else if (audience === "friend") query=query.where("visibility","in",["public","friends"]);
      const page=await tx.get(query.orderBy("createdAt","desc").orderBy(FieldPath.documentId(),"desc").limit(20));
      const records=[];
      for (const snapshot of page.docs.slice(0,20)) {
        const row=snapshot.data();
        if (row.ownerUid !== profile.uid || row.deleted || row.moderationState !== "visible" || !sectionAllowed(row.visibility,audience)
          || !sectionAllowed(profile.sections?.[row.sourcePhotoId?"gallery":"catches"] ?? "private",audience)) continue;
        const moderation=await tx.get(db.doc(`adminPublicModeration/${moderationKey(row.ownerUid,row.sourceCatchId)}`));
        if (moderation.data()?.hidden === true) continue;
        let src; try {src=await source(tx,row.ownerUid,row.sourceCatchId,row.sourcePhotoId);} catch {continue;}
        if (fingerprint(src,row) !== row.sourceFingerprint) continue;
        records.push({sourceId:row.sourceCatchId,id:row.id,...row.content});
      }
      // Always label the bounded selection; never reveal counts of hidden rows
      // through a has-more/partial signal derived from private documents.
      return {records,partial:true};
    },
    async save(uid,payload) {
      const input = publicationInput(payload), id = publicationId(uid,input.catchId), ref = db.doc(`socialPosts/${id}`);
      const initial = await db.runTransaction(async tx => {
        await guard(tx,uid);
        if (!(await tx.get(db.doc(`publicProfiles/${uid}`))).exists) fail("save_profile_first");
        const old = (await tx.get(ref)).data(), src = await source(tx,uid,input.catchId,input.photoId);
        if (old && input.expectedRevision === undefined || input.expectedRevision !== undefined && input.expectedRevision !== (old?.revision ?? 0)) fail("post_conflict");
        return { src, revision:old?.revision ?? 0, fingerprint:fingerprint(src,input) };
      });
      // Provider work is outside retryable transactions. Durable receipt coalesces devices.
      const receipt = input.photoId && input.visibility !== "private" ? await media.prepare({uid,catchId:input.catchId,photoId:input.photoId},initial.src.photo) : null;
      const saved = await db.runTransaction(async tx => {
        await guard(tx,uid);
        const profile = (await tx.get(db.doc(`publicProfiles/${uid}`))).data();
        if (profile?.uid !== uid) fail("save_profile_first");
        const old = (await tx.get(ref)).data(), src = await source(tx,uid,input.catchId,input.photoId);
        if ((old?.revision ?? 0) !== initial.revision || fingerprint(src,input) !== initial.fingerprint) fail("post_conflict");
        const row = { id,ownerUid:uid,sourceCatchId:input.catchId,sourcePhotoId:input.photoId,fields:input.fields,description:input.description,
          content:publicationContent(src.parent,input,src.water),sourceFingerprint:initial.fingerprint,visibility:input.visibility,mediaReceipt:receipt,
          revision:initial.revision+1,createdAt:old?.createdAt ?? now(),updatedAt:now(),deleted:false,moderationState:old?.moderationState ?? "visible",schemaVersion:1 };
        tx.set(ref,row); return dto({row,profile,audience:"owner"});
      });
      return {post:saved};
    },
    async own(uid,{catchId}) {
      socialUid(catchId);
      return db.runTransaction(async tx => {
        await guard(tx,uid); const row = (await tx.get(db.doc(`socialPosts/${publicationId(uid,catchId)}`))).data();
        // Owner can repair stale approval after source edits; never expose another owner's source.
        const profile = (await tx.get(db.doc(`publicProfiles/${uid}`))).data();
        return {post:row && row.ownerUid === uid && profile ? dto({row,profile,audience:"owner"}) : null};
      });
    },
    async list(uid,{identity,cursor,previewAudience}) {
      socialUid(identity);
      if (previewAudience !== undefined && (uid !== identity || !["stranger","friend"].includes(previewAudience))) fail("forbidden");
      const context = `gallery:${uid ?? "anonymous"}:${identity}:${previewAudience ?? "actual"}`, after = cursors.decode(cursor,context);
      let query = db.collection("socialPosts").where("ownerUid","==",identity).orderBy(FieldPath.documentId());
      if (after) query = query.startAfter(after);
      return db.runTransaction(async tx => {
        await guard(tx,uid ?? identity);
        const page = await tx.get(query.limit(11)), scanned=page.docs.slice(0,10), posts=[];
        for (const snapshot of scanned) { const allowed = await permitted(tx,uid,snapshot.data(),{previewAudience}); if (allowed) posts.push(dto(allowed)); }
        return {posts,nextCursor:page.size > 10 ? cursors.encode(scanned.at(-1).id,context) : null};
      });
    },
    async remove(uid,{postId,expectedRevision}) {
      if (!/^[a-f0-9]{64}$/.test(postId ?? "") || expectedRevision !== undefined && !Number.isSafeInteger(expectedRevision)) fail("invalid_publication");
      await db.runTransaction(async tx => {
        await guard(tx,uid); const ref=db.doc(`socialPosts/${postId}`), row=(await tx.get(ref)).data();
        if (!row || row.ownerUid !== uid) fail();
        if (row.deleted) return;
        if (expectedRevision !== undefined && row.revision !== expectedRevision) fail("post_conflict");
        // A tombstone prevents delayed devices from restoring old media approval.
        tx.set(ref,{...row,deleted:true,visibility:"private",mediaReceipt:null,revision:row.revision+1,updatedAt:now()});
      }); return {deleted:true};
    },
    async image(uid,{postId,previewAudience}) {
      if (!/^[a-f0-9]{64}$/.test(postId ?? "")) fail();
      const read = () => db.runTransaction(async tx => permitted(tx,uid,(await tx.get(db.doc(`socialPosts/${postId}`))).data(),{previewAudience}));
      const current = await read(); if (!current?.row.sourcePhotoId || !current.row.mediaReceipt) fail();
      const {row,src}=current, bytes=await media.delivery({uid:row.ownerUid,catchId:row.sourceCatchId,photoId:row.sourcePhotoId},src.photo,row.mediaReceipt);
      const final = await read(); if (!final || final.row.revision !== row.revision) fail();
      return {jpegBase64:Buffer.from(bytes).toString("base64")};
    },
    permitted,dto,
  };
}
