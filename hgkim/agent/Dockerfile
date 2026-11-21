# 트라이로그 에이전트 서버 (FastAPI + LangGraph), 포트 7500
# 빌드: docker build -t trylog-agent hgkim/agent     (보통은 deploy/compose.yaml 이 빌드한다)
#
# 이미지에는 trylog_agent 코드와 패키지만 들어간다. Git에 없는 서재원 자료는 띄울 때 붙인다.
#   jaewon/ml   → /srv/jaewon/ml    (TRYLOG_ML_DIR)
#   jaewon/data → /srv/jaewon/data  (CSV_DIR)
FROM python:3.11-slim

# lightgbm 이 쓰는 OpenMP 런타임
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/agent
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY trylog_agent ./trylog_agent

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TRYLOG_ML_DIR=/srv/jaewon/ml \
    CSV_DIR=/srv/jaewon/data

EXPOSE 7500
CMD ["python", "-m", "uvicorn", "trylog_agent.main:app", "--host", "0.0.0.0", "--port", "7500"]
