// Deleting a board: say where the app goes next. With other boards left it
// shows the first of them (App's sorted list), not the add-a-board screen.
export function deleteBody(next: string | null): string {
  const after = next === null ? "tu reviendras à l'écran d'ajout" : `tu passeras sur ${next}`;
  return `La carte et TOUTES ses mesures, commandes et entrées de journal seront effacées, et ${after}. C'est définitif : exporte les données (CSV) avant.`;
}

export function deletedToast(name: string, next: string | null): string {
  return next === null ? `${name} supprimée.` : `${name} supprimée. Tu vois maintenant ${next}.`;
}
