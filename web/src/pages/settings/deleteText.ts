import { t } from "../../i18n/dict";

// Deleting a board: say where the app goes next. With other boards left it
// shows the first of them (App's sorted list), not the add-a-board screen.
export function deleteBody(next: string | null): string {
  const w = t().settings;
  return w.deleteBody(next === null ? w.afterNone : w.afterNext(next));
}

export function deletedToast(name: string, next: string | null): string {
  const w = t().settings;
  return next === null ? w.deleted(name) : w.deletedNext(name, next);
}
