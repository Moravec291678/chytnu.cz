import { FieldPath } from "firebase-admin/firestore";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import catalogue from "../../../../public/data/ris/be90ad549cf77679/index.json" with { type: "json" };
import { canonicalPair, socialUid } from "../data/socialModel.js";
import { sectionAllowed } from "../data/publicProfileModel.js";
import { publicationId, publicationInput, publicationContent, contentFingerprint } from "../data/publicationModel.js";
import { configuredOwnerUid, configuredCoCreatorUid } from "../../admin/server/adminAccess.js";
import { moderationKey } from "../../admin/server/adminSupportStore.js";
import { assertSocialInteraction, activeSocialPhoto } from "./socialAccess.js";
import { createSocialEntryService } from "./socialEntryService.js";
import { publicationConsentPath, assertPublicationConsent, consentAllowsPost, automaticCatchEligible } from "./publicationConsent.js";
const waters = new Map(catalogue.map(w => [w.id,w]));
const fail = (code = "post_unavailable") => { throw new Error(code); };
export function createPublicationService({ db, media, cursors, env = {}, now = () => Date.now() }) {
  async function guard(tx, uid, purpose) {
    const [config,suspended,deleting] = await Promise.all(["adminConfig/social",`accountSuspensions/${uid}`,`accountDeletions/${uid}`].map(p => tx.get(db.doc(p))));
    if (config.data()?.profilesEnabled === false || config.data()?.postsEnabled === false || purpose === "feed" && config.data()?.feedsEnabled === false) fail("social_disabled");
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
  const entries=createSocialEntryService({db,now,guard});
  const section=row=>["achievement","milestone"].includes(row.kind)?"achievements":row.sourcePhotoId?"gallery":"catches";
  async function permitted(tx, uid, row, { ownerOnly = false, previewAudience } = {}) {
    if (!row || row.deleted || row.moderationState !== "visible") return null;
    if (row.kind !== undefined && !["catch","experience","achievement","milestone"].includes(row.kind)) return null;
    await guard(tx, uid ?? row.ownerUid);
    const profile = (await tx.get(db.doc(`publicProfiles/${row.ownerUid}`))).data();
    if (!profile || profile.uid !== row.ownerUid) return null;
    let audience = "stranger";
    if (previewAudience !== undefined && (uid !== row.ownerUid || !["stranger","friend"].includes(previewAudience))) fail("forbidden");
    if (uid === row.ownerUid && !previewAudience) audience = "owner";
    else {
      if (ownerOnly) return null;
      if (!consentAllowsPost((await tx.get(db.doc(publicationConsentPath(row.ownerUid)))).data(), row)) return null;
      if (previewAudience) audience=previewAudience;
      else if (uid) {
        try { await assertSocialInteraction({ tx,db,uid,targetUid:row.ownerUid }); } catch { return null; }
        const relationship = (await tx.get(db.doc(`socialRelationships/${canonicalPair(uid,row.ownerUid)}`))).data();
        if (relationship?.status === "accepted") audience = "friend";
      }
      if (!sectionAllowed(profile.visibility,audience) || !sectionAllowed(row.visibility,audience)
        || !sectionAllowed(profile.sections?.[section(row)] ?? "private",audience)) return null;
    }
    if (row.kind && row.kind !== "catch") return await entries.approved({tx,profile,row}) ? {row,profile,audience} : null;
    const moderation = await tx.get(db.doc(`adminPublicModeration/${moderationKey(row.ownerUid,row.sourceCatchId)}`));
    if (moderation.data()?.hidden === true) return null;
    let src;
    try { src = await source(tx,row.ownerUid,row.sourceCatchId,row.sourcePhotoId); }
    catch { return null; }
    if (fingerprint(src,row) !== row.sourceFingerprint) return null;
    return { row,src,profile,audience };
  }
  function dto({ row,profile,audience }) {
    return { id:row.id,kind:row.kind??"catch",author:{uid:row.ownerUid,handle:profile.handle,displayName:profile.displayName,
      badgeRole:row.ownerUid === configuredOwnerUid(env) ? "OWNER" : row.ownerUid === configuredCoCreatorUid(env) ? "CO_CREATOR" : null,
      ...(profile.avatarVersion && profile.avatarAssetId ? {avatarVersion:createHash("sha256").update(profile.avatarAssetId).digest("hex").slice(0,16)} : {})},
    visibility:row.visibility,revision:row.revision,createdAt:row.createdAt,updatedAt:row.updatedAt,content:row.content,hasPhoto:!!row.sourcePhotoId,deleted:row.deleted,
    ...(audience === "owner" ? { ...(row.sourceEntryId?{sourceEntryId:row.sourceEntryId}:{}),sourceCatchId:row.sourceCatchId,sourcePhotoId:row.sourcePhotoId,fields:row.fields } : {}) };
  }
  return {
    async nearbyWaterActivity(uid, catalogueId) {
      if (!waters.has(catalogueId)) throw new Error("invalid_request");
      return db.runTransaction(async tx => {
        await guard(tx, uid, "feed");
        // Equality uses Firestore's existing single-field index. Bound source validation to one page.
        const candidates = await tx.get(db.collection("socialPosts").where("content.catalogueId", "==", catalogueId).limit(20));
        const visible = [];
        for (const snapshot of candidates.docs) {
          const row = snapshot.data();
          if (row.id !== snapshot.id || row.visibility !== "public" || row.fields?.water !== true
            || (row.kind && row.kind !== "catch") || !Number.isSafeInteger(row.createdAt)) continue;
          const allowed = await permitted(tx, uid, row, row.ownerUid === uid ? { previewAudience: "stranger" } : {});
          if (!allowed || allowed.profile.visibility !== "public" || allowed.profile.sections?.[section(row)] !== "public") continue;
          visible.push({
            id: row.id, species: row.content.species, month: row.content.caughtAt?.slice(0, 7),
            displayName: allowed.profile.displayName, createdAt: row.createdAt,
          });
        }
        return { posts: visible.sort((a, b) => b.createdAt - a.createdAt).slice(0, 6)
          .map(({ id, species, month, displayName }) => ({ id, species, ...(month ? { month } : {}), displayName })) };
      });
    },
    async saveEntry(uid,payload) { return {post:dto(await entries.save(uid,payload))}; },
    async view(uid,{postId}) {
      if (!/^[a-f0-9]{64}$/.test(postId??"")) fail();
      return db.runTransaction(async tx=>{
        const row=(await tx.get(db.doc(`socialPosts/${postId}`))).data();
        // Authors can repair/unpublish their own text draft or withdrawn
        // highlight. This never grants media or another account access.
        if (uid && row?.ownerUid === uid && !row.deleted && ["experience","achievement","milestone"].includes(row.kind)) {
          await guard(tx,uid);
          const profile=(await tx.get(db.doc(`publicProfiles/${uid}`))).data();
          if (profile?.uid !== uid) fail();
          return {post:{...dto({row,profile,audience:"owner"}),sourceAvailable:await entries.approved({tx,profile,row}),moderationState:row.moderationState}};
        }
        const allowed=await permitted(tx,uid,row);
        if (!allowed) fail(); return {post:dto(allowed)};
      });
    },
    async profileSummary(tx,profile,audience) {
      const config=(await tx.get(db.doc("adminConfig/social"))).data();
      if (config?.postsEnabled === false) return {records:[],partial:false};
      let query=db.collection("socialPosts").where("ownerUid","==",profile.uid);
      if (audience === "stranger") query=query.where("visibility","==","public");
      else if (audience === "friend") query=query.where("visibility","in",["public","friends"]);
      const page=await tx.get(query.orderBy("createdAt","desc").orderBy(FieldPath.documentId(),"desc").limit(20));
      const consent = audience === "owner" ? null : (await tx.get(db.doc(publicationConsentPath(profile.uid)))).data();
      const records=[];
      for (const snapshot of page.docs.slice(0,20)) {
        const row=snapshot.data();
        if (audience !== "owner" && !consentAllowsPost(consent, row)) continue;
        if (row.kind && row.kind !== "catch") continue;
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
    async save(uid,payload,{automaticEpoch} = {}) {
      const input = publicationInput(payload), id = publicationId(uid,input.catchId), ref = db.doc(`socialPosts/${id}`);
      const initial = await db.runTransaction(async tx => {
        await guard(tx,uid);
        const consent = (await tx.get(db.doc(publicationConsentPath(uid)))).data();
        assertPublicationConsent(consent, input.visibility);
        if (!(await tx.get(db.doc(`publicProfiles/${uid}`))).exists) fail("save_profile_first");
        const old = (await tx.get(ref)).data(), src = await source(tx,uid,input.catchId,input.photoId);
        if (automaticEpoch !== undefined && (old || consent?.epoch !== automaticEpoch || !automaticCatchEligible(src.parent,consent)
          || input.photoId && src.parent.privacy?.photoVisibility !== "public")) fail("post_conflict");
        if (old && input.expectedRevision === undefined || input.expectedRevision !== undefined && input.expectedRevision !== (old?.revision ?? 0)) fail("post_conflict");
        return { src, revision:old?.revision ?? 0, fingerprint:fingerprint(src,input), consentEpoch:consent?.epoch ?? 0 };
      });
      // Provider work is outside retryable transactions. Durable receipt coalesces devices.
      const receipt = input.photoId && input.visibility !== "private" ? await media.prepare({uid,catchId:input.catchId,photoId:input.photoId},initial.src.photo) : null;
      const saved = await db.runTransaction(async tx => {
        await guard(tx,uid);
        const profile = (await tx.get(db.doc(`publicProfiles/${uid}`))).data();
        if (profile?.uid !== uid) fail("save_profile_first");
        const consent = (await tx.get(db.doc(publicationConsentPath(uid)))).data();
        assertPublicationConsent(consent, input.visibility);
        if ((consent?.epoch ?? 0) !== initial.consentEpoch) fail("consent_conflict");
        const old = (await tx.get(ref)).data(), src = await source(tx,uid,input.catchId,input.photoId);
        if (automaticEpoch !== undefined && (old || consent?.epoch !== automaticEpoch || !automaticCatchEligible(src.parent,consent)
          || input.photoId && src.parent.privacy?.photoVisibility !== "public")) fail("post_conflict");
        if ((old?.revision ?? 0) !== initial.revision || fingerprint(src,input) !== initial.fingerprint) fail("post_conflict");
        const row = { id,ownerUid:uid,sourceCatchId:input.catchId,sourcePhotoId:input.photoId,fields:input.fields,description:input.description,
          content:publicationContent(src.parent,input,src.water),sourceFingerprint:initial.fingerprint,visibility:input.visibility,mediaReceipt:receipt,
          publicationEpoch:consent?.epoch ?? 0,
          revision:initial.revision+1,createdAt:old?.createdAt ?? now(),updatedAt:now(),deleted:false,moderationState:old?.moderationState ?? "visible",schemaVersion:1 };
        tx.set(ref,row); return dto({row,profile,audience:"owner"});
      });
      return {post:saved};
    },
    async publishNew(uid) {
      const receipt = (await db.doc(publicationConsentPath(uid)).get()).data();
      if (receipt?.mode !== "public") return { published: 0 };
      const scanRef = db.doc(`users/${uid}/socialPreferences/publicationScan`), scan = (await scanRef.get()).data();
      let query = db.collection(`users/${uid}/catches`).where("createdAt",">=",new Date(receipt.acceptedAt).toISOString())
        .orderBy("createdAt","desc").orderBy(FieldPath.documentId(),"desc");
      if (scan?.epoch === receipt.epoch && typeof scan.createdAt === "string" && typeof scan.id === "string") query=query.startAfter(scan.createdAt,scan.id);
      const page = await query.limit(10).get();
      let published = 0;
      let boundary = null;
      for (const snapshot of page.docs) {
        if (published >= 3) break;
        boundary = {createdAt:snapshot.data().createdAt,id:snapshot.id};
        const record = snapshot.data();
        if (!automaticCatchEligible(record,receipt) || (await db.doc(`socialPosts/${publicationId(uid,snapshot.id)}`).get()).exists) continue;
        let photoId = null;
        const attached = Object.keys(record.photoRefs ?? {}).filter(id=>record.photoRefs[id] === true);
        if (attached.length && record.privacy.photoVisibility === "public") {
          if (!media) continue;
          for (const id of attached.slice(0,4)) {
            const photo = (await snapshot.ref.collection("photos").doc(id).get()).data();
            if (activeSocialPhoto(record,photo,uid,id) && photo.type === "image/jpeg" && photo.cloud?.state === "synced") {photoId=id;break;}
          }
          if (!photoId) continue; // Retry after the private photo upload completes.
        }
        try {
          await this.save(uid,{catchId:snapshot.id,photoId,visibility:"public",fields:{length:true,weight:true,method:true,date:"month",water:false},description:"",expectedRevision:0},{automaticEpoch:receipt.epoch});
          published++;
        } catch (error) {
          if (!["post_conflict","photo_preparing","photo_unavailable","post_unavailable"].includes(error.message)) throw error;
        }
      }
      // Cycle through bounded pages, including deferred photos behind already
      // published rows. A new consent epoch invalidates the prior scan cursor.
      await db.runTransaction(async tx=>{
        await guard(tx,uid);
        const current=(await tx.get(db.doc(publicationConsentPath(uid)))).data();
        if (current?.epoch !== receipt.epoch || current.mode !== "public") return;
        tx.set(scanRef,{epoch:receipt.epoch,...(boundary && (page.size === 10 || published >= 3) ? boundary : {}),updatedAt:now()});
      });
      return {published};
    },
    async own(uid,{catchId}) {
      socialUid(catchId);
      return db.runTransaction(async tx => {
        await guard(tx,uid); const row = (await tx.get(db.doc(`socialPosts/${publicationId(uid,catchId)}`))).data();
        // Owner can repair stale approval after source edits; never expose another owner's source.
        const profile = (await tx.get(db.doc(`publicProfiles/${uid}`))).data();
        return {post:row && row.ownerUid === uid && profile ? dto({row,profile,audience:"owner"}) : null,
          publicationConsent:(await tx.get(db.doc(publicationConsentPath(uid)))).data() ?? null};
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
    permitted,dto,guard,section,
  };
}
