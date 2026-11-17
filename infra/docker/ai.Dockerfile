FROM python:3.12-slim
WORKDIR /app
COPY apps/ai/requirements.txt apps/ai/pyproject.toml ./
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/ai/app ./app
# The service needs no privileges: do not run it as root
RUN useradd --system --no-create-home app
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
