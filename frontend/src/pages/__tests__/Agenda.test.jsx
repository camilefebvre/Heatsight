import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Agenda from "../Agenda";

vi.mock("../../api", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "../../api";

const EVENT = {
  id: "ev1", title: "Visite bâtiment", start: "2026-03-01T09:00",
  duration_min: 60, location: "Bruxelles", project_id: "", notes: "",
};
const ok = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });

describe("Agenda — édition d'un événement (P20)", () => {
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
    await screen.findByText("Visite bâtiment");

    // Entrée en mode édition
    await userEvent.click(screen.getByTitle("Modifier"));
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
    // La liste reflète le nouveau titre, et on est sorti du mode édition
    await screen.findByText("Visite bâtiment (reportée)");
    expect(screen.getByRole("button", { name: /\+ Ajouter l'événement/i })).toBeInTheDocument();
  });
});
