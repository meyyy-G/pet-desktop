from pathlib import Path


project_root = Path(SPECPATH)
src_dir = project_root / "src"

datas = [
    (str(project_root / "assets" / "animations"), "assets/animations"),
    (str(project_root / "assets" / "images" / "app-icon.png"), "assets/images"),
    (str(project_root / "assets" / "images" / "Journal_icon.ico"), "assets/images"),
    (str(project_root / "assets" / "web"), "assets/web"),
    (str(src_dir / "desktop_pet" / "web"), "desktop_pet/web"),
]

# The application uses Qt Widgets + QWebEngineView, not Qt Quick/QML.  PyInstaller's
# Qt hooks otherwise collect the complete QML plugin tree, which pulls unrelated
# 3D, charts, PDF, multimedia, and virtual-keyboard libraries into the bundle.
excluded_qt_modules = [
    "PySide6.Qt3DAnimation",
    "PySide6.Qt3DCore",
    "PySide6.Qt3DExtras",
    "PySide6.Qt3DInput",
    "PySide6.Qt3DLogic",
    "PySide6.Qt3DRender",
    "PySide6.QtCharts",
    "PySide6.QtDataVisualization",
    "PySide6.QtGraphs",
    "PySide6.QtGraphsWidgets",
    "PySide6.QtLocation",
    "PySide6.QtMultimedia",
    "PySide6.QtMultimediaWidgets",
    "PySide6.QtPdf",
    "PySide6.QtPdfWidgets",
    "PySide6.QtQuick3D",
    "PySide6.QtQuickControls2",
    "PySide6.QtQuickWidgets",
    "PySide6.QtRemoteObjects",
    "PySide6.QtScxml",
    "PySide6.QtSpatialAudio",
    "PySide6.QtTextToSpeech",
]

excluded_qt_binary_prefixes = (
    "pyside6/qt63d",
    "pyside6/qt6charts",
    "pyside6/qt6datavisualization",
    "pyside6/qt6graphs",
    "pyside6/qt6location",
    "pyside6/qt6multimedia",
    "pyside6/qt6pdf",
    "pyside6/qt6quick3d",
    "pyside6/qt6remoteobjects",
    "pyside6/qt6scxml",
    "pyside6/qt6spatialaudio",
)

a = Analysis(
    [str(src_dir / "desktop_pet_app.py")],
    pathex=[str(src_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excluded_qt_modules,
    noarchive=False,
    optimize=0,
)


def keep_qt_file(toc_entry):
    bundle_path = toc_entry[0].replace("\\", "/").lower()
    source_path = toc_entry[1].replace("\\", "/").lower()

    # PyInstaller can discover DLLs from unrelated tools on the build host.
    # Codex's bundled Poppler/libheif DLLs shadow Windows/Qt DLLs at runtime
    # and prevent QtGui from loading in the frozen application.
    if "/codex-runtimes/codex-primary-runtime/" in source_path:
        return False

    # No application screen uses QML. QtQml/QtQuick runtime DLLs are deliberately
    # left alone because Qt WebEngine may link against them internally.
    if bundle_path.startswith("pyside6/qml/"):
        return False

    # These shared libraries were pulled in only by the removed QML plugins.
    # Keep all Qt/WebEngine, Qml, Quick, OpenGL, Network, and rendering basics.
    if bundle_path.startswith(excluded_qt_binary_prefixes):
        return False

    # Release builds do not need Chromium's duplicate debug resource packs.
    if bundle_path.endswith(".debug.pak"):
        return False

    return True


a.binaries = [entry for entry in a.binaries if keep_qt_file(entry)]
a.datas = [entry for entry in a.datas if keep_qt_file(entry)]

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="DesktopPet",
    icon=str(project_root / "assets" / "images" / "app-icon.ico"),
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
