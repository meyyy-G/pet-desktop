"""Persistent chat messages and independent diary snippets."""
import json
import os
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from ..paths import CHAT_FILE


class SavedChatStore:
    def __init__(self, path=None):
        self.path = Path(path) if path else CHAT_FILE

    def _read(self):
        if not self.path.exists():
            return {"messages": [], "snippets": []}
        data = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not all(isinstance(data.get(key), list) for key in ("messages", "snippets")):
            raise ValueError("Invalid chat storage")
        return data

    def _write(self, data):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".json.tmp")
        try:
            with temporary.open("w", encoding="utf-8") as output:
                json.dump(data, output, ensure_ascii=False, indent=2)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)

    def messages(self):
        data = self._read()
        saved_ids = {item["message_id"] for item in data["snippets"]}
        return [{**item, "saved": item["id"] in saved_ids} for item in data["messages"]]

    def add_message(self, role, content):
        if role not in ("user", "assistant") or not isinstance(content, str) or not content.strip():
            raise ValueError("Invalid chat message")
        data = self._read()
        message = {"id": str(uuid4()), "role": role, "content": content,
                   "created_at": datetime.now().astimezone().isoformat()}
        data["messages"].append(message)
        self._write(data)
        return {**message, "saved": False}

    def save_message(self, message_id):
        data = self._read()
        for snippet in data["snippets"]:
            if snippet["message_id"] == message_id:
                return snippet
        message = next((item for item in data["messages"] if item["id"] == message_id), None)
        if not message or message["role"] != "assistant":
            raise ValueError("Only assistant messages can be saved")
        now = datetime.now().astimezone()
        snippet = {"id": str(uuid4()), "message_id": message_id, "date": now.date().isoformat(),
                   "content": message["content"], "created_at": now.isoformat()}
        data["snippets"].append(snippet)
        self._write(data)
        return snippet

    def unsave_message(self, message_id):
        data = self._read()
        snippet = next((item for item in data["snippets"] if item["message_id"] == message_id), None)
        if not snippet:
            raise ValueError("Saved assistant message not found")
        data["snippets"] = [item for item in data["snippets"] if item["message_id"] != message_id]
        self._write(data)
        return snippet

    def snippets_by_date(self, date):
        return [item for item in self._read()["snippets"] if item["date"] == date]
