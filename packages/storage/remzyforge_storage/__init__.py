"""S3-compatible storage. Phase 1 uses local disk / mock URIs."""

from pathlib import Path


class LocalStorage:
    def __init__(self, root: str = "data/assets") -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, key: str, data: bytes) -> str:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return str(path)
