"""One-time migration from the original flat data layout."""
import json
import os
from pathlib import Path

from .paths import (
    CHAT_FILE,
    JOURNAL_DIR,
    LEGACY_CHAT_FILE,
    LEGACY_DIARY_DIR,
    LEGACY_MOODS_DIR,
    LEGACY_PET_STATE_FILE,
    LEGACY_SETTINGS_FILE,
    LEGACY_TASKS_FILE,
    PET_STATE_FILE,
    SETTINGS_FILE,
    TASKS_FILE,
)


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def _read_json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def _move_flat_file(source: Path, destination: Path) -> None:
    if not source.exists():
        return
    if destination.exists():
        source.unlink()
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    source.replace(destination)


def _remove_empty_tree(path: Path) -> None:
    if not path.exists():
        return
    directories = (item for item in path.rglob("*") if item.is_dir())
    for directory in sorted(directories, key=lambda item: len(item.parts), reverse=True):
        try:
            directory.rmdir()
        except OSError:
            pass
    try:
        path.rmdir()
    except OSError:
        pass


def migrate_legacy_data() -> None:
    """Move old files into the categorized layout without losing journal fields."""
    _move_flat_file(LEGACY_SETTINGS_FILE, SETTINGS_FILE)
    _move_flat_file(LEGACY_PET_STATE_FILE, PET_STATE_FILE)
    _move_flat_file(LEGACY_TASKS_FILE, TASKS_FILE)
    _move_flat_file(LEGACY_CHAT_FILE, CHAT_FILE)

    journal_sources: dict[str, list[Path]] = {}
    for legacy_dir in (LEGACY_DIARY_DIR, LEGACY_MOODS_DIR):
        if not legacy_dir.exists():
            continue
        for source in legacy_dir.glob("*/*/*.json"):
            journal_sources.setdefault(source.stem, []).append(source)

    for date, sources in journal_sources.items():
        try:
            year, month, _day = date.split("-")
        except ValueError:
            continue
        destination = JOURNAL_DIR / year / month / f"{date}.json"
        merged: dict = {}
        for source in sources:
            merged.update(_read_json(source))
        merged.update(_read_json(destination))
        merged.setdefault("date", date)
        _write_json(destination, merged)
        for source in sources:
            source.unlink(missing_ok=True)

    _remove_empty_tree(LEGACY_DIARY_DIR)
    _remove_empty_tree(LEGACY_MOODS_DIR)
