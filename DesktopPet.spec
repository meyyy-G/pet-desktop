from pathlib import Path


project_root = Path(SPECPATH)
src_dir = project_root / "src"

datas = [
    (str(project_root / "assets" / "animations"), "assets/animations"),
    (str(project_root / "assets" / "images" / "app-icon.png"), "assets/images"),
    (str(project_root / "assets" / "images" / "ui"), "assets/images/ui"),
    (str(src_dir / "desktop_pet" / "web"), "desktop_pet/web"),
]

a = Analysis(
    [str(src_dir / "desktop_pet_app.py")],
    pathex=[str(src_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
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

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="DesktopPet",
)
