import { generateKeyPairSync, randomBytes } from "node:crypto";

/* global process, Buffer */

const PROJECT_ID = "demo-chytnucz-local";
const MAX_REQUEST_BYTES = 280_000;

function assertEmulatorOnly(server) {
  if (process.env.CHYTNU_LOCAL_SOCIAL_API !== "1"
    || process.env.VITE_BACKEND_MODE !== "emulator"
    || process.env.GCLOUD_PROJECT !== PROJECT_ID
    || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
    || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080"
    || server.config.server.host !== "127.0.0.1") {
    throw new Error("Lokální sociální API vyžaduje výhradně loopback a demo Firebase emulátory.");
  }
  const credentials = ["FIREBASE_CONFIG", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_APPLICATION_CREDENTIALS_JSON",
    "FIREBASE_SERVICE_ACCOUNT", "FIREBASE_ADMIN_CREDENTIALS"];
  const credentialPresent = credentials.some((key) => String(process.env[key] ?? "").trim());
  const cloudPrefixPresent = Object.keys(process.env).some((key) =>
    /^(VERCEL|CLOUDINARY_|AI_|OPENAI_|ANTHROPIC_|GEMINI_|CLOUDFLARE_)/.test(key));
  if (credentialPresent || cloudPrefixPresent) {
    throw new Error("Lokální sociální API odmítlo cloudové nebo produkční credentials.");
  }
}

function responseAdapter(response) {
  return {
    setHeader: (...args) => response.setHeader(...args),
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(body) {
      if (!response.headersSent) response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify(body));
      return this;
    },
  };
}

function sendTooLarge(response) {
  response.statusCode = 413;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify({ error: "request_too_large" }));
}

export async function restoreLocalSocialConfig(ref, snapshot) {
  if (snapshot.exists) await ref.set(snapshot.data());
  else await ref.delete();
}

async function readRequestBody(request) {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return null;
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_REQUEST_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function localSocialApiPlugin() {
  return {
    name: "chytnucz-local-social-api",
    apply: "serve",
    async configureServer(server) {
      if (process.env.CHYTNU_LOCAL_SOCIAL_API !== "1") return;
      assertEmulatorOnly(server);

      const [{ cert, initializeApp, getApps }, { getAuth }, { getFirestore },
        { createPublicProfileService }, { createSocialHandler }] = await Promise.all([
        import("firebase-admin/app"),
        import("firebase-admin/auth"),
        import("firebase-admin/firestore"),
        import("../src/features/social/server/publicProfileService.js"),
        import("../src/features/social/server/socialApi.js"),
      ]);
      const appName = `chytnucz-local-social-${process.pid}`;
      const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
      const app = getApps().find((candidate) => candidate.name === appName)
        ?? initializeApp({
          projectId: PROJECT_ID,
          // This ephemeral key is only a local emulator credential; no ADC is consulted.
          credential: cert({
            projectId: PROJECT_ID,
            clientEmail: `local-social-${process.pid}@demo-chytnucz-local.iam.gserviceaccount.com`,
            privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
          }),
        }, appName);
      const db = getFirestore(app);
      const auth = getAuth(app);
      const socialConfigRef = db.doc("adminConfig/social");
      const previousSocialConfig = await socialConfigRef.get();
      await socialConfigRef.set({ enabled: true }, { merge: true });

      const service = createPublicProfileService({
        db,
        auth,
        avatar: {},
        socialPhoto: null,
        env: {},
        cursorSecret: randomBytes(32).toString("hex"),
      });
      const handler = createSocialHandler({ service });

      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
        if (pathname !== "/api/social") return next();
        let body;
        try {
          body = await readRequestBody(request);
        } catch (error) {
          return next(error);
        }
        if (body === null) {
          sendTooLarge(response);
          request.resume();
          return;
        }
        request.body = body;
        return handler(request, responseAdapter(response)).catch(next);
      });

      server.httpServer?.once("close", () => {
        void (async () => {
          try {
            await restoreLocalSocialConfig(socialConfigRef, previousSocialConfig);
          } catch (error) {
            console.error(`Lokální nastavení sociální sítě se nepodařilo obnovit: ${error.message}`);
          }
          try {
            const { deleteApp } = await import("firebase-admin/app");
            await deleteApp(app);
          } catch (error) {
            console.error(`Lokální Firebase emulátor se nepodařilo ukončit: ${error.message}`);
          }
        })();
      });
    },
  };
}
