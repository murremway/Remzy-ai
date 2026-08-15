# RemzyForge AI — delivery phases

| Phase | Scope | Status |
|-------|--------|--------|
| 1 | Auth, organizations, projects, database, catalog, studio shell | **Implemented** |
| 2 | Script + storyboard generation, scene CRUD, assistant ops | Scaffolded |
| 3 | Image generation workers + approval | Interface + mock |
| 4 | Video / motion generation | Interface + mock |
| 5 | Voice + captions (Whisper / Kokoro) | Interface + mock |
| 6 | Timeline editor | UI chrome only |
| 7 | FFmpeg render / export | Scaffold |
| 8 | GPU workers, Redis queue, VRAM mgmt | Scaffold |
| 9 | Billing / subscriptions | Credit table + costs |
| 10 | Production deploy (K8s/Terraform) | Starter manifests |

Every later phase must add tests, migrations, env vars, and OpenAPI updates.
