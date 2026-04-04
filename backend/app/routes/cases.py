from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.schemas import CaseCreateRequest, CaseDetail, CaseSummary, CaseTimelineCreateRequest
from app.services.platform_service import add_case_timeline_entry, create_case, get_case_detail, list_cases

router = APIRouter(prefix='/cases', tags=['cases'], dependencies=[Depends(get_current_user)])


@router.get('', response_model=list[CaseSummary])
def cases(request: Request, workspace_id: str | None = Query(default=None), db: Session = Depends(get_db)) -> list[CaseSummary]:
    return list_cases(db, request.state.current_user, workspace_id)


@router.post('', response_model=CaseDetail)
def case_create(payload: CaseCreateRequest, request: Request, db: Session = Depends(get_db)) -> CaseDetail:
    return create_case(db, request.state.current_user, payload)


@router.get('/{case_id}', response_model=CaseDetail)
def case_detail(case_id: str, request: Request, db: Session = Depends(get_db)) -> CaseDetail:
    return get_case_detail(db, request.state.current_user, case_id)


@router.post('/{case_id}/timeline', response_model=CaseDetail)
def case_timeline_entry(case_id: str, payload: CaseTimelineCreateRequest, request: Request, db: Session = Depends(get_db)) -> CaseDetail:
    return add_case_timeline_entry(db, request.state.current_user, case_id, payload)
