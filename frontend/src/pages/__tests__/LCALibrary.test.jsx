import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import LCALibrary from "../LCALibrary";

vi.mock("../../api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../../api";

// ── Données de test ───────────────────────────────────────────────────────────

const MAT_INCOMPLETE = {
  id: "mat-1",
  name: "Mur béton legacy",
  category: "mur",
  unit: "m²",
  prix: 85,
  valeur_r: 0.25,
  dvr_materiau: null,
  flux_reference: null,
  impacts: { gwp100: 120 },
};

const MAT_COMPLETE = {
  id: "mat-2",
  name: "Mur béton ACV2",
  category: "mur",
  unit: "m²",
  prix: 90,
  valeur_r: 0.30,
  dvr_materiau: 50,
  flux_reference: null,
  impacts: { gwp100: 110 },
};

function mockLoad(materials = []) {
  apiFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(materials),
  });
}

async function waitForLoaded() {
  await waitFor(() =>
    expect(screen.queryByText("Chargement…")).not.toBeInTheDocument()
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("LCALibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoad();
  });

  // ── 1. Affichage initial ──────────────────────────────────────────────────

  it("affiche le titre et le bouton import", async () => {
    render(<LCALibrary />);
    await waitForLoaded();

    expect(screen.getByText(/Bibliothèque ACV/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Importer un matériau/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vue ACV 2.0" })).not.toBeInTheDocument();
  });

  // ── 2. Ouverture de la modale d'import ────────────────────────────────────

  it("ouvre la modale d'import au clic sur le bouton Importer", async () => {
    render(<LCALibrary />);
    await waitForLoaded();

    await userEvent.click(
      screen.getByRole("button", { name: /Importer un matériau/ })
    );

    expect(screen.getByText("Importer un matériau XLSX")).toBeInTheDocument();
  });

  // ── 3. Champ DVR obligatoire présent dans la modale ───────────────────────

  it("affiche le champ DVR dans la modale d'import", async () => {
    render(<LCALibrary />);
    await waitForLoaded();
    await userEvent.click(
      screen.getByRole("button", { name: /Importer un matériau/ })
    );

    expect(screen.getByPlaceholderText("50")).toBeInTheDocument();
  });

  // ── 4. flux_reference masqué pour la catégorie Mur (défaut) ──────────────

  it("masque le champ flux_reference pour la catégorie Mur", async () => {
    render(<LCALibrary />);
    await waitForLoaded();
    await userEvent.click(
      screen.getByRole("button", { name: /Importer un matériau/ })
    );

    expect(screen.queryByPlaceholderText("8.5")).not.toBeInTheDocument();
  });

  // ── 5. flux_reference visible pour la catégorie Isolant ──────────────────

  it("affiche le champ flux_reference après sélection de la catégorie Isolant", async () => {
    render(<LCALibrary />);
    await waitForLoaded();
    await userEvent.click(
      screen.getByRole("button", { name: /Importer un matériau/ })
    );

    await userEvent.selectOptions(screen.getByDisplayValue("Mur"), "isolant");

    expect(screen.getByPlaceholderText("8.5")).toBeInTheDocument();
  });

  // ── 6. Bouton submit désactivé si DVR vide ────────────────────────────────

  it("désactive le bouton d'import tant que le champ DVR est vide", async () => {
    render(<LCALibrary />);
    await waitForLoaded();
    await userEvent.click(
      screen.getByRole("button", { name: /Importer un matériau/ })
    );

    const submitBtn = screen.getByRole("button", { name: /Importer le matériau/ });
    expect(submitBtn).toBeDisabled();
  });

  // ── 7. Pastille "Incomplet ACV" pour matériau sans DVR ──────────────────

  it("affiche la pastille 'Incomplet ACV' pour un matériau sans dvr_materiau", async () => {
    mockLoad([MAT_INCOMPLETE]);
    render(<LCALibrary />);

    await waitFor(() =>
      expect(screen.getByText("Incomplet ACV")).toBeInTheDocument()
    );
  });

  // ── 8. Pas de pastille pour un matériau complet ───────────────────────────

  it("n'affiche pas la pastille pour un matériau avec dvr_materiau renseigné (Mur)", async () => {
    mockLoad([MAT_COMPLETE]);
    render(<LCALibrary />);

    await waitFor(() =>
      expect(screen.getByText("Mur béton ACV2")).toBeInTheDocument()
    );
    expect(screen.queryByText("Incomplet ACV")).not.toBeInTheDocument();
  });

  // ── 9. Colonnes DVR et Flux réf. toujours visibles ───────────────────────

  it("affiche les colonnes DVR (ans) et Flux réf. en permanence", async () => {
    mockLoad([MAT_COMPLETE]);
    render(<LCALibrary />);
    await waitFor(() =>
      expect(screen.getByText("Mur béton ACV2")).toBeInTheDocument()
    );

    expect(screen.getByText("DVR (ans)")).toBeInTheDocument();
    expect(screen.getByText(/Flux réf\./)).toBeInTheDocument();
  });

  // ── 10. version=v2 envoyé dans FormData lors de la soumission ─────────────

  it("envoie version=v2 dans le FormData lors de la soumission du formulaire d'import", async () => {
    const appendSpy = vi.spyOn(FormData.prototype, "append");

    apiFetch.mockImplementation((url, opts) => {
      if (opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ id: "mat-new", name: "Béton test", impacts: {} }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<LCALibrary />);
    await waitForLoaded();

    await userEvent.click(
      screen.getByRole("button", { name: /Importer un matériau/ })
    );

    await userEvent.type(
      screen.getByPlaceholderText("Ex : Béton armé C25/30"),
      "Béton test"
    );
    await userEvent.type(
      screen.getByPlaceholderText("Ex : m² de mur"),
      "m² de mur"
    );
    await userEvent.type(screen.getByPlaceholderText("Ex : m²"), "m²");
    await userEvent.type(screen.getByPlaceholderText("85.00"), "80");
    await userEvent.type(screen.getByPlaceholderText("3.5"), "0.25");
    await userEvent.type(screen.getByPlaceholderText("50"), "30");

    const fileInput = document.querySelector('input[type="file"]');
    const xlsxFile = new File(["dummy"], "test.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await userEvent.upload(fileInput, xlsxFile);

    const submitBtn = screen.getByRole("button", { name: /Importer le matériau/ });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    await userEvent.click(submitBtn);

    const versionCall = appendSpy.mock.calls.find(([key]) => key === "version");
    expect(versionCall).toBeDefined();
    expect(versionCall[1]).toBe("v2");

    appendSpy.mockRestore();
  });
});
