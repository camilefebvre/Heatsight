import { Outlet } from "react-router-dom";
import ProjectBreadcrumb from "../ui/ProjectBreadcrumb";

export default function ProjectLayout() {
  return (
    <>
      <ProjectBreadcrumb />
      <Outlet />
    </>
  );
}
