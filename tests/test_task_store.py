import json
from pathlib import Path
from unittest.mock import patch

from desktop_pet.diary.task_store import TaskStore
from desktop_pet.diary.diary_bridge import DiaryBridge


def test_task_lifecycle_persists_all_fields(tmp_path: Path):
    path = tmp_path / "tasks.json"
    store = TaskStore(path)
    task = store.add_task({
        "title": "Figma Design",
        "date": "2026-09-22",
        "time": "10:00",
        "category": "work",
        "priority": "high",
    })
    assert set(task) == {"id", "title", "date", "time", "period", "duration_minutes", "category", "priority", "completed", "created_at", "completed_at"}
    assert task["completed"] is False
    assert task["completed_at"] is None
    assert task["category"] == "work"
    assert task["period"] == "day"
    assert task["duration_minutes"] == 45

    completed = store.update_task(task["id"], {"completed": True})
    assert completed["completed"] is True
    assert completed["completed_at"]

    restored = TaskStore(path).list_tasks()[0]
    assert restored == completed
    reopened = store.update_task(task["id"], {"completed": False, "title": "Updated"})
    assert reopened["completed_at"] is None
    assert reopened["title"] == "Updated"
    assert store.delete_task(task["id"]) is True
    assert json.loads(path.read_text(encoding="utf-8")) == {"tasks": []}


def test_period_and_duration_defaults_survive_category_changes(tmp_path: Path):
    store = TaskStore(tmp_path / "tasks.json")
    night = store.add_task({"title": "Read", "date": "2026-09-30", "period": "night", "category": "learning"})
    assert night["period"] == "night" and night["duration_minutes"] == 30
    changed = store.update_task(night["id"], {"category": "work"})
    assert changed["duration_minutes"] == 30
    custom = store.update_task(night["id"], {"duration_minutes": 90})
    assert custom["duration_minutes"] == 90
    assert TaskStore(store.path).list_tasks()[0] == custom

    uncategorized = store.add_task({"title": "Pause", "date": "", "category": None})
    assert uncategorized["category"] is None
    assert uncategorized["duration_minutes"] == 15


def test_legacy_tasks_gain_period_and_duration_without_using_time(tmp_path: Path):
    path = tmp_path / "tasks.json"
    path.write_text(json.dumps({"tasks": [{"id": "old", "title": "Old", "date": "2026-09-30", "time": "20:00", "category": "work", "priority": "low", "completed": False, "created_at": "old", "completed_at": None}]}), encoding="utf-8")
    task = TaskStore(path).list_tasks()[0]
    assert task["period"] == "day" and task["duration_minutes"] == 45
    assert json.loads(path.read_text(encoding="utf-8"))["tasks"][0] == task


def test_legacy_design_category_reads_as_work_and_is_saved_as_work(tmp_path: Path):
    path = tmp_path / "tasks.json"
    store = TaskStore(path)
    task = store.add_task({"title": "Design draft", "date": "2026-09-22", "category": "work"})
    saved = json.loads(path.read_text(encoding="utf-8"))
    saved["tasks"][0]["category"] = "design"
    path.write_text(json.dumps(saved), encoding="utf-8")

    assert store.list_tasks()[0]["category"] == "work"
    changed = store.update_task(task["id"], {"title": "Design review"})
    assert changed["category"] == "work"
    assert json.loads(path.read_text(encoding="utf-8"))["tasks"][0]["category"] == "work"


def test_diary_bridge_exposes_task_crud(tmp_path: Path):
    bridge = DiaryBridge()
    bridge.task_store = TaskStore(tmp_path / "tasks.json")
    task = bridge.addTask({"title": "Write", "date": "2026-09-22", "category": "work", "priority": "low"})
    assert bridge.getTasks() == [task]
    changed = bridge.updateTask(task["id"], {"title": "Write notes"})
    assert changed["title"] == "Write notes"
    completed = bridge.setTaskCompleted(task["id"], True)
    assert completed["completed"] is True and completed["completed_at"]
    reopened = bridge.setTaskCompleted(task["id"], False)
    assert reopened["completed"] is False and reopened["completed_at"] is None
    assert bridge.deleteTask(task["id"]) is True


def test_failed_task_write_preserves_existing_file(tmp_path: Path):
    path = tmp_path / "tasks.json"
    store = TaskStore(path)
    original = store.add_task({"title": "Keep me", "category": "work"})
    before = path.read_bytes()

    with patch("desktop_pet.diary.task_store.os.replace", side_effect=OSError("Disk error")):
        try:
            store.add_task({"title": "New task", "category": "work"})
        except OSError:
            pass
        else:
            raise AssertionError("Task write failure should be reported")

    assert path.read_bytes() == before
    assert not path.with_suffix(".json.tmp").exists()
    assert TaskStore(path).list_tasks() == [original]
