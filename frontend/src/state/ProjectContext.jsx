import { createContext, useContext, useState } from "react";

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [selectedProjectId, setSelectedProjectId] = useState(null);

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
