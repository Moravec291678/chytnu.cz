import test from "node:test";
import assert from "node:assert/strict";
import { createWaterRoomMessageService } from "./waterRoomMessageService.js";

const waterId = "ris-123456789012345678901234";
function fixture() {
  const records = new Map(["author", "reader"].map(uid => [`publicProfiles/${uid}`, { uid, handle: uid, displayName: uid, visibility: "public", privateNote: "private" }]));
  const members = new Set(["author", "reader"]);
  const db = {
    doc: path => path,
    collection(path) {
      let maximum;
      return {
        orderBy() { return this; },
        limit(n) { maximum = n; return this; },
        read() {
          const docs = [...records.entries()].filter(([key]) => key.startsWith(path + "/")).slice(0, maximum).map(([key, row]) => ({ id: key.split("/").at(-1), data: () => row }));
          return { docs, size: docs.length };
        },
      };
    },
    runTransaction: work => work({
      get: async path => typeof path === "string" ? { exists: records.has(path), data: () => records.get(path) } : path.read(),
      set: (path, row) => records.set(path, row),
    }),
  };
  const waterPresence = { async authorize(_tx, uid, target) {
    if (!members.has(uid) || target !== waterId) throw new Error("water_presence_required");
  } };
  const service = createWaterRoomMessageService({ db, waterPresence, cursors: { decode: () => null } });
  return { service, records, members };
}

test("water chat requires valid presence and stores one idempotent message and deletion reference", async () => {
  const { service, records } = fixture();
  const draft = { waterId, text: "  Ahoj u vody  ", operationId: "synthetic-message-01" };
  await assert.rejects(service.send("intruder", draft), /water_presence_required/);
  const first = await service.send("author", draft);
  assert.deepEqual(await service.send("author", draft), first);
  await assert.rejects(service.send("author", { ...draft, text: "Jiný text" }), /message_conflict/);
  assert.equal(first.message.text, "Ahoj u vody");
  assert.deepEqual(first.message.author, { displayName: "author", handle: "author" });
  const path = `waterRooms/${waterId}/messages/${first.message.id}`;
  assert.ok(records.has(path));
  assert.equal([...records.entries()].find(([key]) => key.startsWith("users/author/socialReferences/"))[1].path, path);
});

test("water chat checks blocks and current presence on every list", async () => {
  const { service, records, members } = fixture();
  const { message } = await service.send("author", { waterId, text: "Ahoj", operationId: "synthetic-message-02" });
  assert.deepEqual((await service.list("reader", { waterId })).messages, [message]);
  records.set("socialBlocks/author/blocked/reader", {});
  assert.deepEqual((await service.list("reader", { waterId })).messages, []);
  members.delete("reader");
  await assert.rejects(service.list("reader", { waterId }), /water_presence_required/);
});
