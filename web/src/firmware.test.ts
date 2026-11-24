import { describe, expect, it } from "vitest";
import type { FirmwareRow } from "../../server/src/types";
import { firmwareFor } from "./firmware";

const row = (version: string, device_id: string | null): FirmwareRow =>
  ({ version, size: 1, uploaded_at: 0, device_id, device_name: device_id && "x" });

describe("firmwareFor", () => {
  it("ne garde que les images de la carte, dans l'ordre", () => {
    const list = [row("3", "aqa-A"), row("2", "aqa-B"), row("1", null), row("0", "aqa-A")];
    expect(firmwareFor(list, "aqa-A").map((f) => f.version)).toEqual(["3", "0"]);
  });
});
