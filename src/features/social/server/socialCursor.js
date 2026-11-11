import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
export function createSocialCursor({ env={},secret,now=()=>Date.now() }) {
  function key() {
    let value=secret;
    if (!value) { try { value=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "{}").private_key; } catch { /* Fail closed. */ } }
    if (typeof value !== "string" || value.length<32) throw new Error("social_unavailable");
    return createHash("sha256").update(`chytnucz-social-pagination-v1\n${value}`).digest();
  }
  return {
    encode(after,context) {
      const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),nonce);
      return Buffer.concat([nonce,cipher.update(JSON.stringify({after,context,expiresAt:now()+900000})),cipher.final(),cipher.getAuthTag()]).toString("base64url");
    },
    decode(cursor,context) {
      if (cursor == null) return null;
      try {
        if (typeof cursor !== "string" || cursor.length>2048 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
        const bytes=Buffer.from(cursor,"base64url"),decipher=createDecipheriv("aes-256-gcm",key(),bytes.subarray(0,12)); decipher.setAuthTag(bytes.subarray(-16));
        const result=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString());
        if (result.context !== context || result.expiresAt <= now() || typeof result.after !== "string" || !/^[A-Za-z0-9_-]{1,300}$/.test(result.after)) throw new Error();
        return result.after;
      } catch { throw new TypeError("invalid_cursor"); }
    },
  };
}
