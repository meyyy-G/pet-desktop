from pathlib import Path

from PySide6.QtCore import QObject, QTimer, Signal
from PySide6.QtGui import QPixmap

from ..paths import ASSETS_DIR


class PetAnimation(QObject):
    frame_changed = Signal(QPixmap)
    state_finished = Signal(str)

    ONE_SHOT_STATES = {
        "gaping",
        "diary_open_enter",
        "diary_open_exit",
        "diary_typing_enter",
        "diary_typing_exit",
    }

    FRAME_PATTERN = {
        "idle": ("standy_rect/looking", "looking_", 6),
        "sitting": ("standy_rect/idle", "sitting_", 10),
        "gaping": ("standy_rect/gap", "gaping_", 8),
        "laydown": ("standy_rect/laydown", "laydown_", 12),
        "eat": ("interactive_rect/feed", "eat_rect_", 15),
        "play": ("interactive_rect/play", "dance_", 4),
        "sleeping": ("interactive_rect/sleep", "sleeping_", 4),
        "touch": ("interactive_rect/touch", "tch_rect_", 12),
        "carry": ("interactive_rect/carry", "carry_cat_", 12),
        "upset": ("need_rect/upset", "upset_", 5),
        "angry": ("need_rect/angry", "angry_", 9),
        "sleepy": ("need_rect/sleepy", "slpy_cat_", 9),
        "sleep": ("need_rect/sleep", "sleeping_", 4),
        "cry": ("need_rect/cry", "cry_", 4),
        "sick": ("need_rect/sick", "sick_", 4),
        "treating": ("need_rect/Treating", "treating_", 5),
    }

    STATIC_FRAMES = {
        "die": "need_rect/die/DeadCat.png",
    }

    STATE_INTERVALS = {
        # 自然状态统一为每帧 180ms，避免切换时忽快忽慢。
        "idle": 540,
        "sitting": 180,
        "gaping": 180,
        "laydown": 180,
        "eat": 120,
        "play": 130,
        "sleeping": 180,
        "touch": 140,
        "carry": 140,
        "upset": 240,
        "angry": 240,
        "die": 240,
        "sleepy": 240,
        "sleep": 240,
        "cry": 240,
        "sick": 240,
        # 治疗动画单独放慢，不影响其他状态的播放速度。
        "treating": 450,

        "diary_open_enter": 150,
        "diary_open_exit": 150,
        "diary_waiting": 240,
        "diary_typing_enter": 150,
        "diary_typing": 140,
        "diary_typing_exit": 150,
    }

    def __init__(self, size: int, parent=None):#定时器自动换帧
        super().__init__(parent)#初始化QObject
        self.size = size
        self.frames_by_state = self._load_frames()#加载状态动画图，按状态保存
        self.state = "idle"
        self.frame_index = 0
        self.has_finished_current_state = False

        self.timer = QTimer(self)#创建一个定时器
        self.timer.timeout.connect(self.next_frame)#在timer时间内调用一次

    def start(self, interval_ms: int | None = None) -> None:
        if interval_ms is None:
            interval_ms = self.STATE_INTERVALS.get(self.state, 140)

        self.timer.start(interval_ms)#间隔毫秒
        self.next_frame()

    def set_state(self, state: str) -> None:
        if state not in self.frames_by_state:
            state = "idle"

        if self.state == state:
            return

        self.state = state
        self.frame_index = 0
        self.has_finished_current_state = False

        interval = self.STATE_INTERVALS.get(state, 140)
        self.timer.setInterval(interval)

        self.next_frame()

    def next_frame(self) -> None:
        frames = (
                self.frames_by_state.get(self.state)
                or self.frames_by_state["idle"]
        )

        if not frames:
            return

        self.frame_changed.emit(frames[self.frame_index])

        if self.state in self.ONE_SHOT_STATES:
            if self.frame_index < len(frames) - 1:
                self.frame_index += 1
            else:
                if not self.has_finished_current_state:
                    self.has_finished_current_state = True
                    self.state_finished.emit(self.state)
            return

        # 其他动画继续循环
        self.frame_index = (self.frame_index + 1) % len(frames)

    def _load_frames(self) -> dict[str, list[QPixmap]]:
        frames_by_state = {}

        for state, (folder, prefix, count) in self.FRAME_PATTERN.items():
            folder_path = ASSETS_DIR / "animations" / "cat" / folder
            frames_by_state[state] = self._load_sequence(
                folder_path,
                prefix,
                count,
            )

        cat_folder = ASSETS_DIR / "animations" / "cat"
        for state, relative_path in self.STATIC_FRAMES.items():
            image_path = cat_folder / relative_path
            frames_by_state[state] = (
                [self._scaled_pixmap(image_path)]
                if image_path.exists()
                else []
            )

        type_folder = ASSETS_DIR / "animations" / "cat" / "type"

        # 打开日记窗口：hide_04 到 hide_01，只播放一次。
        frames_by_state["diary_open_enter"] = self._load_sequence_range_reverse(
            type_folder,
            "hide_",
            4,
            1,
        )

        # 接着恢复到盒中等待姿势：hide_01 到 hide_12，只播放一次。
        frames_by_state["diary_open_exit"] = self._load_sequence_range(
            type_folder,
            "hide_",
            1,
            12,
        )

        # 日记窗口打开后，小猫在盒子中的等待循环。
        frames_by_state["diary_waiting"] = self._load_sequence_range(
            type_folder,
            "hide_",
            4,
            12,
        )

        # 本次进入 Diary 页面后的第一次输入：进入打字姿势。
        frames_by_state["diary_typing_enter"] = self._load_sequence_range_reverse(
            type_folder,
            "hide_",
            4,
            1,
        )

        # 第一次输入触发后，只要仍在 Diary 页面就持续循环。
        frames_by_state["diary_typing"] = self._load_sequence_range(
            type_folder,
            "typing_",
            1,
            8,
        )

        # 从 Diary 切换到其他页面时，离开打字姿势。
        frames_by_state["diary_typing_exit"] = self._load_sequence_range(
            type_folder,
            "hide_",
            1,
            12,
        )

        if not frames_by_state["idle"]:
            fallback = (
                    ASSETS_DIR
                    / "animations"
                    / "cat"
                    / "standy_rect"
                    / "idle"
                    / "sitting.png"
            )

            if fallback.exists():
                frames_by_state["idle"] = [
                    self._scaled_pixmap(fallback)
                ]

        for state, frames in list(frames_by_state.items()):
            if not frames:
                frames_by_state[state] = frames_by_state["idle"]

        return frames_by_state

    def _load_sequence(self, folder: Path, prefix: str, count: int) -> list[QPixmap]:
        """加载一组连续图片"""
        frames = []

        for index in range(1, count + 1):
            image_path = folder / f"{prefix}{index:02d}.png"

            if image_path.exists():
                frames.append(self._scaled_pixmap(image_path))

        return frames

    def _load_sequence_range(
            self,
            folder: Path,
            prefix: str,
            start: int,
            end: int,
    ) -> list[QPixmap]:
        frames = []

        for index in range(start, end + 1):
            image_path = folder / f"{prefix}{index:02d}.png"

            if image_path.exists():
                frames.append(self._scaled_pixmap(image_path))

        return frames

    def _load_sequence_range_reverse(
            self,
            folder: Path,
            prefix: str,
            start: int,
            end: int,
    ) -> list[QPixmap]:
        frames = []

        for index in range(start, end - 1, -1):
            image_path = folder / f"{prefix}{index:02d}.png"

            if image_path.exists():
                frames.append(self._scaled_pixmap(image_path))

        return frames

    def _scaled_pixmap(self, image_path: Path) -> QPixmap:
        pixmap = QPixmap(str(image_path))
        return pixmap.scaledToHeight(self.size)
