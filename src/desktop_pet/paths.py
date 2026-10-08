import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
IS_FROZEN = bool(getattr(sys, "frozen", False))

if IS_FROZEN:
    bundle_dir = getattr(sys, "_MEIPASS", Path(sys.executable).parent)
    RESOURCE_ROOT = Path(bundle_dir)
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        default_data_dir = Path(local_app_data) / "DesktopPet"
    else:
        default_data_dir = Path.home() / "AppData" / "Local" / "DesktopPet"
else:
    RESOURCE_ROOT = PROJECT_ROOT
    default_data_dir = PROJECT_ROOT / "data"

ASSETS_DIR = RESOURCE_ROOT / "assets"
APP_ICON_FILE = ASSETS_DIR / "images" / "app-icon.png"
JOURNAL_ICON_FILE = ASSETS_DIR / "images" / "Journal_icon.ico"
WEB_ASSETS_DIR = ASSETS_DIR / "web"
WEB_DIR = (
    RESOURCE_ROOT / "desktop_pet" / "web"
    if IS_FROZEN
    else PROJECT_ROOT / "src" / "desktop_pet" / "web"
)
data_dir_override = os.environ.get("DESKTOP_PET_DATA_DIR")
DATA_DIR = Path(data_dir_override) if data_dir_override else default_data_dir
CONFIG_DIR = DATA_DIR / "config"
PET_DATA_DIR = DATA_DIR / "pet"
JOURNAL_DIR = DATA_DIR / "journal"
TASKS_DIR = DATA_DIR / "tasks"
CHAT_DIR = DATA_DIR / "chat"

SETTINGS_FILE = CONFIG_DIR / "settings.json"
PET_STATE_FILE = PET_DATA_DIR / "state.json"
TASKS_FILE = TASKS_DIR / "tasks.json"
CHAT_FILE = CHAT_DIR / "chat.json"

# Read only during the one-time migration from the original flat layout.
LEGACY_SETTINGS_FILE = DATA_DIR / "desktop_pet_settings.json"
LEGACY_PET_STATE_FILE = DATA_DIR / "pet_state.json"
LEGACY_TASKS_FILE = DATA_DIR / "tasks.json"
LEGACY_CHAT_FILE = DATA_DIR / "saved_chat.json"
LEGACY_DIARY_DIR = DATA_DIR / "diary"
LEGACY_MOODS_DIR = DATA_DIR / "moods"
