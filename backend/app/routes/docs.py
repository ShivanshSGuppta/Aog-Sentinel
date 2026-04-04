from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user
from app.schemas import DocSearchRequest, DocSearchResult
from app.services.docs_service import get_document_search_service

router = APIRouter(prefix="/docs", tags=["docs"], dependencies=[Depends(get_current_user)])


@router.post("/search", response_model=list[DocSearchResult])
def docs_search(payload: DocSearchRequest) -> list[DocSearchResult]:
    service = get_document_search_service()
    return service.search(payload.query)
