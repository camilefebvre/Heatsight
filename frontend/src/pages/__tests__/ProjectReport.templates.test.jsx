import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";

import ProjectReport from "../ProjectReport";

vi.mock("../../api", () => ({ apiFetch: vi.fn() }));
vi.mock("../../state/ProjectContext", () => ({ useProject: () => ({ setSelectedProjectId: vi.fn() }) }));

import { apiFetch } from "../../api";

const PROJECT = {
  id: "PROJ", project_name: "Projet X", client_name: "Client X", client_email: "c@x.be",
  building_address: "1 rue", building_type: "Résidentiel", audit_type: "Complet",
  status: "draft", excel_file: "x.xlsx", created_at: "2026-01-01T00:00:00Z",
  active_report_template_id: "tpl-custom-r",   // ← modèle PERSO actif
};
const OFFICIAL = { id: "official-report", type: "report", name: "Modèle officiel de rapport",
  is_official: true, supports_prefill: true, scope: "official", created_at: "2026-01-01T00:00:00Z", usage_count: 0 };
const CUSTOM = { id: "tpl-custom-r", type: "report", name: "Mon rapport",
  is_official: false, supports_prefill: false, scope: "user", created_at: "2026-01-02T00:00:00Z", usage_count: 1 };
const STATUS = { has_report_docx: true, report_docx_source: "manual_upload", report_prefilled_at: "2026-01-01T10:00:00Z" };

const ok = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });

function mockApi() {
  apiFetch.mockImplementation((path) => {
    if (path === "/projects") return ok([PROJECT]);
    if (path === "/templates?type=report") return ok([OFFICIAL, CUSTOM]);
    if (path.includes("/active-template")) return ok({ status: "ok" });
    if (path.endsWith("/report/status")) return ok(STATUS);
    return ok({});
  });
}

function renderReport() {
  return render(
    <MemoryRouter initialEntries={["/projects/PROJ/report"]}>
      <Routes>
        <Route path="/projects/:projectId/report" element={<ProjectReport />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProjectReport — gating modèle rapport", () => {
  beforeEach(() => { vi.clearAllMocks(); mockApi(); });

  it("modèle perso actif : prefill IA désactivé, download + import disponibles", async () => {
    const { container } = renderReport();
    await screen.findByText("Mon rapport");
    expect(screen.getByText("Officiel")).toBeInTheDocument();
    expect(screen.getByText("Perso")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText(/indisponible avec un modèle personnalisé/i)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /Analyser avec l'IA/i })).toBeDisabled();

    // chemin manuel préservé (download + import)
    expect(screen.getByRole("button", { name: /Télécharger la version courante/i })).toBeEnabled();
    expect(container.querySelector('input[type="file"]')).not.toBeDisabled();
  });

  it("repasser à l'officiel réactive le prefill IA (capacité remontée à la sélection)", async () => {
    renderReport();
    await screen.findByText("Mon rapport");
    await waitFor(() =>
      expect(screen.getByText(/indisponible avec un modèle personnalisé/i)).toBeInTheDocument()
    );

    await userEvent.click(screen.getAllByRole("radio")[0]); // officiel

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/projects/PROJ/active-template", expect.objectContaining({ method: "PATCH" }))
    );
    await waitFor(() =>
      expect(screen.queryByText(/indisponible avec un modèle personnalisé/i)).not.toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /Analyser avec l'IA/i })).toBeEnabled();
  });
});
