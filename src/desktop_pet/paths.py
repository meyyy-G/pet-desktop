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
WEB_DIR = (
    RESOURCE_ROOT / "desktop_pet" / "web"
    if IS_FROZEN
    else PROJECT_ROOT / "src" / "desktop_pet" / "web"
)
data_dir_override = os.environ.get("DESKTOP_PET_DATA_DIR")
DATA_DIR = Path(data_dir_override) if data_dir_override else default_data_dir
SETTINGS_FILE = DATA_DIR / "desktop_pet_settings.json"
PET_STATE_FILE = DATA_DIR / "pet_state.json"
