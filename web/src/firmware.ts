import type { FirmwareRow } from "../../server/src/types";

// An image embeds its board's token: only that board can install it.
export function firmwareFor(list: FirmwareRow[], deviceId: string): FirmwareRow[] {
  return list.filter((f) => f.device_id === deviceId);
}
