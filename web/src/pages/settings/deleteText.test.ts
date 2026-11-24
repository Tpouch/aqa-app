import { describe, expect, it } from "vitest";
import { deleteBody, deletedToast } from "./deleteText";

describe("texte de la suppression", () => {
  it("dernière carte : retour à l'écran d'ajout", () => {
    expect(deleteBody(null)).toContain("tu reviendras à l'écran d'ajout");
    expect(deletedToast("salon", null)).toBe("salon supprimée.");
  });
  it("une autre carte reste : on dit laquelle s'affichera", () => {
    expect(deleteBody("Chambre")).toContain("tu passeras sur Chambre");
    expect(deleteBody("Chambre")).not.toContain("écran d'ajout");
    expect(deletedToast("salon", "Chambre")).toBe("salon supprimée. Tu vois maintenant Chambre.");
  });
  it("rappelle toujours d'exporter avant", () => expect(deleteBody("Chambre")).toContain("exporte les données (CSV) avant"));
});
