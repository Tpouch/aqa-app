import { describe, expect, it } from "vitest";
import { ago } from "../../util";
import { lastUsedText, maskedKey } from "./apiKeys";

describe("apiKeys helpers", () => {
  it("masks a key down to its prefix", () => {
    expect(maskedKey("ab12cd34")).toBe("aqa_ab12cd34…");
  });
  it("says never used when there is no timestamp", () => {
    expect(lastUsedText(null, 1000)).toBe("jamais utilisée");
  });
  it("prefixes the relative time", () => {
    const text = lastUsedText(1000 - 180, 1000);
    expect(text.startsWith("utilisée ")).toBe(true);
    expect(text).toBe("utilisée " + ago(820, 1000));
  });
});
