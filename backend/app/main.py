from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import List, Dict, Any, Optional
from uuid import uuid4
from datetime import datetime, timezone
from pathlib import Path
from shutil import copyfile, move
from openpyxl import load_workbook
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
import subprocess
import tempfile
from docxtpl import DocxTemplate

from .database import get_db
from . import models, schemas


# ==============================
# CONFIG
# ==============================
SOFFICE = "/Applications/LibreOffice.app/Contents/MacOS/soffice"

BASE_DIR = Path(__file__).parent

TEMPLATE_FILE = BASE_DIR / "templates" / "audit_template.xlsx"
EXCEL_DIR = BASE_DIR / "excel"
EXCEL_DIR.mkdir(exist_ok=True)

REPORT_TEMPLATE_FILE = BASE_DIR / "templates" / "report_template.docx"
REPORT_DIR = BASE_DIR / "reports"
REPORT_DIR.mkdir(exist_ok=True)

SHEET_NAME = "2023"

TITLE_ROWS = {
    "operational": 5,
    "buildings": 8,
    "transport": 11,
    "utility": 14,
}

SECTION_START_ROW = {
    "operational": 6,
    "buildings": 9,
    "transport": 12,
    "utility": 15,
}

MAX_ROWS_PER_SECTION = 2
INFLUENCE_START_ROW = 6
INFLUENCE_MAX_ROWS = 8

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
    print(f"[WARN] Feuille '{SHEET_NAME}' introuvable. Feuilles: {wb.sheetnames}. Utilisation: '{wb.active.title}'.")
    return wb.active


def recalc_excel_in_place(excel_path: Path) -> None:
    if not excel_path.exists():
        return
    if not Path(SOFFICE).exists():
        return

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        subprocess.run(
            [SOFFICE, "--headless", "--nologo", "--nolockcheck", "--norestore",
             "--convert-to", "xlsx", "--outdir", str(tmpdir), str(excel_path)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        generated = tmpdir / excel_path.name
        if not generated.exists():
            cands = list(tmpdir.glob("*.xlsx"))
            if cands:
                generated = cands[0]
        if generated.exists():
            move(str(generated), str(excel_path))


def write_audit_to_excel(project, audit_data: Dict[str, Any]) -> None:
    excel_path = EXCEL_DIR / project.excel_file
    if not excel_path.exists():
        return

    wb = load_workbook(excel_path)
    ws = _get_sheet(wb)

    year = (audit_data or {}).get("year2023", {}) or {}

    if isinstance(year, dict) and "specifics" in year:
        year = dict(year)
        year.pop("specifics", None)

    _set_cell(ws, f"B{TITLE_ROWS['operational']}", "Activité opérationnelle")
    _set_cell(ws, f"B{TITLE_ROWS['buildings']}", "Bâtiments")
    _set_cell(ws, f"B{TITLE_ROWS['transport']}", "Transport")
    _set_cell(ws, f"B{TITLE_ROWS['utility']}", "Utilité")

    headers = year.get("utility_headers", {}) or {}
    _set_cell(ws, "G3", headers.get("util1_name", ""))
    _set_cell(ws, "G4", headers.get("util1_unit", ""))
    _set_cell(ws, "H3", headers.get("util2_name", ""))
    _set_cell(ws, "H4", headers.get("util2_unit", ""))

    col_map = {
        "name": "B", "electricity": "C", "gas": "D", "fuel": "E",
        "biogas": "F", "util1": "G", "util2": "H", "process": "I",
    }
    numeric_fields = {"electricity", "gas", "fuel", "biogas", "util1", "util2", "process"}

    for section_key in ["operational", "buildings", "transport", "utility"]:
        rows = year.get(section_key, []) or []
        start_row = SECTION_START_ROW[section_key]

        for r in range(MAX_ROWS_PER_SECTION):
            excel_row = start_row + r
            for field, col in col_map.items():
                _set_cell(ws, f"{col}{excel_row}", "" if field == "name" else None,
                          numeric=(field in numeric_fields))

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
    wb = load_workbook(excel_path, data_only=True)
    ws = _get_sheet(wb)

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


# ──────────────────────────────────────────────────────────────────────────────
# HELPERS AUDIT / ENERGY
# ──────────────────────────────────────────────────────────────────────────────

def _audit_to_data(audit: models.Audit) -> Dict[str, Any]:
    """Reconstruit le dict audit_data à partir de l'ORM Audit."""
    if audit is None:
        return {}
    energies = audit.energies or {}
    inf = audit.influence_factors or {}
    inv = audit.invoices or {}
    year_energy = energies.get("year2023", {})
    return {
        "year2023": {
            **year_energy,
            "influence_factors": inf.get("year2023", []),
            "invoice_meter": inv.get("year2023", {}),
        }
    }


def _upsert_audit(project_id: str, audit_data: Dict[str, Any], db: Session) -> models.Audit:
    """Crée ou met à jour la ligne audits pour ce projet."""
    year2023 = (audit_data or {}).get("year2023", {}) or {}

    energies = {
        "year2023": {
            "utility_headers": year2023.get("utility_headers", {}),
            "operational":     year2023.get("operational", []),
            "buildings":       year2023.get("buildings", []),
            "transport":       year2023.get("transport", []),
            "utility":         year2023.get("utility", []),
        }
    }
    influence_factors = {"year2023": year2023.get("influence_factors", [])}
    invoices = {"year2023": year2023.get("invoice_meter", {})}

    audit = db.query(models.Audit).filter(models.Audit.project_id == project_id).first()
    if audit:
        audit.energies = energies
        audit.influence_factors = influence_factors
        audit.invoices = invoices
        flag_modified(audit, "energies")
        flag_modified(audit, "influence_factors")
        flag_modified(audit, "invoices")
    else:
        audit = models.Audit(
            id=str(uuid4()),
            project_id=project_id,
            energies=energies,
            influence_factors=influence_factors,
            invoices=invoices,
        )
        db.add(audit)
    db.commit()
    db.refresh(audit)
    return audit


def _reconstruct_energy(project_id: str, db: Session) -> Dict[str, Any]:
    """Reconstruit le dict energy_accounting à partir des lignes de la table."""
    records = db.query(models.EnergyRecord).filter(
        models.EnergyRecord.project_id == project_id
    ).all()
    years: Dict[str, Any] = {}
    for r in records:
        years[r.year] = {
            "year": r.year,
            "totals": {
                "electricity": r.electricity,
                "gas":         r.gas,
                "fuel":        r.fuel,
                "biogas":      r.biogas,
                "util1":       r.utility1,
                "util2":       r.utility2,
                "process":     r.process,
            },
            "details": r.details or {},
            "notes":   r.notes or "",
        }
    return {"years": years}


def _upsert_energy_year(
    project_id: str, year_str: str, year_data: Dict[str, Any], db: Session
) -> None:
    """Crée ou met à jour une ligne energy_accounting pour une année."""
    totals = year_data.get("totals", {}) or {}
    details = year_data.get("details") or {}
    notes = year_data.get("notes", "") or ""

    record = db.query(models.EnergyRecord).filter(
        models.EnergyRecord.project_id == project_id,
        models.EnergyRecord.year == year_str,
    ).first()

    if record:
        record.electricity = totals.get("electricity")
        record.gas         = totals.get("gas")
        record.fuel        = totals.get("fuel")
        record.biogas      = totals.get("biogas")
        record.utility1    = totals.get("util1")
        record.utility2    = totals.get("util2")
        record.process     = totals.get("process")
        record.notes       = notes
        record.details     = details
        flag_modified(record, "details")
    else:
        record = models.EnergyRecord(
            id=str(uuid4()),
            project_id=project_id,
            year=year_str,
            electricity=totals.get("electricity"),
            gas=totals.get("gas"),
            fuel=totals.get("fuel"),
            biogas=totals.get("biogas"),
            utility1=totals.get("util1"),
            utility2=totals.get("util2"),
            process=totals.get("process"),
            notes=notes,
            details=details,
        )
        db.add(record)


# ==============================
# ROUTES: PROJECTS CRUD
# ==============================
@app.get("/projects", response_model=List[schemas.Project])
def list_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).all()


@app.post("/projects", response_model=schemas.Project)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db)):
    project_id = str(uuid4())
    excel_name = f"{project_id}.xlsx"
    excel_path = EXCEL_DIR / excel_name

    if not TEMPLATE_FILE.exists():
        raise HTTPException(status_code=500, detail="Excel template not found")

    copyfile(TEMPLATE_FILE, excel_path)

    project = models.Project(
        id=project_id,
        created_at=datetime.now(timezone.utc).isoformat(),
        excel_file=excel_name,
        **payload.model_dump(),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@app.patch("/projects/{project_id}", response_model=schemas.Project)
def update_project(project_id: str, payload: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)

    db.commit()
    db.refresh(project)
    return project


@app.delete("/projects/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    excel_path = EXCEL_DIR / project.excel_file
    if excel_path.exists():
        excel_path.unlink()

    db.delete(project)
    db.commit()
    return {"status": "deleted", "id": project_id}


# ==============================
# ROUTES: AUDIT + EXCEL
# ==============================
@app.get("/projects/{project_id}/audit")
def get_project_audit(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    audit = db.query(models.Audit).filter(models.Audit.project_id == project_id).first()
    return _audit_to_data(audit)


@app.patch("/projects/{project_id}/audit")
def update_project_audit(project_id: str, payload: schemas.AuditUpdate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    audit = _upsert_audit(project_id, payload.audit_data, db)
    audit_data = _audit_to_data(audit)

    write_audit_to_excel(project, audit_data)
    excel_path = EXCEL_DIR / project.excel_file
    try:
        recalc_excel_in_place(excel_path)
    except Exception:
        pass

    return {"status": "ok", "audit_data": audit_data}


@app.get("/projects/{project_id}/excel")
def download_project_excel(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
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


# ==============================
# ROUTES: INDICES
# ==============================
@app.get("/projects/{project_id}/indices")
def get_indices(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    excel_path = EXCEL_DIR / project.excel_file
    if not excel_path.exists():
        raise HTTPException(status_code=404, detail="Excel file not found")

    try:
        recalc_excel_in_place(excel_path)
    except Exception:
        pass

    return read_indices_from_excel(excel_path)


# ==============================
# ROUTES: ENERGY ACCOUNTING
# ==============================
@app.get("/projects/{project_id}/energy-accounting")
def get_energy_accounting(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return _reconstruct_energy(project_id, db)


@app.patch("/projects/{project_id}/energy-accounting")
def update_energy_accounting(project_id: str, payload: schemas.EnergyAccountingUpdate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    years = (payload.energy_accounting or {}).get("years", {}) or {}
    for year_str, year_data in years.items():
        _upsert_energy_year(project_id, year_str, year_data, db)

    db.commit()
    return {"status": "ok", "energy_accounting": _reconstruct_energy(project_id, db)}


@app.post("/projects/{project_id}/energy-accounting/import-from-audit")
def import_energy_from_audit(project_id: str, payload: schemas.EnergyYearImportRequest, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    audit = db.query(models.Audit).filter(models.Audit.project_id == project_id).first()
    audit_data = _audit_to_data(audit)
    year2023_data = (audit_data or {}).get("year2023", {}) or {}
    year = str(payload.year)

    def sum_field(rows, field):
        total = 0.0
        for r in rows or []:
            v = r.get(field, None)
            if v is None or str(v).strip() == "":
                continue
            try:
                total += float(str(v).replace(" ", "").replace(",", "."))
            except Exception:
                pass
        return total

    sections = ["operational", "buildings", "transport", "utility"]
    all_rows = []
    for sk in sections:
        all_rows += (year2023_data.get(sk, []) or [])

    year_data = {
        "year": year,
        "totals": {
            "electricity": sum_field(all_rows, "electricity"),
            "gas":         sum_field(all_rows, "gas"),
            "fuel":        sum_field(all_rows, "fuel"),
            "biogas":      sum_field(all_rows, "biogas"),
            "util1":       sum_field(all_rows, "util1"),
            "util2":       sum_field(all_rows, "util2"),
            "process":     sum_field(all_rows, "process"),
        },
        "details": {sk: year2023_data.get(sk, []) for sk in sections},
        "notes": "",
    }

    _upsert_energy_year(project_id, year, year_data, db)
    db.commit()
    return {"status": "ok", "energy_accounting": _reconstruct_energy(project_id, db)}


# ==============================
# ROUTES: REPORT
# ==============================
@app.get("/projects/{project_id}/report")
def get_project_report(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    report = db.query(models.Report).filter(models.Report.project_id == project_id).first()
    if not report:
        return {}

    return {
        "audit_type":       report.audit_type or "",
        "audit_theme":      report.theme or "",
        "provider_company": report.provider_name or "",
        "auditor_name":     report.auditor_name or "",
        "amureba_skills":   report.competences or "",
    }


@app.patch("/projects/{project_id}/report")
def update_project_report(project_id: str, payload: schemas.ReportUpdate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    data = payload.report_data or {}
    report = db.query(models.Report).filter(models.Report.project_id == project_id).first()

    if report:
        report.audit_type    = data.get("audit_type", report.audit_type)
        report.theme         = data.get("audit_theme", report.theme)
        report.provider_name = data.get("provider_company", report.provider_name)
        report.auditor_name  = data.get("auditor_name", report.auditor_name)
        report.competences   = data.get("amureba_skills", report.competences)
    else:
        report = models.Report(
            id=str(uuid4()),
            project_id=project_id,
            audit_type    = data.get("audit_type"),
            theme         = data.get("audit_theme"),
            provider_name = data.get("provider_company"),
            auditor_name  = data.get("auditor_name"),
            competences   = data.get("amureba_skills"),
        )
        db.add(report)

    db.commit()
    db.refresh(report)

    report_data = {
        "audit_type":       report.audit_type or "",
        "audit_theme":      report.theme or "",
        "provider_company": report.provider_name or "",
        "auditor_name":     report.auditor_name or "",
        "amureba_skills":   report.competences or "",
    }
    return {"status": "ok", "report_data": report_data}


@app.get("/projects/{project_id}/report/docx")
def download_project_report_docx(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not REPORT_TEMPLATE_FILE.exists():
        raise HTTPException(status_code=500, detail="Report template not found")

    report = db.query(models.Report).filter(models.Report.project_id == project_id).first()
    audit_type = (report.audit_type if report else None) or project.audit_type or ""
    audit_type = audit_type.strip()

    context = {
        "audit_type":        audit_type,
        "audit_theme":       (report.theme          if report else "") or "",
        "provider_company":  (report.provider_name  if report else "") or "",
        "auditor_name":      (report.auditor_name   if report else "") or "",
        "amureba_skills":    (report.competences    if report else "") or "",
        "audit_global_box":  "☑" if audit_type.lower() == "audit global"  else "☐",
        "audit_partiel_box": "☑" if audit_type.lower() == "audit partiel" else "☐",
    }

    out_path = REPORT_DIR / f"{project.id}_report.docx"
    doc = DocxTemplate(str(REPORT_TEMPLATE_FILE))
    doc.render(context)
    doc.save(str(out_path))

    return FileResponse(
        path=str(out_path),
        filename=f"HeatSight_{project.project_name}_rapport.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


# ==============================
# ROUTES: EVENTS (Agenda)
# ==============================
@app.get("/events", response_model=List[schemas.EventSchema])
def list_events(project_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.Event)
    if project_id:
        q = q.filter(models.Event.project_id == project_id)
    return q.order_by(models.Event.start).all()


@app.post("/events", response_model=schemas.EventSchema)
def create_event(payload: schemas.EventCreate, db: Session = Depends(get_db)):
    event = models.Event(id=str(uuid4()), **payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@app.patch("/events/{event_id}", response_model=schemas.EventSchema)
def update_event(event_id: str, payload: schemas.EventCreate, db: Session = Depends(get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(event, field, value)

    db.commit()
    db.refresh(event)
    return event


@app.delete("/events/{event_id}")
def delete_event(event_id: str, db: Session = Depends(get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    db.delete(event)
    db.commit()
    return {"status": "deleted", "id": event_id}


# ==============================
# ROUTES: CLIENT REQUESTS
# ==============================
@app.get("/client-requests", response_model=List[schemas.ClientRequestSchema])
def list_client_requests(project_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.ClientRequest)
    if project_id:
        q = q.filter(models.ClientRequest.project_id == project_id)
    return q.all()


@app.post("/client-requests", response_model=schemas.ClientRequestSchema)
def create_client_request(payload: schemas.ClientRequestCreate, db: Session = Depends(get_db)):
    cr = models.ClientRequest(id=str(uuid4()), **payload.model_dump())
    db.add(cr)
    db.commit()
    db.refresh(cr)
    return cr


@app.patch("/client-requests/{request_id}", response_model=schemas.ClientRequestSchema)
def update_client_request(request_id: str, payload: schemas.ClientRequestPatch, db: Session = Depends(get_db)):
    cr = db.query(models.ClientRequest).filter(models.ClientRequest.id == request_id).first()
    if not cr:
        raise HTTPException(status_code=404, detail="Client request not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cr, field, value)
        if field in ("documents", "received_files"):
            flag_modified(cr, field)

    db.commit()
    db.refresh(cr)
    return cr


@app.delete("/client-requests/{request_id}")
def delete_client_request(request_id: str, db: Session = Depends(get_db)):
    cr = db.query(models.ClientRequest).filter(models.ClientRequest.id == request_id).first()
    if not cr:
        raise HTTPException(status_code=404, detail="Client request not found")

    db.delete(cr)
    db.commit()
    return {"status": "deleted", "id": request_id}
