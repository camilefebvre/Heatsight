from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Dict, Any
from uuid import uuid4
from datetime import datetime
import json
from pathlib import Path
from shutil import copyfile, move
from openpyxl import load_workbook
import subprocess
import tempfile

# ==============================
# CONFIG
# ==============================
SOFFICE = "/Applications/LibreOffice.app/Contents/MacOS/soffice"

BASE_DIR = Path(__file__).parent
DATA_FILE = BASE_DIR / "data.json"
TEMPLATE_FILE = BASE_DIR / "templates" / "audit_template.xlsx"
EXCEL_DIR = BASE_DIR / "excel"
EXCEL_DIR.mkdir(exist_ok=True)

SHEET_NAME = "2023"  # <-- adapte si ta feuille s'appelle autrement

# Emplacement des titres (fixes)
TITLE_ROWS = {
    "operational": 5,  # B5
    "buildings": 8,    # B8
    "transport": 11,   # B11
    "utility": 14,     # B14
}

# Début des lignes de saisie (juste sous le titre)
SECTION_START_ROW = {
    "operational": 6,  # B6..
    "buildings": 9,
    "transport": 12,
    "utility": 15,
}



# ⚠️ correspond à ton template (nombre de lignes dispo sous chaque titre)
MAX_ROWS_PER_SECTION = 2

INFLUENCE_START_ROW = 6
INFLUENCE_MAX_ROWS = 8  # lignes 6..13


INDICES_CELLS = {
    "primary": {"IEE": "B43", "IC": "B44", "iSER": "B45"},
    "secondary": {"AEE": "B49", "iCO2": "B50", "ACO2": "B51"},
}


# ==============================
# FASTAPI APP
# ==============================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================
# MODELS
# ==============================
class ProjectCreate(BaseModel):
    project_name: str
    client_name: str
    client_email: EmailStr
    client_phone: Optional[str] = None
    building_address: str
    building_type: str
    audit_type: str
    status: str = "draft"
    audit_data: Dict[str, Any] = Field(default_factory=dict)
    energy_accounting: Dict[str, Any] = Field(default_factory=dict)

    


class Project(ProjectCreate):
    id: str
    created_at: str
    excel_file: str

class AuditUpdate(BaseModel):
    audit_data: Dict[str, Any]
    
class EnergyAccountingUpdate(BaseModel):
    energy_accounting: Dict[str, Any]

class EnergyYearImportRequest(BaseModel):
    year: str  # ex: "2023"
    
class ProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[EmailStr] = None
    client_phone: Optional[str] = None
    building_address: Optional[str] = None
    building_type: Optional[str] = None
    audit_type: Optional[str] = None
    status: Optional[str] = None



# ==============================
# PERSISTENCE JSON
# ==============================
if not DATA_FILE.exists():
    DATA_FILE.write_text("[]", encoding="utf-8")

def load_projects() -> List[Project]:
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8")) or []
        return [Project(**p) for p in data]
    except Exception:
        return []

def save_projects(projects: List[Project]) -> None:
    DATA_FILE.write_text(
        json.dumps([p.model_dump() for p in projects], indent=2, ensure_ascii=False),
        encoding="utf-8"
    )

PROJECTS: List[Project] = load_projects()


# ==============================
# HELPERS EXCEL
# ==============================
def _to_number(v: Any):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    s = str(v).strip()
    if s == "":
        return None
    s = s.replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None

def _set_cell(ws, addr: str, value: Any, numeric: bool = False):
    if numeric:
        n = _to_number(value)
        ws[addr].value = n
        if n is not None:
            ws[addr].number_format = "0.00"
    else:
        ws[addr].value = value if value is not None else ""

def _get_sheet(wb):
    if SHEET_NAME in wb.sheetnames:
        return wb[SHEET_NAME]
    return wb.active

def recalc_excel_in_place(excel_path: Path) -> None:
    """
    Recalcule via LibreOffice headless en générant un nouveau .xlsx puis en remplaçant l'original.
    => permet à openpyxl(data_only=True) de lire des valeurs calculées au lieu des formules.
    """
    if not excel_path.exists():
        return

    # Si soffice absent, on ne bloque pas (MVP)
    if not Path(SOFFICE).exists():
        return

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)

        subprocess.run(
            [
                SOFFICE,
                "--headless",
                "--nologo",
                "--nolockcheck",
                "--norestore",
                "--convert-to",
                "xlsx",
                "--outdir",
                str(tmpdir),
                str(excel_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        generated = tmpdir / excel_path.name
        if not generated.exists():
            # fallback: prend le premier .xlsx généré
            cands = list(tmpdir.glob("*.xlsx"))
            if cands:
                generated = cands[0]

        if generated.exists():
            move(str(generated), str(excel_path))

def write_audit_to_excel(project: Project, audit_data: Dict[str, Any]) -> None:
    excel_path = EXCEL_DIR / project.excel_file
    if not excel_path.exists():
        return

    wb = load_workbook(excel_path)
    ws = _get_sheet(wb)

    year = (audit_data or {}).get("year2023", {}) or {}

    # 1) Titles fixes (col B)
    _set_cell(ws, f"B{TITLE_ROWS['operational']}", "Activité opérationnelle")
    _set_cell(ws, f"B{TITLE_ROWS['buildings']}", "Bâtiments")
    _set_cell(ws, f"B{TITLE_ROWS['transport']}", "Transport")
    _set_cell(ws, f"B{TITLE_ROWS['utility']}", "Utilité")

    # 2) Utility headers (G3/G4, H3/H4)
    headers = year.get("utility_headers", {}) or {}
    _set_cell(ws, "G3", headers.get("util1_name", ""))
    _set_cell(ws, "G4", headers.get("util1_unit", ""))
    _set_cell(ws, "H3", headers.get("util2_name", ""))
    _set_cell(ws, "H4", headers.get("util2_unit", ""))

    # 3) Sections table (B..I)
    col_map = {
        "name": "B",
        "electricity": "C",
        "gas": "D",
        "fuel": "E",
        "biogas": "F",
        "util1": "G",
        "util2": "H",
        "process": "I",
    }
    numeric_fields = {"electricity", "gas", "fuel", "biogas", "util1", "util2", "process"}

    for section_key in ["operational", "buildings", "transport", "utility"]:
        rows = year.get(section_key, []) or []
        start_row = SECTION_START_ROW[section_key]

        # reset bloc
        for r in range(MAX_ROWS_PER_SECTION):
            excel_row = start_row + r
            for field, col in col_map.items():
                addr = f"{col}{excel_row}"
                _set_cell(ws, addr, "" if field == "name" else None, numeric=(field in numeric_fields))

        # write (clamp)
        for idx, row in enumerate(rows[:MAX_ROWS_PER_SECTION]):
            excel_row = start_row + idx
            _set_cell(ws, f"B{excel_row}", row.get("name", ""))
            _set_cell(ws, f"C{excel_row}", row.get("electricity", None), numeric=True)
            _set_cell(ws, f"D{excel_row}", row.get("gas", None), numeric=True)
            _set_cell(ws, f"E{excel_row}", row.get("fuel", None), numeric=True)
            _set_cell(ws, f"F{excel_row}", row.get("biogas", None), numeric=True)
            _set_cell(ws, f"G{excel_row}", row.get("util1", None), numeric=True)
            _set_cell(ws, f"H{excel_row}", row.get("util2", None), numeric=True)
            _set_cell(ws, f"I{excel_row}", row.get("process", None), numeric=True)

    # 4) Facteurs d'influence (L/M/N), lignes 6..13
    influence = year.get("influence_factors", []) or []
    for i in range(INFLUENCE_MAX_ROWS):
        excel_row = INFLUENCE_START_ROW + i
        _set_cell(ws, f"L{excel_row}", "")
        _set_cell(ws, f"M{excel_row}", None, numeric=True)
        _set_cell(ws, f"N{excel_row}", "")

    for i, row in enumerate(influence[:INFLUENCE_MAX_ROWS]):
        excel_row = INFLUENCE_START_ROW + i
        _set_cell(ws, f"L{excel_row}", row.get("description", ""))
        _set_cell(ws, f"M{excel_row}", row.get("value", None), numeric=True)
        _set_cell(ws, f"N{excel_row}", row.get("unit", ""))

    # 6) Factures / Compteur entrée (C19..I19)
    invoice = year.get("invoice_meter", {}) or {}
    _set_cell(ws, "C19", invoice.get("electricity", None), numeric=True)
    _set_cell(ws, "D19", invoice.get("gas", None), numeric=True)
    _set_cell(ws, "E19", invoice.get("fuel", None), numeric=True)
    _set_cell(ws, "F19", invoice.get("biogas", None), numeric=True)
    _set_cell(ws, "G19", invoice.get("util1", None), numeric=True)
    _set_cell(ws, "H19", invoice.get("util2", None), numeric=True)
    _set_cell(ws, "I19", invoice.get("process", None), numeric=True)

    wb.save(excel_path)


def read_indices_from_excel(excel_path: Path) -> Dict[str, Any]:
    """
    Lit les VALEURS calculées (data_only=True) dans les cellules B43.. etc.
    """
    wb = load_workbook(excel_path, data_only=True)
    ws = wb[SHEET_NAME] if SHEET_NAME in wb.sheetnames else wb.active

    def clean(v: Any):
        if v is None:
            return ""
        if isinstance(v, (int, float)):
            return v
        s = str(v).strip()
        s2 = s.replace(" ", "").replace(",", ".")
        try:
            return float(s2)
        except Exception:
            return s

    return {
        "primary": {k: clean(ws[addr].value) for k, addr in INDICES_CELLS["primary"].items()},
        "secondary": {k: clean(ws[addr].value) for k, addr in INDICES_CELLS["secondary"].items()},
    }


# ==============================
# ROUTES
# ==============================
@app.get("/projects", response_model=List[Project])
def list_projects():
    return PROJECTS

@app.post("/projects", response_model=Project)
def create_project(payload: ProjectCreate):
    project_id = str(uuid4())
    excel_name = f"{project_id}.xlsx"
    excel_path = EXCEL_DIR / excel_name

    if not TEMPLATE_FILE.exists():
        raise HTTPException(status_code=500, detail="Excel template not found")

    copyfile(TEMPLATE_FILE, excel_path)

    new_project = Project(
        id=project_id,
        created_at=datetime.utcnow().isoformat(),
        excel_file=excel_name,
        **payload.model_dump(),
    )
    PROJECTS.append(new_project)
    save_projects(PROJECTS)
    return new_project

@app.patch("/projects/{project_id}", response_model=Project)
def update_project(project_id: str, payload: ProjectUpdate):
    for i, p in enumerate(PROJECTS):
        if p.id == project_id:
            updated = p.model_dump()
            patch = payload.model_dump(exclude_unset=True)
            updated.update(patch)

            PROJECTS[i] = Project(**updated)
            save_projects(PROJECTS)
            return PROJECTS[i]

    raise HTTPException(status_code=404, detail="Project not found")


@app.delete("/projects/{project_id}")
def delete_project(project_id: str):
    global PROJECTS
    before = len(PROJECTS)
    PROJECTS = [p for p in PROJECTS if p.id != project_id]
    if len(PROJECTS) == before:
        raise HTTPException(status_code=404, detail="Project not found")
    save_projects(PROJECTS)
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
            
            year = payload.audit_data.get("year2023", {})
            if isinstance(year, dict) and "specifics" in year:
                year.pop("specifics", None)


            # persist JSON
            save_projects(PROJECTS)

            # write excel
            write_audit_to_excel(PROJECTS[i], payload.audit_data)

            # recalc formules => overwrite file
            excel_path = EXCEL_DIR / PROJECTS[i].excel_file
            try:
                recalc_excel_in_place(excel_path)
            except Exception:
                pass

            return {"status": "ok", "audit_data": PROJECTS[i].audit_data}

    raise HTTPException(status_code=404, detail="Project not found")

@app.get("/projects/{project_id}/excel")
def download_project_excel(project_id: str):
    project = next((p for p in PROJECTS if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    excel_path = EXCEL_DIR / project.excel_file
    if not excel_path.exists():
        raise HTTPException(status_code=404, detail="Excel file not found")

    return FileResponse(
        path=str(excel_path),
        filename=f"HeatSight_{project.project_name}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

@app.get("/projects/{project_id}/indices")
def get_indices(project_id: str):
    project = next((p for p in PROJECTS if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    excel_path = EXCEL_DIR / project.excel_file
    if not excel_path.exists():
        raise HTTPException(status_code=404, detail="Excel file not found")

    # (optionnel) recalc à la demande pour être sûr
    try:
        recalc_excel_in_place(excel_path)
    except Exception:
        pass

    return read_indices_from_excel(excel_path)

@app.get("/projects/{project_id}/energy-accounting")
def get_energy_accounting(project_id: str):
    project = next((p for p in PROJECTS if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project.energy_accounting or {}


@app.patch("/projects/{project_id}/energy-accounting")
def update_energy_accounting(project_id: str, payload: EnergyAccountingUpdate):
    for i, p in enumerate(PROJECTS):
        if p.id == project_id:
            updated = p.model_dump()
            updated["energy_accounting"] = payload.energy_accounting
            PROJECTS[i] = Project(**updated)
            save_projects(PROJECTS)
            return {"status": "ok", "energy_accounting": PROJECTS[i].energy_accounting}
    raise HTTPException(status_code=404, detail="Project not found")


@app.post("/projects/{project_id}/energy-accounting/import-from-audit")
def import_energy_from_audit(project_id: str, payload: EnergyYearImportRequest):
    """
    MVP: crée/écrase l'année demandée dans energy_accounting à partir des données audit (year2023).
    """
    for i, p in enumerate(PROJECTS):
        if p.id == project_id:
            audit = (p.audit_data or {}).get("year2023", {})
            year = payload.year

            # Helper: somme une colonne sur toutes les sections
            def sum_field(rows, field):
                total = 0.0
                for r in rows or []:
                    v = r.get(field, None)
                    if v is None or str(v).strip() == "":
                        continue
                    try:
                        s = str(v).replace(" ", "").replace(",", ".")
                        total += float(s)
                    except:
                        pass
                return total

            sections = ["operational", "buildings", "transport", "utility"]
            all_rows = []
            for sk in sections:
                all_rows += (audit.get(sk, []) or [])

            # Totaux simples (tu peux enrichir plus tard)
            imported_year = {
                "year": year,
                "totals": {
                    "electricity": sum_field(all_rows, "electricity"),
                    "gas": sum_field(all_rows, "gas"),
                    "fuel": sum_field(all_rows, "fuel"),
                    "biogas": sum_field(all_rows, "biogas"),
                    "util1": sum_field(all_rows, "util1"),
                    "util2": sum_field(all_rows, "util2"),
                    "process": sum_field(all_rows, "process"),
                },
                # “details” optionnel pour garder des lignes
                "details": {
                    "operational": audit.get("operational", []),
                    "buildings": audit.get("buildings", []),
                    "transport": audit.get("transport", []),
                    "utility": audit.get("utility", []),
                },
                "notes": "",
            }

            existing = p.energy_accounting or {}
            years = existing.get("years", {}) if isinstance(existing, dict) else {}
            years[str(year)] = imported_year

            new_energy = { **existing, "years": years }

            updated = p.model_dump()
            updated["energy_accounting"] = new_energy
            PROJECTS[i] = Project(**updated)
            save_projects(PROJECTS)

            return {"status": "ok", "energy_accounting": PROJECTS[i].energy_accounting}

    raise HTTPException(status_code=404, detail="Project not found")

