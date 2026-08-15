# RemzyForge AI

Original AI video studio: **idea → script → storyboard → scenes → images → motion → voice → captions → music → edit → export**.

This is an independent implementation. It does not copy proprietary code, branding, UI, or assets from any commercial product.

Phase 1 is implemented: local studio (no sign-in), projects, PostgreSQL/SQLite schema, model registry, and a professional generate card.

## Repository

```
apps/web            Next.js 15 studio
apps/api            FastAPI gateway
apps/workers        GPU / mock workers
apps/render         FFmpeg renderer
packages/ai         MODEL_REGISTRY + providers
packages/database   SQLAlchemy models
packages/prompts    PromptCompiler + adapters
packages/types      Shared TypeScript types
packages/config     Credit costs (not hardcoded)
infrastructure/     Docker, Kubernetes, Terraform
```

## Phase 1 local run (no Docker / GPU)

```bash
cd remzyforge-ai
cp .env.example .env

python3 -m venv .venv
source .venv/bin/activate
pip install -e packages/database -e packages/ai -e apps/api

cd apps/api
PYTHONPATH=".:../../packages/database:../../packages/ai" uvicorn app.main:app --reload --port 8000
```

In another terminal:

```bash
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000 — create a studio, then a project.

API docs: http://localhost:8000/docs

## Tests

```bash
cd apps/api
PYTHONPATH=".:../../packages/database:../../packages/ai" pytest -q
```

## Models

`packages/ai/remzyforge_ai/registry.py` is the single catalog. Application services depend on the registry, not a hardcoded model name.

Development defaults to mock providers (`MOCK_VIDEO_PROVIDER=true`) so the workflow can be built without CUDA.

Open http://localhost:3000 or http://localhost:3001 — no account required.
