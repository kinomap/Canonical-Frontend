"""The one version of a build: ``__version__`` in kinosota_player/__init__.py.

pyproject.toml, the Debian control file, the macOS Info.plist, the Windows installer
(/DAppVersion) and the CI receipts all read it from here, so a release bumps one line.
"""
import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERN = re.compile(r'\d+\.\d+\.\d+')


def read_version(root=ROOT):
    source = (Path(root) / 'kinosota_player' / '__init__.py').read_text(encoding='utf-8')
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign) and any(getattr(t, 'id', None) == '__version__' for t in node.targets):
            value = ast.literal_eval(node.value)
            if isinstance(value, str) and PATTERN.fullmatch(value):
                return value
    raise SystemExit('kinosota_player/__init__.py must set __version__ = "X.Y.Z"')


VERSION = read_version()

if __name__ == '__main__':
    print(VERSION)
