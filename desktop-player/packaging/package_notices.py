"""Package pinned, checked-in Qt/PySide6 notices even when wheels omit LICENSES."""
import hashlib,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def verify_notices(root=ROOT/'third-party'):
    entries=json.loads((root/'provenance.json').read_text(encoding='utf-8'))
    for item in entries:
        source=root/item['file']
        if source.resolve().parent.parent != root.resolve() or not source.is_file():raise RuntimeError('Invalid third-party notice path')
        if hashlib.sha256(source.read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Third-party notice digest mismatch')
    for label in ('Qt-6.10.3','PySide6-6.10.3'):
        for name in ('LGPL-3.0-only.txt','GPL-3.0-only.txt'):
            if not any(x['file']==label+'/'+name for x in entries):raise RuntimeError('Required Qt/PySide6 license absent')
    return entries

def copy_notices(destination):
    import importlib.metadata as md
    if any(md.version(n)!='6.10.3' for n in ('PySide6','shiboken6')):raise RuntimeError('Update pinned Qt/PySide notices for this version')
    verify_notices()
    shutil.copytree(ROOT/'third-party',destination/'Qt-PySide6',dirs_exist_ok=True)
    shutil.copy2(ROOT/'SOURCES-AND-RELINKING.md',destination/'SOURCES-AND-RELINKING.md')
