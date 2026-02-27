from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, Dict, Any, List


# ──────────────────────────────────────────
# Projects
# ──────────────────────────────────────────
class ProjectCreate(BaseModel):
    project_name: str
    client_name: str
    client_email: EmailStr
    client_phone: Optional[str] = None
    building_address: str
    building_type: str
    audit_type: str
    status: str = "draft"


class Project(ProjectCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: str
    excel_file: str


VALID_STATUSES = {"draft", "in_progress", "on_hold", "completed"}


class ProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[EmailStr] = None
    client_phone: Optional[str] = None
    building_address: Optional[str] = None
    building_type: Optional[str] = None
    audit_type: Optional[str] = None
    status: Optional[str] = None

    def model_post_init(self, _context):
        if self.status is not None and self.status not in VALID_STATUSES:
            raise ValueError(
                f"status invalide '{self.status}'. Valeurs acceptées : {VALID_STATUSES}"
            )


# ──────────────────────────────────────────
# Audit
# ──────────────────────────────────────────
class AuditUpdate(BaseModel):
    audit_data: Dict[str, Any]


# ──────────────────────────────────────────
# Energy accounting
# ──────────────────────────────────────────
class EnergyAccountingUpdate(BaseModel):
    energy_accounting: Dict[str, Any]


class EnergyYearImportRequest(BaseModel):
    year: str  # ex "2023"


# ──────────────────────────────────────────
# Report
# ──────────────────────────────────────────
class ReportUpdate(BaseModel):
    report_data: Dict[str, Any]


# ──────────────────────────────────────────
# Events
# ──────────────────────────────────────────
class EventCreate(BaseModel):
    title: str
    start: str                          # ISO datetime ex "2026-02-27T09:00"
    duration_min: Optional[int] = 60
    location: Optional[str] = None
    project_id: Optional[str] = None
    notes: Optional[str] = None


class EventSchema(EventCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str


# ──────────────────────────────────────────
# Client requests
# ──────────────────────────────────────────
class ClientRequestCreate(BaseModel):
    project_id: Optional[str] = None
    client_email: str
    message: Optional[str] = None
    status: str = "sent"
    sent_at: Optional[str] = None
    documents: List[Dict[str, Any]] = Field(default_factory=list)
    feedback: Optional[str] = None
    received_files: List[Dict[str, Any]] = Field(default_factory=list)


class ClientRequestSchema(ClientRequestCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str


class ClientRequestPatch(BaseModel):
    status: Optional[str] = None
    documents: Optional[List[Dict[str, Any]]] = None
    feedback: Optional[str] = None
    received_files: Optional[List[Dict[str, Any]]] = None
