from PySide6.QtCore import QObject, QPoint, QTimer, Signal
from PySide6.QtGui import QMouseEvent
from PySide6.QtWidgets import QApplication, QWidget


class PetPhysics(QObject):
    clicked = Signal()
    drag_started = Signal()
    landed = Signal()

    def __init__(self, window: QWidget, parent=None):
        super().__init__(parent)

        self.window = window
        self.drag_offest = QPoint()#鼠标点下去时，鼠标距离窗口左上角有多远
        self.press_pos = QPoint()

        self.was_dragging = False#是否进入拖动状态
        self.click_move_threshold = 6 #移动门槛
        self.ignore_next_release = False

        self.fall_velocity = 0
        self.fall_target_y = 0 #下落最终停的y坐标

        self.fall_timer = QTimer(self) #不断更新位置
        self.fall_timer.timeout.connect(self._update_fall)

        self.click_timer = QTimer(self)
        self.click_timer.setSingleShot(True)
        self.click_timer.timeout.connect(self.clicked.emit)

    def press(self, event: QMouseEvent) -> None:
        self.drag_offest = event.globalPosition().toPoint() - self.window.frameGeometry().topLeft() #记录鼠标在窗口内部点中的位置
        self.press_pos = event.globalPosition().toPoint()
        self.was_dragging = False

    def move(self, event: QMouseEvent) -> None:
        current_pos = event.globalPosition().toPoint()

        if (current_pos - self.press_pos).manhattanLength() > self.click_move_threshold:
            if not self.was_dragging:
                self.was_dragging = True
                self.fall_timer.stop()
                self.drag_started.emit()

        self.window.move(current_pos - self.drag_offest)

    def release(self, event: QMouseEvent) -> None:
        if self.ignore_next_release:
            self.ignore_next_release = False
            return

        if self.was_dragging:
            self.cancel_pending_click()
            self.start_fall()
            return

        self.click_timer.start(QApplication.doubleClickInterval())

    def cancel_pending_click(self) -> None:
        if self.click_timer.isActive():
            self.click_timer.stop()

    def handle_double_click(self) -> None:
        self.cancel_pending_click()
        self.ignore_next_release = True

    def start_fall(self) -> None:
        self.fall_velocity = 0
        self.fall_target_y = self.window.y() + 36
        self.fall_timer.start(16)

    def _update_fall(self) -> None:
        self.fall_velocity += 3 #模拟重力，速度越来越大
        next_y = self.window.y() + self.fall_velocity #计算下一帧的位置

        if next_y >= self.fall_target_y:#判断有没有到目标点
            self.window.move(self.window.x(), self.fall_target_y)
            self.fall_timer.stop()
            self._land()
            return

        self.window.move(self.window.x(), next_y)

    def _land(self) -> None:
        self.window.move(self.window.x(), self.window.y() - 6)#先往上弹
        QTimer.singleShot(80, lambda : self.window.move(self.window.x(), self.window.y() + 6))#80ms后落回来
        QTimer.singleShot(130, self.landed.emit)