from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, Dict, Any, List


# ──────────────────────────────────────────
# Auth
# ──────────────────────────────────────────
class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    full_name: str
    email: str


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
    field_sources: Optional[Dict[str, Any]] = None


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
    field_sources: Optional[Dict[str, Any]] = None


class ReportApplyPrefill(BaseModel):
    fields: Dict[str, str] = Field(default_factory=dict)
    field_sources: Optional[Dict[str, Any]] = None


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


# ──────────────────────────────────────────
# LCA
# ──────────────────────────────────────────
class LcaMaterialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    category: str
    functional_unit: str
    unit: str
    impacts: Dict[str, float]
    prix: Optional[float] = None
    valeur_r: Optional[float] = None
    is_fixed: bool = False
    flux_reference: Optional[float] = None


class LcaMaterialPatch(BaseModel):
    prix: Optional[float] = None
    valeur_r: Optional[float] = None
    is_fixed: Optional[bool] = None
    flux_reference: Optional[float] = None


class LcaElement(BaseModel):
    material_id: str
    material_name: str
    category: str
    quantity: float
    unit: str
    impacts: Dict[str, float]   # valeurs par unité fonctionnelle (copiées du matériau)
    is_fixed: bool = False


class LcaProjectUpdate(BaseModel):
    elements: List[LcaElement]


class LcaParoisUpdate(BaseModel):
    parois: List[Dict[str, Any]]


class LcaBatimentUpdate(BaseModel):
    batiment: Dict[str, Any]


# ──────────────────────────────────────────
# Project Documents
# ──────────────────────────────────────────
class ProjectDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    owner_id: str
    filename: str
    original_name: str
    file_type: str
    doc_type: str
    status: str
    extracted_data: Optional[Dict[str, Any]] = None
    created_at: str


# ──────────────────────────────────────────
# Improvement Actions (Plan d'Amélioration)
# ──────────────────────────────────────────
class ImprovementActionCreate(BaseModel):
    reference: Optional[str] = None
    intitule: str
    type_amelioration: Optional[str] = None
    classification: Optional[str] = None
    conditions_prealables: Optional[str] = None
    investissement: Optional[float] = None
    economie_energie: Optional[float] = None
    economie_co2: Optional[float] = None
    duree_amortissement: Optional[int] = None
    irr_avant_impot: Optional[float] = None
    pbt_avant_impot: Optional[float] = None
    irr_apres_impot: Optional[float] = None
    pbt_apres_impot: Optional[float] = None
    entreprise_ets: Optional[bool] = None
    deduction_fiscale: Optional[bool] = None
    description: Optional[str] = None
    situation_existante: Optional[str] = None


class ImprovementActionUpdate(BaseModel):
    reference: Optional[str] = None
    intitule: Optional[str] = None
    type_amelioration: Optional[str] = None
    classification: Optional[str] = None
    conditions_prealables: Optional[str] = None
    investissement: Optional[float] = None
    economie_energie: Optional[float] = None
    economie_co2: Optional[float] = None
    duree_amortissement: Optional[int] = None
    irr_avant_impot: Optional[float] = None
    pbt_avant_impot: Optional[float] = None
    irr_apres_impot: Optional[float] = None
    pbt_apres_impot: Optional[float] = None
    entreprise_ets: Optional[bool] = None
    deduction_fiscale: Optional[bool] = None
    description: Optional[str] = None
    situation_existante: Optional[str] = None


class ImprovementActionSchema(ImprovementActionCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    owner_id: str
    created_at: str


# ──────────────────────────────────────────
# Amelioration Actions (JSONB flexible store)
# ──────────────────────────────────────────
class AmeliorationActionOut(BaseModel):
    """Response schema for one imported AA sheet."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    sheet_name: str
    action_data: Optional[Dict[str, Any]] = None
    created_at: str
    updated_at: Optional[str] = None


class ChangeItem(BaseModel):
    """Un changement proposé par le pré-remplissage IA (texte ou numérique)."""
    sheet: str                           # ex: "AA1"
    cell: str                            # ex: "G61"
    field: str                           # ex: "investissement_k_eur"
    label: str                           # ex: "AA1 → Investissement (k€)"
    value: Any
    is_numeric: bool
    source: Optional[Dict[str, Any]] = None
    selected: bool = True


class ApplyPrefillRequest(BaseModel):
    changes: List[ChangeItem]


class HistoryEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    owner_id: str
    action_type: str
    changes: Optional[Dict[str, Any]] = None
    created_at: str


class ImportPreviewSheet(BaseModel):
    """Summary for one sheet in a preview response."""
    sheet_name: str
    row_count: int
    detected_headers: List[str]
    key_values: Dict[str, Any]
    unmapped_headers: List[str]
    missing_semantic_fields: List[str]


class ImportPreviewResponse(BaseModel):
    """Full preview response before confirming an import."""
    filename: str
    sheet_names: List[str]          # all non-empty sheets found
    sheets: List[ImportPreviewSheet]
    total_rows: int


class ImportResponse(BaseModel):
    """Response after a successful import (data saved to DB)."""
    imported_sheets: int
    sheet_names: List[str]
    filename: str
    imported_at: str
