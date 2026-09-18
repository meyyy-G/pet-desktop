import sys

from PySide6.QtGui import QIcon
from PySide6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

from .paths import APP_ICON_FILE
from .pet.pet_window import PetWindow


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("DesktopPet")
    app.setWindowIcon(QIcon(str(APP_ICON_FILE)))
    app.setQuitOnLastWindowClosed(False)

    window = PetWindow()
    window.show()

    if QSystemTrayIcon.isSystemTrayAvailable():
        tray_menu = QMenu()
        open_diary_action = tray_menu.addAction("打开今日手帐")
        open_diary_action.triggered.connect(window._open_diary_window)
        tray_menu.addSeparator()
        quit_action = tray_menu.addAction("退出")
        quit_action.triggered.connect(window._quit_app)

        tray_icon = QSystemTrayIcon(app.windowIcon(), app)
        tray_icon.setToolTip("DesktopPet")
        tray_icon.setContextMenu(tray_menu)
        tray_icon.activated.connect(
            lambda reason: window._open_diary_window()
            if reason == QSystemTrayIcon.ActivationReason.DoubleClick
            else None
        )
        tray_icon.show()

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
