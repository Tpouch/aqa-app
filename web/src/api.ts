import type {
  AggregateRow, AlertKind, AlertRow, AlertRule, AlertRuleValues, ApiKey, CommandRow, CommandType, DeviceReport, DeviceSummary, EventRow, FirmwareRow, FrameRow, NotifySettings, SoundCalibration, UnknownDevice, WebhookSettings,
} from "../../server/src/types";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

// Called on any 401 so the app can drop back to the login screen.
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin", headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.endsWith("/session")) onUnauthorized();
    throw new ApiError(res.status, (data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  session: () => request<{ authenticated: boolean }>("GET", "/api/v1/session"),
  login: (password: string) => request<{ authenticated: boolean }>("POST", "/api/v1/session", { password }),
  logout: () => request<{ authenticated: boolean }>("DELETE", "/api/v1/session"),

  devices: () => request<{ devices: DeviceSummary[]; unknown: UnknownDevice[] }>("GET", "/api/v1/devices"),
  device: (id: string) => request<DeviceSummary>("GET", `/api/v1/devices/${id}`),
  addDevice: (id: string, name: string) =>
    request<{ device: DeviceSummary; token: string }>("POST", "/api/v1/devices", { id, name }),
  updateDevice: (id: string, patch: { name?: string; sound_calibration?: SoundCalibration | null }) =>
    request<DeviceSummary>("PATCH", `/api/v1/devices/${id}`, patch),
  rotateToken: (id: string) => request<{ token: string }>("POST", `/api/v1/devices/${id}/token`),
  deleteDevice: (id: string) => request<void>("DELETE", `/api/v1/devices/${id}`),
  forgetUnknown: (id: string) => request<void>("DELETE", `/api/v1/unknown-devices/${id}`),

  frames: (id: string, from: number, to: number) =>
    request<{ frames: FrameRow[] }>("GET", `/api/v1/devices/${id}/frames?from=${from}&to=${to}&limit=50000`),
  aggregate: (id: string, from: number, to: number, step: number) =>
    request<{ step: number; buckets: AggregateRow[] }>(
      "GET", `/api/v1/devices/${id}/frames/aggregate?from=${from}&to=${to}&step=${step}`),

  report: (id: string, p: { from: number; to: number; prevFrom: number; kind: "week" | "month" }, tz: string) =>
    request<DeviceReport>("GET", `/api/v1/devices/${id}/report?from=${p.from}&to=${p.to}&prev_from=${p.prevFrom}` +
      `&kind=${p.kind}&tz=${encodeURIComponent(tz)}`),

  events: (id: string, limit = 200) => request<{ events: EventRow[] }>("GET", `/api/v1/devices/${id}/events?limit=${limit}`),

  commands: (id: string) => request<{ commands: CommandRow[] }>("GET", `/api/v1/devices/${id}/commands`),
  sendCommand: (id: string, type: CommandType, params?: Record<string, unknown>) =>
    request<CommandRow>("POST", `/api/v1/devices/${id}/commands`, params ? { type, params } : { type }),
  cancelCommand: (id: string, cid: string) => request<void>("DELETE", `/api/v1/devices/${id}/commands/${cid}`),

  alertRules: () => request<{ rules: AlertRule[] }>("GET", "/api/v1/alert-rules"),
  updateAlertRule: (kind: AlertKind, patch: Partial<AlertRuleValues>) =>
    request<AlertRule>("PATCH", `/api/v1/alert-rules/${kind}`, patch),
  resetAlertRules: () => request<{ rules: AlertRule[] }>("POST", "/api/v1/alert-rules/reset"),
  alerts: (id: string, before?: number, beforeId?: number) =>
    request<{ open: AlertRow[]; history: AlertRow[] }>(
      "GET", `/api/v1/devices/${id}/alerts${before === undefined ? "" : `?before=${before}${beforeId === undefined ? "" : `&before_id=${beforeId}`}`}`),

  notify: () => request<NotifySettings>("GET", "/api/v1/notify"),
  // token: a string replaces it, null removes it, absent keeps it.
  updateNotify: (patch: Partial<Pick<NotifySettings, "enabled" | "server" | "topic" | "notify_close">> & { token?: string | null }) =>
    request<NotifySettings>("PATCH", "/api/v1/notify", patch),
  testNotify: () => request<NotifySettings>("POST", "/api/v1/notify/test"),
  webhook: () => request<WebhookSettings>("GET", "/api/v1/webhook"),
  updateWebhook: (patch: Partial<Pick<WebhookSettings, "enabled" | "url" | "notify_close">> & { secret?: string | null }) =>
    request<WebhookSettings>("PATCH", "/api/v1/webhook", patch),
  testWebhook: () => request<WebhookSettings>("POST", "/api/v1/webhook/test"),

  firmware: () => request<{ firmware: FirmwareRow[] }>("GET", "/api/v1/firmware"),
  uploadFirmware: (form: FormData) => request<{ version: string; size: number }>("POST", "/api/v1/firmware", form),
  apiKeys: () => request<{ keys: ApiKey[] }>("GET", "/api/v1/api-keys"),
  createApiKey: (name: string) => request<ApiKey & { key: string }>("POST", "/api/v1/api-keys", { name }),
  deleteApiKey: (id: number) => request<void>("DELETE", `/api/v1/api-keys/${id}`),
  deleteFirmware: (version: string) => request<void>("DELETE", `/api/v1/firmware/${encodeURIComponent(version)}`),
};
