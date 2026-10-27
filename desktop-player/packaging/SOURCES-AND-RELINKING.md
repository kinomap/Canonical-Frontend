# Third-party sources and replacement of shared libraries

This application uses unmodified PySide6 / shiboken6 6.10.3 binary wheels from
PyPI and the Qt 6.10.3 shared libraries supplied by those wheels. Qt/PySide6
copyright belongs to The Qt Company Ltd. and the other contributors identified
in the upstream source files. The included LGPL/GPL and third-party license
texts and source headers govern their respective components; inclusion of a
license text does not elect that license for every component.

## Exact-version Qt / PySide6 source and build instructions

- PySide6 and shiboken6 source: https://github.com/pyside/pyside-setup/tree/v6.10.3
- Download source: https://github.com/pyside/pyside-setup/archive/refs/tags/v6.10.3.tar.gz
- Qt base (Core, Gui, Widgets and platform plugins): https://github.com/qt/qtbase/tree/v6.10.3
- Download source: https://github.com/qt/qtbase/archive/refs/tags/v6.10.3.tar.gz
- Additional Qt module sources, when present in the packaged wheel plugins:
  https://github.com/qt/qtdeclarative/tree/v6.10.3
  https://github.com/qt/qtimageformats/tree/v6.10.3
  https://github.com/qt/qtsvg/tree/v6.10.3
  https://github.com/qt/qtwayland/tree/v6.10.3
  https://github.com/qt/qtshadertools/tree/v6.10.3
  https://github.com/qt/qttools/tree/v6.10.3
- Upstream Qt build instructions: https://doc.qt.io/qt-6.10/build-sources.html
- PySide6 build instructions are in README.md of the pinned source tree above.
- Exact Python dependency versions are in the adjacent inventory.json.
- Python source/license for the bundled interpreter version is available at
  https://www.python.org/downloads/source/ and https://github.com/python/cpython .
  The build uses Python 3.11 and PyInstaller 6.16.0; the cloud workflow records
  the native interpreter and toolchain used for each build.

Qt is dynamically linked, not statically linked into the application executable.
The onedir layout deliberately leaves its shared libraries replaceable. For a
modified, ABI-compatible Qt/PySide6 build, first quit the application and back up
the application folder. Replace the corresponding Qt libraries and PySide6
extension modules together in `_internal/PySide6` and the adjacent shared-library
folders (macOS: within the application's Contents/Frameworks/Resources layout).
Use the same architecture, Python 3.11 ABI and Qt/PySide6 6.10 ABI, and follow the
upstream build instructions for your OS. No application checksum check prevents
loading such modified libraries. Replacing signed application contents, if a
future signed release is used, may invalidate the OS signature.

The native packaging recipe is desktop-player/packaging/build.py in the KINOSOTA
source repository. From desktop-player on the target OS, create a Python 3.11
virtual environment, install requirements.txt and PyInstaller==6.16.0, then run
`python packaging/build.py` on Linux, or `python packaging/ci_bundle.py` with the
native mpv dependency toolchain on Windows/macOS. The cloud workflow is the
reproducible reference for toolchain setup; do not execute native builds on a
user's weak computer. This document is not a claim of bit-for-bit reproducibility.

No restriction is imposed on reverse engineering for debugging modifications to
LGPL-covered components. Do not remove upstream copyright/license notices.

## mpv / FFmpeg and native dependencies

On Linux mpv and its dependencies are installed by the OS package manager rather
than bundled by KINOSOTA. Obtain their sources using your distribution's source
package facilities for the installed package versions.

Windows/macOS include a separate mpv executable and shared dependencies. Their
LICENSES directory, package-versions.txt (Windows), homebrew-inventory.json
(macOS), and bundle.json identify versions, notices, hashes and source locations.
Windows package source recipes and corresponding source archive directory:
https://github.com/msys2/MINGW-packages and
https://repo.msys2.org/mingw/sources/ . Match the exact package versions recorded
in package-versions.txt. macOS upstream source archive URLs and exact installed
formula versions are recorded in homebrew-inventory.json; formula recipes are
available at https://github.com/Homebrew/homebrew-core . mpv/FFmpeg licensing
varies by build configuration; preserve all supplied notices and source access.
