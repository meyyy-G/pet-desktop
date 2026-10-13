import sys

from PySide6.QtGui import QIcon
from PySide6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

from .data_migration import migrate_legacy_data
from .paths import APP_ICON_FILE
from .pet.pet_window import PetWindow


def main() -> int:
    migrate_legacy_data()
    app = QApplication(sys.argv)
    app.setApplicationName("DesktopPet")
    app.setWindowIcon(QIcon(str(APP_ICON_FILE)))
    app.setQuitOnLastWindowClosed(False)

    window = PetWindow()
    window.show()

    tray_icon = None
    tray_menu = None

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

    def cleanup_tray_icon() -> None:
        """Explicitly unregister the icon before Windows destroys the app."""
        if tray_icon is None:
            return

        tray_icon.hide()
        tray_icon.setContextMenu(None)
        tray_icon.deleteLater()

    app.aboutToQuit.connect(cleanup_tray_icon)

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
