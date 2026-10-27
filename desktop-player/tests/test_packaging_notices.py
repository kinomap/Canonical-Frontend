import importlib.util,hashlib,json
from pathlib import Path
import pytest
ROOT=Path(__file__).resolve().parents[1]/'packaging'
spec=importlib.util.spec_from_file_location('package_notices',ROOT/'package_notices.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def test_required_qt_pyside_notices_are_pinned():
    entries=module.verify_notices();assert len(entries)>10
    assert all('/v6.10.3/LICENSES/' in e['source'] for e in entries)
    assert (ROOT/'SOURCES-AND-RELINKING.md').is_file()

def test_tampered_notice_is_rejected(tmp_path):
    f=tmp_path/'Qt-6.10.3/GPL-3.0-only.txt';f.parent.mkdir();f.write_text('modified')
    (tmp_path/'provenance.json').write_text(json.dumps([{'file':'Qt-6.10.3/GPL-3.0-only.txt','sha256':'0'*64}]))
    with pytest.raises(RuntimeError,match='digest'):module.verify_notices(tmp_path)
