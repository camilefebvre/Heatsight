from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from uuid import uuid4
from datetime import datetime

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Models ---
class ProjectCreate(BaseModel):
    project_name: str
    client_name: str
    client_email: EmailStr
    client_phone: Optional[str] = None
    building_address: str
    building_type: str  # residential / tertiary / industrial / other
    audit_type: str     # AMUREBA / PEB / custom
    status: str = "draft"  # draft / in_progress / completed

class Project(ProjectCreate):
    id: str
    created_at: str

# --- In-memory DB (MVP) ---
PROJECTS: List[Project] = []

@app.get("/projects", response_model=List[Project])
def list_projects():
    return PROJECTS

@app.post("/projects", response_model=Project)
def create_project(payload: ProjectCreate):
    new_project = Project(
        id=str(uuid4()),
        created_at=datetime.utcnow().isoformat(),
        **payload.model_dump(),
    )
    PROJECTS.append(new_project)
    return new_project

from fastapi import HTTPException

@app.delete("/projects/{project_id}")
def delete_project(project_id: str):
    global PROJECTS
    before = len(PROJECTS)
    PROJECTS = [p for p in PROJECTS if p.id != project_id]

    if len(PROJECTS) == before:
        raise HTTPException(status_code=404, detail="Project not found")

    return {"status": "deleted", "id": project_id}

from fastapi import HTTPException
from pydantic import BaseModel

class ProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[EmailStr] = None
    client_phone: Optional[str] = None
    building_address: Optional[str] = None
    building_type: Optional[str] = None
    audit_type: Optional[str] = None
    status: Optional[str] = None  # draft / in_progress / on_hold / completed

@app.patch("/projects/{project_id}", response_model=Project)
def update_project(project_id: str, payload: ProjectUpdate):
    for i, p in enumerate(PROJECTS):
        if p.id == project_id:
            updated_data = p.model_dump()
            patch_data = payload.model_dump(exclude_unset=True)

            # merge
            updated_data.update(patch_data)

            updated_project = Project(**updated_data)
            PROJECTS[i] = updated_project
            return updated_project

    raise HTTPException(status_code=404, detail="Project not found")

