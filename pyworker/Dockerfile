FROM ghcr.io/astral-sh/uv:alpine

WORKDIR /app

COPY . .

RUN uv sync --frozen --no-dev

EXPOSE 8000
CMD [".venv/bin/python", "-m", "pyworker", "--worker"]
