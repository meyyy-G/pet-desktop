def main() -> int:
    try:
        from desktop_pet.app import main as run_app
    except ModuleNotFoundError as exc:
        if exc.name == "PySide6":
            print("PySide6 is not installed.")
            print("Run: .venv\\Scripts\\python.exe -m pip install PySide6")
            return 1
        raise

    return run_app()

if __name__ == "__main__":
    raise SystemExit(main())