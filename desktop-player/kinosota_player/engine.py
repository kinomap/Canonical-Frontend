"""mpv child process with private JSON IPC. Media tokens never enter argv."""
import json, os, shutil, socket, subprocess, sys, tempfile, time, uuid, threading
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit
def child_environment():
    """Do not inject PyInstaller's Qt/libstdc++ into the distro mpv process."""
    env=os.environ.copy()
    if getattr(sys,'frozen',False) and sys.platform.startswith('linux'):
        original=env.get('LD_LIBRARY_PATH_ORIG')
        if original:env['LD_LIBRARY_PATH']=original
        else:env.pop('LD_LIBRARY_PATH',None)
        env.pop('LD_LIBRARY_PATH_ORIG',None)
    return env

_spawn_lock=threading.RLock()
@contextmanager
def native_loader():
    """Do not pass PyInstaller's DLL search directory to the mpv child."""
    with _spawn_lock:
        if os.name!='nt' or not getattr(sys,'frozen',False):
            yield
            return
        import ctypes
        kernel=ctypes.windll.kernel32
        buffer=ctypes.create_unicode_buffer(32768)
        kernel.GetDllDirectoryW(len(buffer),buffer)
        previous=buffer.value
        if not kernel.SetDllDirectoryW(None):raise OSError('Cannot reset child DLL search directory')
        try:yield
        finally:
            if not kernel.SetDllDirectoryW(previous or None):raise OSError('Cannot restore DLL search directory')

class Mpv:
    def __init__(self,executable=None):
        root=Path(getattr(sys,'_MEIPASS',Path(__file__).parent))
        bundled=root/'mpv'/('mpv.exe' if os.name=='nt' else 'mpv')
        self.executable=executable or (str(bundled) if bundled.is_file() else shutil.which('mpv'))
        self.process=None;self.directory=None;self.endpoint=''
    def start(self,url,*,extra_args=()):
        parts=urlsplit(url)
        if parts.scheme!='https' or not parts.netloc or parts.username or parts.password:
            raise ValueError('Only HTTPS media URLs are supported')
        if not self.executable:raise RuntimeError('mpv не установлен. Переустановите KINOSOTA Player.')
        self.stop()
        self.directory=tempfile.TemporaryDirectory(prefix='kinosota-player-')
        self.endpoint=(r'\\.\pipe\kinosota-'+uuid.uuid4().hex) if os.name=='nt' else str(Path(self.directory.name)/'mpv.sock')
        args=[self.executable,'--no-config','--idle=once','--force-window=yes','--keep-open=no',
              '--terminal=no','--autofit=88%x88%','--autofit-larger=88%x88%','--osc=yes','--title=KINOSOTA Player','--input-ipc-server='+self.endpoint,*extra_args]
        with native_loader():
            self.process=subprocess.Popen(args,env=child_environment(),stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0) if os.name=='nt' else 0)
        try:
            for _ in range(100):
                if self.process.poll() is not None:raise RuntimeError('Не удалось запустить окно воспроизведения.')
                try:
                    self.command(['loadfile',url,'replace']);break
                except (OSError,TimeoutError):time.sleep(.05)
            else:raise RuntimeError('mpv не отвечает. Попробуйте переустановить приложение.')
        except Exception:self.stop();raise
    def command(self,command):
        # Keep IPC open until mpv acknowledges the command. Closing immediately
        # can discard loadfile on mpv 0.35 before execution (Broken pipe).
        request_id=uuid.uuid4().hex
        payload=(json.dumps({'command':command,'request_id':request_id})+'\n').encode()
        deadline=time.monotonic()+2
        if os.name=='nt':
            import ctypes,msvcrt
            with open(self.endpoint,'r+b',buffering=0) as pipe:
                pipe.write(payload)
                handle=msvcrt.get_osfhandle(pipe.fileno())
                def read_pipe():
                    available=ctypes.c_ulong()
                    while time.monotonic()<deadline:
                        if not ctypes.windll.kernel32.PeekNamedPipe(ctypes.c_void_p(handle),None,0,None,ctypes.byref(available),None):
                            raise OSError('mpv IPC pipe closed')
                        if available.value:return pipe.read(min(available.value,8192))
                        time.sleep(.01)
                    raise TimeoutError('mpv IPC response timed out')
                return self._response(read_pipe,request_id,deadline)
        else:
            with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as connection:
                connection.settimeout(2);connection.connect(self.endpoint);connection.sendall(payload)
                return self._response(lambda:connection.recv(8192),request_id,deadline)

    @staticmethod
    def _response(read,request_id,deadline):
        buffer=b''
        while time.monotonic()<deadline:
            chunk=read()
            if not chunk:raise OSError('mpv IPC closed before acknowledgement')
            buffer+=chunk
            if len(buffer)>1048576:raise OSError('mpv IPC response too large')
            while b'\n' in buffer:
                line,buffer=buffer.split(b'\n',1)
                response=json.loads(line)
                if response.get('request_id')==request_id:
                    if response.get('error')!='success':raise RuntimeError('mpv отклонил команду воспроизведения.')
                    return response.get('data')
        raise TimeoutError('mpv IPC response timed out')

    def stop(self):
        if self.process:
            if self.process.poll() is None:
                self.process.terminate()
                try:self.process.wait(timeout=3)
                except subprocess.TimeoutExpired:self.process.kill();self.process.wait(timeout=3)
            self.process=None
        if self.directory:self.directory.cleanup();self.directory=None
    def alive(self):return bool(self.process and self.process.poll() is None)

    def exit_code(self):return self.process.poll() if self.process else None
