// The API layer asks for the report in the active language and shows the
// French failure reasons of ntfy / the webhook in it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { setLang } from "./lang";

const mem = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
afterEach(() => { setLang("fr", mem); vi.unstubAllGlobals(); });

function stubFetch(body: unknown) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}

describe("api in English", () => {
  it("asks for the report in the active language", async () => {
    const report = { metrics: [], alerts: { current: 0, previous: 0, by_kind: [] } };
    const calls = stubFetch(report);
    await api.report("aqa-1", { from: 0, to: 1, prevFrom: 0, kind: "week" }, "Europe/Paris");
    setLang("en", mem);
    await api.report("aqa-1", { from: 0, to: 1, prevFrom: 0, kind: "week" }, "Europe/Paris");
    expect(calls[0]).toContain("lang=fr");
    expect(calls[1]).toContain("lang=en");
  });

  it("translates the last send failure of ntfy and the webhook", async () => {
    setLang("en", mem);
    stubFetch({ enabled: true, last: { at: 1, ok: false, error: "délai dépassé (5 s)" } });
    expect((await api.notify()).last?.error).toBe("timed out (5 s)");
    expect((await api.testWebhook()).last?.error).toBe("timed out (5 s)");
    stubFetch({ enabled: false, last: null });
    expect((await api.webhook()).last).toBeNull();
  });
});
