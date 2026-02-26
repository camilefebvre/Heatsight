import { createContext, useContext, useState } from "react";

const STORAGE_KEY = "heatsight_selected_project_id";

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [selectedProjectId, setSelectedProjectIdState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || null
  );

  function setSelectedProjectId(id) {
    setSelectedProjectIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return (
    <ProjectContext.Provider value={{ selectedProjectId, setSelectedProjectId }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside ProjectProvider");
  return ctx;
}
