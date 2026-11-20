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

export class FirmwareStore {
  readonly dir: string;

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

  list(): FirmwareRow[] {
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
  }

  remove(version: string) {
    fs.rmSync(path.dirname(this.path(version, "bin")), { recursive: true, force: true });
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
