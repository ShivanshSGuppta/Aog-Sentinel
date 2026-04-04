from __future__ import annotations

import logging
import threading
from functools import lru_cache

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.config import settings
from app.schemas import DocSearchResult
from app.services.data_loader import get_repository


logger = logging.getLogger(__name__)


class DocumentSearchService:
    def __init__(self) -> None:
        repo = get_repository()
        self.chunks = repo.manual_chunks.reset_index(drop=True)
        self.search_texts = self.chunks["search_text"].fillna("").tolist()
        self.vectorizer = TfidfVectorizer(stop_words="english")
        self.keyword_matrix = self.vectorizer.fit_transform(self.search_texts)
        self._lock = threading.Lock()
        self._model = None
        self._index = None
        self._embedding_ready = False
        self._embedding_attempted = False
        self._embedding_thread_started = False

    def _build_embedding_index(self) -> None:
        if settings.docs_force_fallback or self._embedding_attempted:
            return
        with self._lock:
            if settings.docs_force_fallback or self._embedding_attempted:
                return
            try:
                from sentence_transformers import SentenceTransformer
                import faiss

                model = SentenceTransformer(settings.doc_model_name)
                embeddings = model.encode(
                    self.search_texts,
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                    show_progress_bar=False,
                ).astype("float32")
                index = faiss.IndexFlatIP(embeddings.shape[1])
                index.add(embeddings)
                self._model = model
                self._index = index
                self._embedding_ready = True
            except Exception as exc:  # pragma: no cover - graceful fallback path
                logger.warning("Falling back to keyword search for manual retrieval: %s", exc)
                self._embedding_ready = False
            finally:
                self._embedding_attempted = True

    def _start_background_embedding_build(self) -> None:
        if settings.docs_force_fallback or self._embedding_attempted or self._embedding_thread_started:
            return
        self._embedding_thread_started = True
        thread = threading.Thread(target=self._build_embedding_index, daemon=True)
        thread.start()

    def search(self, query: str, top_k: int = 5) -> list[DocSearchResult]:
        query = query.strip()
        if not query:
            return []

        self._start_background_embedding_build()
        if self._embedding_ready and self._model is not None and self._index is not None:
            try:
                return self._embedding_search(query, top_k=top_k)
            except Exception as exc:  # pragma: no cover - graceful fallback path
                logger.warning("Embedding search failed, using keyword fallback: %s", exc)
        return self._keyword_search(query, top_k=top_k)

    def _embedding_search(self, query: str, top_k: int) -> list[DocSearchResult]:
        query_embedding = self._model.encode(
            [query],
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        ).astype("float32")
        scores, indices = self._index.search(query_embedding, top_k)
        results: list[DocSearchResult] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue
            row = self.chunks.iloc[int(idx)]
            results.append(
                DocSearchResult(
                    chunk_id=row.chunk_id,
                    source_doc=row.source_doc,
                    section_title=row.section_title,
                    text=row.text,
                    score=round(float(score), 4),
                    search_mode="embedding",
                )
            )
        return results

    def _keyword_search(self, query: str, top_k: int) -> list[DocSearchResult]:
        query_vector = self.vectorizer.transform([query])
        cosine_scores = cosine_similarity(query_vector, self.keyword_matrix).ravel()
        query_terms = {token for token in query.lower().split() if token}
        overlap_scores = []
        for text in self.search_texts:
            text_terms = {token for token in text.lower().split() if token}
            denominator = max(len(query_terms | text_terms), 1)
            overlap_scores.append(len(query_terms & text_terms) / denominator)
        combined_scores = (cosine_scores * 0.85) + (np.array(overlap_scores) * 0.15)
        top_indices = combined_scores.argsort()[::-1][:top_k]
        return [
            DocSearchResult(
                chunk_id=self.chunks.iloc[int(idx)].chunk_id,
                source_doc=self.chunks.iloc[int(idx)].source_doc,
                section_title=self.chunks.iloc[int(idx)].section_title,
                text=self.chunks.iloc[int(idx)].text,
                score=round(float(combined_scores[int(idx)]), 4),
                search_mode="fallback",
            )
            for idx in top_indices
        ]


@lru_cache(maxsize=1)
def get_document_search_service() -> DocumentSearchService:
    return DocumentSearchService()
