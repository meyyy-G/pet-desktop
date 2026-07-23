"""读和存设置"""
import json
from dataclasses import asdict,dataclass

from .paths import SETTINGS_FILE

@dataclass #这个类主要是存数据的，帮我自动生成初始化代码
class DesktopPetSettings:
    x: int = 1200
    y: int = 650
    scale: int = 120
    always_on_top:bool = True

class SettingsStore:
    """设置储存器"""
    @staticmethod
    def load() -> DesktopPetSettings:
        if not SETTINGS_FILE.exists():
            return DesktopPetSettings()

        try:
            with SETTINGS_FILE.open("r",encoding="utf-8") as file:
                data = json.load(file)
        except (OSError,json.JSONDecodeError):
            return DesktopPetSettings()

        defaults = asdict(DesktopPetSettings())
        defaults.update({key: data[key] for key in defaults.keys() & data.keys()})
        return DesktopPetSettings(**defaults)

    @staticmethod
    def save(settings:DesktopPetSettings) -> None:
        SETTINGS_FILE.parent.mkdir(parents=True,exist_ok=True)
        with SETTINGS_FILE.open("w", encoding="utf-8") as file:
            json.dump(asdict(settings),file,indent=2)
