import { afterEach, describe, expect, it } from "vitest";
import { stepLabel } from "../pages/device/shared";
import { ago, duration, fmt } from "../util";
import { dateFmt } from "./format";
import { setLang } from "./lang";

const mem = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
afterEach(() => setLang("fr", mem));
const jan = new Date(2026, 0, 15);

describe("formatting follows the language", () => {
  it("French stays as it was", () => {
    expect(fmt(1234.5, 1)).toBe("1 234,5");
    expect(ago(995, 1000)).toBe("à l'instant");
    expect(ago(0)).toBe("jamais");
    expect(duration(3 * 86400 + 7200)).toBe("3 j 2 h");
    expect(stepLabel(86400)).toBe("1 j");
    expect(dateFmt({ month: "long" }).format(jan)).toBe("janvier");
  });

  it("English", () => {
    setLang("en", mem);
    expect(fmt(1234.5, 1)).toBe("1,234.5");
    expect(ago(970, 1000)).toBe("30 seconds ago");
    expect(ago(995, 1000)).toBe("just now");
    expect(ago(0)).toBe("never");
    expect(duration(3 * 86400 + 7200)).toBe("3 d 2 h");
    expect(duration(3600 + 120)).toBe("1 h 2 min");
    expect(stepLabel(86400)).toBe("1 d");
    expect(dateFmt({ month: "long" }).format(jan)).toBe("January");
  });
});
