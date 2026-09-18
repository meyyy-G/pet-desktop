"""Visual tester for the Pet Touch recovery transition.

Run from the repository root with:

    python tools/pet_touch_transition_tester.py

This tool uses the production PetState, PetAnimation, and
PetBehaviorStateMachine classes, but it does not load PetWindow, save data,
Diary, decay timers, or desktop drag behavior.
"""

from __future__ import annotations

import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QApplication,
    QComboBox,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from desktop_pet.pet.animation import PetAnimation
from desktop_pet.pet.behavior_state_machine import (
    BehaviorState,
    PetBehaviorStateMachine,
)
from desktop_pet.pet.pet_state import PetState


class TestBehaviorStateMachine(PetBehaviorStateMachine):
    """Production state machine with a controllable inactivity clock."""

    def __init__(self, animation: PetAnimation, parent=None):
        self.test_inactivity_ms = 0
        super().__init__(animation, parent)

    @property
    def inactivity_ms(self) -> int:
        return max(0, self.test_inactivity_ms)


class PetTouchTransitionTester(QMainWindow):
    TEST_CLOCK_INTERVAL_MS = 100
    TOUCH_DURATION_MS = 1_800

    SCENARIOS = {
        "idle": 5 * 60 * 1000,
        "sitting": 15 * 60 * 1000,
        "laydown": 35 * 60 * 1000,
    }

    def __init__(self):
        super().__init__()
        self.setWindowTitle("Pet Touch Transition Tester")
        self.resize(720, 720)

        self.pet_state = PetState()
        self.animation = PetAnimation(220, self)
        self.behavior = TestBehaviorStateMachine(self.animation, self)
        self.behavior.inactivity_timer.stop()

        self._last_animation_snapshot: tuple[str, bool] | None = None
        self._build_ui()
        self._connect_signals()

        self.animation.start()
        self._set_scenario("idle")

        self.test_clock = QTimer(self)
        self.test_clock.setInterval(self.TEST_CLOCK_INTERVAL_MS)
        self.test_clock.timeout.connect(self._advance_test_clock)
        self.test_clock.start()

    def _build_ui(self) -> None:
        central = QWidget(self)
        self.setCentralWidget(central)
        root = QVBoxLayout(central)

        description = QLabel(
            "只测试 Touch 恢复链。模拟时间不会修改正式的 10/20/30 分钟规则，"
            "也不会读取或写入宠物存档。"
        )
        description.setWordWrap(True)
        root.addWidget(description)

        self.preview = QLabel()
        self.preview.setFixedHeight(250)
        self.preview.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.preview.setStyleSheet(
            "QLabel { background: #202631; border: 1px solid #4b5563; }"
        )
        root.addWidget(self.preview)

        status_group = QGroupBox("实时状态")
        status_layout = QGridLayout(status_group)
        self.inactivity_value = QLabel()
        self.behavior_value = QLabel()
        self.animation_value = QLabel()
        self.mode_value = QLabel()
        self.target_value = QLabel()
        self.recovery_value = QLabel()
        self.mood_value = QLabel()

        rows = (
            ("模拟 inactivity", self.inactivity_value),
            ("高层行为", self.behavior_value),
            ("当前动画", self.animation_value),
            ("播放方式", self.mode_value),
            ("Touch 恢复目标", self.target_value),
            ("Touch 恢复阶段", self.recovery_value),
            ("Mood", self.mood_value),
        )
        for row, (title, value_label) in enumerate(rows):
            status_layout.addWidget(QLabel(title), row, 0)
            status_layout.addWidget(value_label, row, 1)
        root.addWidget(status_group)

        scenario_group = QGroupBox("1. 选择 Touch 前的自然姿势")
        scenario_layout = QHBoxLayout(scenario_group)
        for state_name, label in (
            ("idle", "Idle（5分钟）"),
            ("sitting", "Sitting（15分钟）"),
            ("laydown", "Laydown（35分钟）"),
        ):
            button = QPushButton(label)
            button.clicked.connect(
                lambda checked=False, name=state_name: self._set_scenario(name)
            )
            scenario_layout.addWidget(button)
        root.addWidget(scenario_group)

        action_group = QGroupBox("2. 播放与打断")
        action_layout = QHBoxLayout(action_group)
        touch_button = QPushButton("播放 Touch")
        touch_button.clicked.connect(self._play_touch)
        action_layout.addWidget(touch_button)

        self.need_selector = QComboBox()
        self.need_selector.addItems(
            ["angry", "sleepy", "sleep", "cry", "sick", "die", "upset"]
        )
        action_layout.addWidget(self.need_selector)

        need_button = QPushButton("触发 Need")
        need_button.clicked.connect(self._trigger_need)
        action_layout.addWidget(need_button)

        clear_need_button = QPushButton("清除 Need")
        clear_need_button.clicked.connect(self._clear_need)
        action_layout.addWidget(clear_need_button)
        root.addWidget(action_group)

        self.log = QTextEdit()
        self.log.setReadOnly(True)
        self.log.setPlaceholderText("动画和状态转换会显示在这里。")
        root.addWidget(self.log, 1)

        clear_log_button = QPushButton("清空日志")
        clear_log_button.clicked.connect(self.log.clear)
        root.addWidget(clear_log_button)

    def _connect_signals(self) -> None:
        self.animation.frame_changed.connect(self._show_frame)
        self.animation.state_finished.connect(self._animation_finished)
        self.behavior.state_changed.connect(self._behavior_changed)

    def _show_frame(self, pixmap: QPixmap) -> None:
        self.preview.setPixmap(pixmap)
        self._refresh_status()

    def _set_scenario(self, state_name: str) -> None:
        elapsed = self.SCENARIOS[state_name]

        self.behavior.update_need_animation(None)
        self.behavior.register_interaction()
        self.behavior.test_inactivity_ms = elapsed
        self.behavior.update_inactivity(elapsed)

        self._append_log(
            f"场景重置：{state_name}, inactivity={self._format_time(elapsed)}"
        )
        self._refresh_status()

    def _play_touch(self) -> None:
        old_mood = self.pet_state.mood
        self.pet_state.touch()
        self.behavior.play_touch(self.TOUCH_DURATION_MS)
        self._append_log(
            f"Touch：Mood {old_mood} → {self.pet_state.mood}；"
            "inactivity 保持连续"
        )
        self._refresh_status()

    def _trigger_need(self) -> None:
        animation_state = self.need_selector.currentText()
        self.behavior.update_need_animation(animation_state)
        self._append_log(f"触发 Need：{animation_state}")
        self._refresh_status()

    def _clear_need(self) -> None:
        self.behavior.update_need_animation(None)
        self._append_log("清除 Need")
        self._refresh_status()

    def _advance_test_clock(self) -> None:
        self.behavior.test_inactivity_ms += self.TEST_CLOCK_INTERVAL_MS
        self.behavior.update_inactivity(self.behavior.test_inactivity_ms)
        self._refresh_status()

    def _behavior_changed(self, state_name: str) -> None:
        self._append_log(
            f"行为 → {state_name}; 动画={self.animation.state}; "
            f"模式={'one-shot' if self._is_one_shot() else 'loop'}"
        )
        self._refresh_status()

    def _animation_finished(self, state_name: str) -> None:
        self._append_log(f"动画播放完成：{state_name}")
        self._refresh_status()

    def _refresh_status(self) -> None:
        snapshot = (self.animation.state, self._is_one_shot())
        if snapshot != self._last_animation_snapshot:
            self._last_animation_snapshot = snapshot

        recovery_target = self.behavior._recovery_target
        touch_target = self.behavior._touch_recovery_target
        displayed_target = recovery_target or touch_target

        self.inactivity_value.setText(
            self._format_time(self.behavior.inactivity_ms)
        )
        self.behavior_value.setText(self.behavior.state.value)
        self.animation_value.setText(self.animation.state)
        self.mode_value.setText(
            "one-shot" if self._is_one_shot() else "loop"
        )
        self.target_value.setText(
            displayed_target.value if displayed_target is not None else "—"
        )
        if self.behavior.state is BehaviorState.RECOVERING:
            remaining_ms = max(0, self.behavior.touch_recovery_timer.remainingTime())
            self.recovery_value.setText(
                f"sitting loop → laydown（剩余 {remaining_ms / 1000:.1f}s）"
            )
        else:
            self.recovery_value.setText("—")
        self.mood_value.setText(str(self.pet_state.mood))

    def _append_log(self, message: str) -> None:
        self.log.append(
            f"[{self._format_time(self.behavior.inactivity_ms)}] {message}"
        )

    def _is_one_shot(self) -> bool:
        return self.animation.state in self.animation.ONE_SHOT_STATES

    @staticmethod
    def _format_time(milliseconds: int) -> str:
        total_seconds = max(0, milliseconds) // 1000
        minutes, seconds = divmod(total_seconds, 60)
        return f"{minutes:02d}:{seconds:02d}"


def main() -> int:
    app = QApplication(sys.argv)
    window = PetTouchTransitionTester()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
