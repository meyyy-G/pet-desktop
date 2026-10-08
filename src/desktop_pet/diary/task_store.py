import json
import os
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from ..paths import TASKS_FILE


class TaskStore:
    CATEGORIES = {"work", "personal", "learning"}
    PRIORITIES = {"low", "medium", "high"}
    PERIODS = {"day", "night"}
    DEFAULT_DURATIONS = {"work": 45, "personal": 30, "learning": 30}

    def __init__(self, path: Path = TASKS_FILE):
        self.path = path

    def list_tasks(self) -> list[dict]:
        if not self.path.exists():
            return []
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        tasks = data.get("tasks", []) if isinstance(data, dict) else []
        normalized = [self._normalized(task, task_id=task.get("id", str(uuid4())),
                                       created_at=task.get("created_at", self._now()))
                      for task in tasks if isinstance(task, dict)]
        if normalized != tasks:
            self._write(normalized)
        return normalized

    def add_task(self, values: dict) -> dict:
        now = self._now()
        task = self._normalized(values, task_id=str(uuid4()), created_at=now)
        tasks = self.list_tasks()
        tasks.append(task)
        self._write(tasks)
        return task

    def update_task(self, task_id: str, changes: dict) -> dict | None:
        tasks = self.list_tasks()
        for index, task in enumerate(tasks):
            if task.get("id") != task_id:
                continue
            merged = {**task, **changes, "id": task_id, "created_at": task.get("created_at", self._now())}
            if "completed" in changes:
                completed = bool(changes["completed"])
                merged["completed_at"] = self._now() if completed else None
            tasks[index] = self._normalized(merged, task_id=task_id, created_at=merged["created_at"])
            self._write(tasks)
            return tasks[index]
        return None

    def delete_task(self, task_id: str) -> bool:
        tasks = self.list_tasks()
        remaining = [task for task in tasks if task.get("id") != task_id]
        if len(remaining) == len(tasks):
            return False
        self._write(remaining)
        return True

    def _normalized(self, values: dict, *, task_id: str, created_at: str) -> dict:
        category = values.get("category")
        if category == "design":
            category = "work"
        if category not in self.CATEGORIES:
            category = None
        priority = values.get("priority", "medium")
        period = values.get("period", "day")
        default_duration = self.DEFAULT_DURATIONS.get(category, 15)
        try:
            duration = int(values.get("duration_minutes", default_duration))
        except (TypeError, ValueError):
            duration = default_duration
        if duration < 1 or duration > 1440:
            duration = default_duration
        completed = bool(values.get("completed", False))
        completed_at = values.get("completed_at") if completed else None
        return {
            "id": task_id,
            "title": str(values.get("title", "")).strip(),
            "date": str(values.get("date", "")),
            "time": str(values.get("time", "")),
            "period": period if period in self.PERIODS else "day",
            "duration_minutes": duration,
            "category": category,
            "priority": priority if priority in self.PRIORITIES else "medium",
            "completed": completed,
            "created_at": created_at,
            "completed_at": completed_at,
        }

    def _write(self, tasks: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        try:
            with temporary.open("w", encoding="utf-8") as output:
                json.dump({"tasks": tasks}, output, ensure_ascii=False, indent=2)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)

    @staticmethod
    def _now() -> str:
        return datetime.now().astimezone().isoformat(timespec="seconds")
