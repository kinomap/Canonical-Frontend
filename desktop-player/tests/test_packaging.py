from pathlib import Path
import importlib.util,hashlib,json,zipfile
import pytest
P=Path(__file__).resolve().parents[1]/'packaging/verify_bundle.py'
spec=importlib.util.spec_from_file_location('verify_bundle',P);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def make(tmp_path,extra=None):
 files={'mpv.exe':b'fixture-not-executable','LICENSES/mpv.txt':b'fixture-license'}
 if extra:files.update(extra)
 manifest={'system':'Windows','architecture':'x86_64','sources':['https://example.invalid/source'], 'files':{k:hashlib.sha256(v).hexdigest() for k,v in files.items()}}
 p=tmp_path/'bundle.zip'
 with zipfile.ZipFile(p,'w') as z:
  for k,v in files.items():
   # Preserve hostile raw ZIP names: ZipInfo normalizes os.sep on Windows.
   info=zipfile.ZipInfo(k);info.filename=k;z.writestr(info,v)
  z.writestr('bundle.json',json.dumps(manifest))
 return p,hashlib.sha256(p.read_bytes()).hexdigest()
def test_valid_bundle_extracts_hashed_regular_files(tmp_path):
 p,h=make(tmp_path);assert m.unpack(p,h,tmp_path/'out','Windows')==hashlib.sha256(b'fixture-not-executable').hexdigest()
 assert (tmp_path/'out/LICENSES/mpv.txt').is_file()
@pytest.mark.parametrize('name',['../outside','/absolute','C:/outside','a\\b'])
def test_traversal_refused_before_writes(tmp_path,name):
 p,h=make(tmp_path,{name:b'bad'})
 with pytest.raises(ValueError,match='Unsafe'):m.unpack(p,h,tmp_path/'out','Windows')
 assert not (tmp_path/'out').exists()
def test_wrong_archive_digest_refused(tmp_path):
 p,h=make(tmp_path)
 with pytest.raises(ValueError,match='SHA256 mismatch'):m.unpack(p,'0'*64,tmp_path/'out','Windows')
def test_wrong_platform_refused(tmp_path):
 p,h=make(tmp_path)
 with pytest.raises(ValueError):m.unpack(p,h,tmp_path/'out','Darwin')
def test_symlink_refused(tmp_path):
 p,h=make(tmp_path)
 with zipfile.ZipFile(p,'a') as z:
  info=zipfile.ZipInfo('link');info.create_system=3;info.external_attr=0o120777<<16;z.writestr(info,'/etc/passwd')
 with pytest.raises(ValueError,match='regular'):m.unpack(p,hashlib.sha256(p.read_bytes()).hexdigest(),tmp_path/'out','Windows')

@pytest.mark.parametrize('name',['CON','aux.txt','mpv.exe.','dir/file ','MPV.EXE'])
def test_windows_unsafe_names_and_collisions(tmp_path,name):
 p,h=make(tmp_path,{name:b'bad'})
 with pytest.raises(ValueError):m.unpack(p,h,tmp_path/'out','Windows')
 assert not (tmp_path/'out').exists()
def test_modified_dependency_refused_before_native_build(tmp_path,monkeypatch):
 p,h=make(tmp_path);out=tmp_path/'out';m.unpack(p,h,out,'Windows')
 monkeypatch.setattr('platform.machine',lambda:'AMD64')
 assert m.validate_directory(out,'Windows')['architecture']=='x86_64'
 (out/'LICENSES/mpv.txt').write_text('modified')
 with pytest.raises(ValueError,match='modified'):m.validate_directory(out,'Windows')
