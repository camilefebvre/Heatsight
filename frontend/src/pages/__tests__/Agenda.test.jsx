import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Agenda from "../Agenda";

vi.mock("../../api", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "../../api";

const _now = new Date();
const _pad = (n) => String(n).padStart(2, "0");
// Aujourd'hui à 10:00, en local naïf → garanti dans la semaine visible et la plage 7-21h
const TODAY_10H = `${_now.getFullYear()}-${_pad(_now.getMonth() + 1)}-${_pad(_now.getDate())}T10:00`;
const EVENT = {
  id: "ev1", title: "Visite bâtiment", start: TODAY_10H,
  duration_min: 60, location: "Bruxelles", project_id: "", notes: "", type: "rdv",
};
const ok = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });

describe("Agenda - édition d'un événement (P20)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockImplementation((path, opts = {}) => {
      if (path === "/events" && !opts.method) return ok([EVENT]);
      if (path === "/projects") return ok([]);
      if (path === "/events/ev1" && opts.method === "PATCH") {
        const body = JSON.parse(opts.body);
        return ok({ ...EVENT, ...body });
      }
      return ok([]);
    });
  });

  it("Modifier pré-remplit le formulaire et PATCH met à jour l'événement", async () => {
    render(<Agenda />);
    // Le bloc apparaît dans la grille semaine
    await screen.findByText("Visite bâtiment");

    // Clic sur le bloc → ouverture de la modale en édition
    await userEvent.click(screen.getByTitle("Visite bâtiment"));
    expect(screen.getByDisplayValue("Visite bâtiment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enregistrer les modifications/i })).toBeInTheDocument();

    // Modification du titre + soumission (PATCH)
    const titre = screen.getByDisplayValue("Visite bâtiment");
    await userEvent.clear(titre);
    await userEvent.type(titre, "Visite bâtiment (reportée)");
    await userEvent.click(screen.getByRole("button", { name: /Enregistrer les modifications/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/events/ev1", expect.objectContaining({ method: "PATCH" }))
    );
    // Le bloc reflète le nouveau titre, et la modale s'est refermée (sortie du mode édition)
    await screen.findByText("Visite bâtiment (reportée)");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Enregistrer les modifications/i })).not.toBeInTheDocument()
    );
  });
});
