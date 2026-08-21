import sys

from PySide6.QtGui import QIcon
from PySide6.QtWidgets import QApplication

from .paths import APP_ICON_FILE
from .pet.pet_window import PetWindow


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("DesktopPet")
    app.setWindowIcon(QIcon(str(APP_ICON_FILE)))
    app.setQuitOnLastWindowClosed(False)

    window = PetWindow()
    window.show()

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
