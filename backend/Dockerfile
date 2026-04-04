FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV PYTHONPATH=/app
ENV AOG_DATA_DIR=/app/data
ENV HF_HOME=/opt/huggingface
ENV SENTENCE_TRANSFORMERS_HOME=/opt/huggingface/sentence-transformers
ENV TRANSFORMERS_CACHE=/opt/huggingface/transformers
ENV PORT=10000

WORKDIR /app

COPY requirements.txt ./
RUN pip install -r requirements.txt

# Bake the default retrieval model into the image so the backend does not
# need a writable model cache or first-request download in production.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY data ./data

EXPOSE 10000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
