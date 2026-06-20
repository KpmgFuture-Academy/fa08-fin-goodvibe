"""``/reports/*`` 라우터 — 사업별 PDF 리포트 (제출용 산출물).

  - ``GET /reports/project-preview`` : 렌더 전 JSON payload (todo + diary + evidence)
  - ``GET /reports/project-pdf``     : 한 농가 한 사업의 통합 PDF 다운로드
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status as http_status
from fastapi.responses import FileResponse

from app.services.report_service import build_project_report_data, generate_project_pdf

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/project-preview")
def get_project_report_preview(
    farmer_id: str = Query(..., min_length=1),
    prj_id: str | None = None,
    project_id: str | None = None,
    include_images: bool = True,
):
    try:
        return build_project_report_data(farmer_id=farmer_id, prj_id=prj_id, project_id=project_id)
    except ValueError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to build report preview") from exc


@router.get("/project-pdf")
def get_project_report_pdf(
    farmer_id: str = Query(..., min_length=1),
    prj_id: str | None = None,
    project_id: str | None = None,
    include_images: bool = True,
):
    try:
        report_data = build_project_report_data(farmer_id=farmer_id, prj_id=prj_id, project_id=project_id)
        pdf_path = generate_project_pdf(report_data, include_images=include_images)
    except ValueError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to generate report pdf") from exc

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=pdf_path.name,
        headers={"Content-Disposition": f'attachment; filename="{pdf_path.name}"'},
    )
