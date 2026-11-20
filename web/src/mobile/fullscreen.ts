// Full screen + landscape lock for the chart: a bonus where the browser allows
// it (Android Chrome, after a tap). Elsewhere (iPhone Safari, a link opened
// directly) every call fails quietly and the chart simply fills the page.
type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

export async function enterLandscape(): Promise<void> {
  try {
    // Called synchronously from the tap handler: the request below runs before the first await.
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    await (screen.orientation as LockableOrientation | undefined)?.lock?.("landscape");
  } catch {
    // Not allowed here: the chart fills the page instead.
  }
}

export function exitLandscape(): void {
  try {
    screen.orientation?.unlock?.();
  } catch {
    // Nothing was locked.
  }
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
