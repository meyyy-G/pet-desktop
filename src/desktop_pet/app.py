import sys

from PySide6.QtWidgets import QApplication

from .pet.pet_window import PetWindow


def main() -> int:
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    window = PetWindow()
    window.show()

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())