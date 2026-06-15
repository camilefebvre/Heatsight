import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";

import ProjectPlanAmelioration from "../ProjectPlanAmelioration";

vi.mock("../../api", () => ({ apiFetch: vi.fn() }));
vi.mock("../../state/ProjectContext", () => ({
  useProject: () => ({ setSelectedProjectId: vi.fn() }),
}));

import { apiFetch } from "../../api";

// ── Données mockées ───────────────────────────────────────────────────────────
const PROJECT = {
  id: "PROJ", project_name: "Projet X", client_name: "Client X",
  client_email: "c@x.be", building_address: "1 rue", building_type: "Résidentiel",
  audit_type: "Complet", status: "draft", excel_file: "x.xlsx",
  created_at: "2026-01-01T00:00:00Z",
  active_audit_template_id: "tpl-custom",   // ← un modèle PERSO est actif
};
const OFFICIAL = { id: "official-audit", type: "audit", name: "Modèle officiel AMUREBA",
  is_official: true, supports_prefill: true, scope: "official", created_at: "2026-01-01T00:00:00Z", usage_count: 0 };
const CUSTOM = { id: "tpl-custom", type: "audit", name: "Mon modèle",
  is_official: false, supports_prefill: false, scope: "user", created_at: "2026-01-02T00:00:00Z", usage_count: 1 };
const PREFILL_STATUS = { has_prefilled_excel: true, current_excel_source: "ai_prefill", prefilled_at: "2026-01-01T10:00:00Z" };

const ok = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });

function mockApi() {
  apiFetch.mockImplementation((path) => {
    if (path === "/projects") return ok([PROJECT]);
    if (path === "/templates?type=audit") return ok([OFFICIAL, CUSTOM]);
    if (path.includes("/active-template")) return ok({ status: "ok" });
    if (path.endsWith("/prefill-status")) return ok(PREFILL_STATUS);
    if (path.endsWith("/improvement-actions")) return ok([]);
    return ok([]);
  });
}

function renderAudit() {
  return render(
    <MemoryRouter initialEntries={["/projects/PROJ/audit"]}>
      <Routes>
        <Route path="/projects/:projectId/audit" element={<ProjectPlanAmelioration />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProjectPlanAmelioration - gating modèle audit", () => {
  beforeEach(() => { vi.clearAllMocks(); mockApi(); });

  it("modèle perso actif : prefill IA désactivé, export + import disponibles", async () => {
    renderAudit();

    // Page + panneau chargés
    await screen.findByText("Mon modèle");
    expect(screen.getByText("Officiel")).toBeInTheDocument();
    expect(screen.getByText("Perso")).toBeInTheDocument();

    // Gating : indice + bouton prefill IA désactivé
    await waitFor(() =>
      expect(screen.getByText(/indisponible avec un modèle personnalisé/i)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /Relancer l'analyse IA/i })).toBeDisabled();

    // Export + import NON affectés par le gating
    expect(screen.getByRole("button", { name: /Télécharger la version courante/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Uploader l'Excel complété/i })).toBeEnabled();
  });

  it("repasser au modèle officiel réactive le prefill IA (capacité remontée à la sélection)", async () => {
    renderAudit();
    await screen.findByText("Mon modèle");
    await waitFor(() =>
      expect(screen.getByText(/indisponible avec un modèle personnalisé/i)).toBeInTheDocument()
    );

    // Sélectionne le modèle officiel (1er radio)
    const radios = screen.getAllByRole("radio");
    await userEvent.click(radios[0]);

    // PATCH active-template appelé, capacité remontée → prefill réactivé
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/projects/PROJ/active-template",
        expect.objectContaining({ method: "PATCH" })
      )
    );
    await waitFor(() =>
      expect(screen.queryByText(/indisponible avec un modèle personnalisé/i)).not.toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /Relancer l'analyse IA/i })).toBeEnabled();
  });
});
