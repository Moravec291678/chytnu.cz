const SUPPORTED_CHANNELS = new Set(["in_app", "web_push", "native_push"]);

export function createNotificationDispatcher(transports = []) {
  const registered = new Map();
  for (const transport of transports) {
    if (!SUPPORTED_CHANNELS.has(transport?.channel) || typeof transport.deliver !== "function") {
      throw new TypeError("Doručovací adaptér oznámení nemá podporovaný kanál nebo metodu deliver.");
    }
    if (registered.has(transport.channel)) throw new TypeError(`Kanál ${transport.channel} už má doručovací adaptér.`);
    registered.set(transport.channel, transport);
  }
  return Object.freeze({
    async deliver(notification, channels = ["in_app"]) {
      const results = [];
      for (const channel of channels) {
        const transport = registered.get(channel);
        if (!transport) continue;
        results.push(await transport.deliver(notification));
      }
      return results;
    },
  });
}
