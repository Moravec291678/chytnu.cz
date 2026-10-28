import test from "node:test";
import assert from "node:assert/strict";
import { createNotificationDispatcher } from "./notificationDelivery.js";

test("notification dispatcher fans out the same domain record through selected delivery adapters", async () => {
  const deliveries = [];
  const dispatcher = createNotificationDispatcher([
    { channel: "in_app", deliver: async (item) => deliveries.push(["in_app", item.id]) },
    { channel: "native_push", deliver: async (item) => deliveries.push(["native_push", item.id]) },
  ]);
  const record = { id: "notification-1", type: "app_update" };
  await dispatcher.deliver(record, ["in_app", "web_push", "native_push"]);
  assert.deepEqual(deliveries, [["in_app", record.id], ["native_push", record.id]]);
  assert.throws(() => createNotificationDispatcher([{ channel: "carrier-pigeon", deliver() {} }]), /podporovaný kanál/);
  assert.throws(() => createNotificationDispatcher([
    { channel: "in_app", deliver() {} }, { channel: "in_app", deliver() {} },
  ]), /už má doručovací adaptér/);
});
