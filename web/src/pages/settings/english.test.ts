import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../../i18n/lang";
import { lastUsedText } from "./apiKeys";
import { calibrationFrom } from "./calibration";
import { deleteBody, deletedToast } from "./deleteText";

const mem = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
afterEach(() => setLang("fr", mem));

describe("settings texts in English", () => {
  it("read in English", () => {
    setLang("en", mem);
    expect(deleteBody(null)).toBe("The board and ALL its readings, commands and log entries will be erased, and you'll go back to the add screen. This is permanent: export the data (CSV) first.");
    expect(deleteBody("Salon")).toContain("you'll switch to Salon");
    expect(deletedToast("Bureau", "Salon")).toBe("Bureau deleted. You're now looking at Salon.");
    expect(deletedToast("Bureau", null)).toBe("Bureau deleted.");
    expect(lastUsedText(null, 0)).toBe("never used");
    expect(lastUsedText(970, 1000)).toBe("used 30 seconds ago");
    expect(calibrationFrom(null, 0, "50")).toEqual({ ok: false, error: "No recent sound reading: check that the microphone is detected." });
    expect(calibrationFrom({ ts: 0, snd: 10 } as never, 1000, "50")).toEqual({ ok: false, error: "Last reading too old (over 2 min): wait for the board to send a reading." });
    expect(calibrationFrom({ ts: 990, snd: 10 } as never, 1000, "5")).toEqual({ ok: false, error: "Enter a level between 20 and 130 dB." });
  });
});
