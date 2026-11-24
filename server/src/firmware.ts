import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FirmwareRow } from "./types.js";

// Firmware images are NOT public: they embed the board's Wi-Fi credentials
// and DEVICE_TOKEN (baked in from .env at build time). Boards fetch them via
// short-lived HMAC-signed links created with each "ota" command.

export const VERSION_RE = /^[A-Za-z0-9._-]{1,32}$/;
export const FILES = { bin: "firmware.bin", sig: "firmware.sig" } as const;
const LINK_TTL_S = 24 * 3600;

// A DEVICE_TOKEN is 32 random bytes in base64url (auth.ts), baked into the
// image as a plain C string. Hashing every 43-character base64url window of an
// image tells which board it was built for, by comparison with devices.token_hash.
export const TOKEN_LENGTH = 43;

const isTokenChar = (b: number) =>
  (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) || b === 0x2d || b === 0x5f;

/** SHA-256 (hex) of every TOKEN_LENGTH-long run of base64url characters in the image. */
export function tokenCandidates(bin: Buffer): Set<string> {
  const out = new Set<string>();
  let start = 0;
  for (let i = 0; i <= bin.length; i++) {
    if (i < bin.length && isTokenChar(bin[i]!)) continue;
    for (let w = start; w + TOKEN_LENGTH <= i; w++) {
      out.add(crypto.createHash("sha256").update(bin.subarray(w, w + TOKEN_LENGTH)).digest("hex"));
    }
    start = i + 1;
  }
  return out;
}

export class FirmwareStore {
  readonly dir: string;
  // Token candidates per version, computed once: an image never changes without save().
  private readonly hashes = new Map<string, Set<string>>();

  constructor(dataDir: string, private readonly secret: string) {
    this.dir = path.join(dataDir, "firmware");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  path(version: string, file: keyof typeof FILES): string {
    if (!VERSION_RE.test(version)) throw new Error("invalid version");
    return path.join(this.dir, version, FILES[file]);
  }

  exists(version: string): boolean {
    return VERSION_RE.test(version) &&
      fs.existsSync(this.path(version, "bin")) && fs.existsSync(this.path(version, "sig"));
  }

  list(): Omit<FirmwareRow, "device_id" | "device_name">[] {
    return fs.readdirSync(this.dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && this.exists(d.name))
      .map((d) => {
        const st = fs.statSync(this.path(d.name, "bin"));
        return { version: d.name, size: st.size, uploaded_at: Math.floor(st.mtimeMs / 1000) };
      })
      .sort((a, b) => b.uploaded_at - a.uploaded_at);
  }

  save(version: string, bin: Buffer, sig: Buffer) {
    const dir = path.dirname(this.path(version, "bin"));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.path(version, "bin"), bin);
    fs.writeFileSync(this.path(version, "sig"), sig);
    this.hashes.delete(version);
  }

  /** Hashes of the token candidates in this version's image (see tokenCandidates). */
  tokenHashes(version: string): Set<string> {
    let set = this.hashes.get(version);
    if (!set) {
      set = tokenCandidates(fs.readFileSync(this.path(version, "bin")));
      this.hashes.set(version, set);
    }
    return set;
  }

  remove(version: string) {
    fs.rmSync(path.dirname(this.path(version, "bin")), { recursive: true, force: true });
    this.hashes.delete(version);
  }

  private mac(version: string, exp: number): string {
    return crypto.createHmac("sha256", this.secret).update(`fw:${version}:${exp}`).digest("base64url");
  }

  signedUrls(publicUrl: string, version: string, nowS: number) {
    const exp = nowS + LINK_TTL_S;
    const q = `exp=${exp}&sig=${this.mac(version, exp)}`;
    const base = `${publicUrl}/firmware/${encodeURIComponent(version)}`;
    return { url: `${base}/${FILES.bin}?${q}`, signature_url: `${base}/${FILES.sig}?${q}` };
  }

  verifyLink(version: string, exp: string | undefined, sig: string | undefined, nowS: number): boolean {
    const expN = Number(exp);
    if (!sig || !Number.isInteger(expN) || expN < nowS) return false;
    const expected = Buffer.from(this.mac(version, expN));
    const got = Buffer.from(sig);
    return expected.length === got.length && crypto.timingSafeEqual(expected, got);
  }
}
