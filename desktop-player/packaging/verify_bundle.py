"""Validate an already-downloaded, reviewed native mpv ZIP. Never runs binaries."""
import argparse,hashlib,json,re,stat,zipfile
from pathlib import Path,PurePosixPath
MAX_BYTES=1024*1024*1024

def unpack(archive,expected,output,system):
    if not re.fullmatch('[0-9a-f]{64}',expected):raise ValueError('Full ZIP SHA256 required')
    if output.exists():raise ValueError('Refusing existing output directory')
    h=hashlib.sha256()
    with archive.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    if h.hexdigest()!=expected:raise ValueError('Archive SHA256 mismatch')
    with zipfile.ZipFile(archive) as z:
        files={};total=0;seen=set()
        for item in z.infolist():
            # ZipInfo may normalize Windows separators or truncate at NUL.
            # Check the original archive name before trusting its normalized name.
            raw=item.orig_filename
            if '\x00' in raw or chr(92) in raw or raw!=item.filename:raise ValueError('Unsafe bundle path')
            path=PurePosixPath(item.filename)
            if '\\' in item.filename or ':' in item.filename or path.is_absolute() or '..' in path.parts or not path.parts:raise ValueError('Unsafe bundle path')
            normalized=str(path).casefold()
            if normalized in seen:raise ValueError('Case-colliding bundle path')
            seen.add(normalized)
            if any(part.endswith(('.', ' ')) or part.split('.')[0].upper() in {'CON','PRN','AUX','NUL',*[f'COM{i}' for i in range(1,10)],*[f'LPT{i}' for i in range(1,10)]} for part in path.parts):raise ValueError('Unsafe native file name')
            mode=item.external_attr>>16
            if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) and not (stat.S_ISDIR(mode) or stat.S_ISREG(mode))):raise ValueError('Only regular bundle files allowed')
            if item.is_dir():continue
            total+=item.file_size
            if total>MAX_BYTES:raise ValueError('Bundle is too large')
            if item.filename in files:raise ValueError('Duplicate bundle entry')
            files[item.filename]=item
        executable='mpv.exe' if system=='Windows' else 'mpv'
        if executable not in files or 'bundle.json' not in files:raise ValueError('Bundle requires executable and bundle.json at ZIP root')
        manifest=json.loads(z.read(files['bundle.json']))
        if manifest.get('system')!=system or manifest.get('architecture') not in ('x86_64','arm64'):raise ValueError('Wrong native platform')
        sources=manifest.get('sources')
        if not isinstance(sources,list) or not sources or any(not isinstance(url,str) or not url.startswith('https://') for url in sources):raise ValueError('Corresponding component source URLs required')
        checks=manifest.get('files',{})
        if set(checks)!=set(files)-{'bundle.json'}:raise ValueError('Every library/license file must be hashed')
        if not any(name.startswith('LICENSES/') for name in checks):raise ValueError('Component licenses required')
        for name,digest in checks.items():
            if not isinstance(digest,str) or not re.fullmatch('[0-9a-f]{64}',digest) or hashlib.sha256(z.read(files[name])).hexdigest()!=digest:raise ValueError('File digest mismatch')
        output.mkdir(parents=True)
        for name,item in files.items():
            dest=output/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(z.read(item));dest.chmod(0o755 if name==executable else 0o644)
    return manifest['files'][executable]

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('archive',type=Path);p.add_argument('--sha256',required=True);p.add_argument('--output',required=True,type=Path);p.add_argument('--system',required=True,choices=['Windows','Darwin']);a=p.parse_args()
    print(unpack(a.archive,a.sha256,a.output,a.system))

def validate_directory(root,system):
    """Builds cannot silently swap a DLL/dylib after the ZIP was reviewed."""
    import platform
    manifest=json.loads((root/'bundle.json').read_text())
    native={'AMD64':'x86_64','x86_64':'x86_64','aarch64':'arm64','arm64':'arm64'}.get(platform.machine())
    if manifest.get('system')!=system or manifest.get('architecture')!=native:raise ValueError('Bundle platform/architecture does not match native build')
    if not manifest.get('sources') or any(not isinstance(x,str) or not x.startswith('https://') for x in manifest['sources']):raise ValueError('Component sources required')
    actual={str(p.relative_to(root)).replace('\\','/'):p for p in root.rglob('*') if not p.is_dir()}
    if any(p.is_symlink() for p in root.rglob('*')):raise ValueError('Bundle symlinks are not allowed')
    files=manifest['files']
    if set(actual)-{'bundle.json'}!=set(files) or not any(x.startswith('LICENSES/') for x in files):raise ValueError('Incomplete bundle inventory')
    for name,expected in files.items():
        if not isinstance(expected,str) or not re.fullmatch('[0-9a-f]{64}',expected) or hashlib.sha256(actual[name].read_bytes()).hexdigest()!=expected:raise ValueError('Bundle file was modified')
    return manifest
