from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Dict, Any
from uuid import uuid4
from datetime import datetime
import json
from pathlib import Path


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
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
    status: str = "draft"  # draft / in_progress / on_hold / completed

    audit_data: Dict[str, Any] = Field(default_factory=dict)

class Project(ProjectCreate):
    id: str
    created_at: str

class ProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[EmailStr] = None
    client_phone: Optional[str] = None
    building_address: Optional[str] = None
    building_type: Optional[str] = None
    audit_type: Optional[str] = None
    status: Optional[str] = None

# audit endpoint payload
class AuditUpdate(BaseModel):
    audit_data: Dict[str, Any]
    
DATA_FILE = Path(__file__).parent / "data.json"

if not DATA_FILE.exists():
    DATA_FILE.write_text("[]", encoding="utf-8")


def load_projects():
    try:
        if DATA_FILE.exists():
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f) or []
                return [Project(**p) for p in data]
    except Exception:
        return []
    return []

def save_projects():
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump([p.model_dump() for p in PROJECTS], f, indent=2, ensure_ascii=False)
    

# --- In-memory DB (MVP) ---
PROJECTS: List[Project] = load_projects()


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
    save_projects()
    return new_project

@app.patch("/projects/{project_id}", response_model=Project)
def update_project(project_id: str, payload: ProjectUpdate):
    for i, p in enumerate(PROJECTS):
        if p.id == project_id:
            updated_data = p.model_dump()
            patch_data = payload.model_dump(exclude_unset=True)
            updated_data.update(patch_data)

            updated_project = Project(**updated_data)
            PROJECTS[i] = updated_project
            save_projects()
            return updated_project
    raise HTTPException(status_code=404, detail="Project not found")

@app.delete("/projects/{project_id}")
def delete_project(project_id: str):
    global PROJECTS
    before = len(PROJECTS)
    PROJECTS = [p for p in PROJECTS if p.id != project_id]
    if len(PROJECTS) == before:
        raise HTTPException(status_code=404, detail="Project not found")
    save_projects()
    return {"status": "deleted", "id": project_id}

@app.get("/projects/{project_id}/audit")
def get_project_audit(project_id: str):
    project = next((p for p in PROJECTS if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project.audit_data

@app.patch("/projects/{project_id}/audit")
def update_project_audit(project_id: str, payload: AuditUpdate):
    for i, p in enumerate(PROJECTS):
        if p.id == project_id:
            updated = p.model_dump()
            updated["audit_data"] = payload.audit_data
            PROJECTS[i] = Project(**updated)
            save_projects()
            return {"status": "ok", "audit_data": PROJECTS[i].audit_data}
    raise HTTPException(status_code=404, detail="Project not found")
