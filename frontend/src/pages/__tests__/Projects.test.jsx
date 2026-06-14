import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";

import Projects from "../Projects";

vi.mock("../../api", () => ({ apiFetch: vi.fn() }));
vi.mock("../../state/ProjectContext", () => ({
  useProject: () => ({ setSelectedProjectId: vi.fn(), selectedProjectId: null }),
}));

import { apiFetch } from "../../api";

const PROJECTS = [
  { id: "a", project_name: "Alpha", client_name: "Zorro", client_email: "a@x.be",
    building_address: "1 r", building_type: "residential", audit_type: "AMUREBA",
    status: "draft", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
  { id: "b", project_name: "Beta", client_name: "Yann", client_email: "b@x.be",
    building_address: "2 r", building_type: "tertiary", audit_type: "PEB",
    status: "completed", created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-02T00:00:00Z" },
  { id: "c", project_name: "Gamma", client_name: "Xavier", client_email: "c@x.be",
    building_address: "3 r", building_type: "industrial", audit_type: "AMUREBA",
    status: "in_progress", created_at: "2026-02-01T00:00:00Z", updated_at: "2026-02-05T00:00:00Z" },
];

const ok = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });

function rowNames() {
  // 1re cellule de chaque ligne du tbody = nom du projet
  return [...document.querySelectorAll("tbody tr")].map(
    (tr) => tr.querySelector("td")?.textContent?.trim()
  );
}

function renderProjects() {
  return render(<MemoryRouter><Projects /></MemoryRouter>);
}

describe("Projects — tri + filtres (P10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockImplementation((path) => (path === "/projects" ? ok(PROJECTS) : ok([])));
  });

  it("tri par défaut = créé le desc (Beta, Gamma, Alpha)", async () => {
    renderProjects();
    await screen.findByText("Alpha");
    expect(rowNames()).toEqual(["Beta", "Gamma", "Alpha"]);
  });

  it("clic sur l'en-tête Projet trie par nom asc (Alpha, Beta, Gamma)", async () => {
    renderProjects();
    await screen.findByText("Alpha");
    await userEvent.click(screen.getByText("Projet"));
    expect(rowNames()).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("recherche réduit la liste (nom + client)", async () => {
    renderProjects();
    await screen.findByText("Alpha");
    await userEvent.type(screen.getByPlaceholderText(/Rechercher un projet/i), "xavier");
    await waitFor(() => expect(rowNames()).toEqual(["Gamma"]));  // match sur le client
  });

  it("filtre statut réduit la liste", async () => {
    renderProjects();
    await screen.findByText("Alpha");
    const [statusSelect] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(statusSelect, "completed");
    await waitFor(() => expect(rowNames()).toEqual(["Beta"]));
  });
});
