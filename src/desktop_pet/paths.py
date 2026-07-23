from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ASSETS_DIR = PROJECT_ROOT / "assets"
DATA_DIR = PROJECT_ROOT / "data"
SETTINGS_FILE = DATA_DIR / "desktop_pet_settings.json"