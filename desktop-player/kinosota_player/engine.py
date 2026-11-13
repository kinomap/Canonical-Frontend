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
# The launch splash waits this long for the first video frame before it hands the screen to mpv anyway.
FIRST_FRAME_TIMEOUT=30
OPT_LINUX_MPV=Path('/opt/kinosota-player/mpv/mpv')
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

def _is_executable_mpv(path):
    """Return True only when ``[path, '--version']`` exits with code 0 within 1s."""
    if not path:
        return False
    candidate=Path(str(path))
    if not candidate.is_file() or not os.access(candidate,os.X_OK):
        return False
    try:
        with native_loader():
            res=subprocess.run(
                [str(candidate),'--version'],
                env=child_environment(),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=1,
                check=False,
                creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0) if os.name=='nt' else 0,
            )
        return res.returncode==0
    except (OSError,subprocess.SubprocessError,ValueError):
        return False

def _resolve_mpv_executable(executable=None):
    """Resolve a working mpv binary: explicit -> bundled (_MEIPASS) -> /opt/kinosota-player -> system PATH."""
    if executable:
        return str(executable)
    root=Path(getattr(sys,'_MEIPASS',Path(__file__).parent))
    bundled=root/'mpv'/('mpv.exe' if os.name=='nt' else 'mpv')
    if bundled.is_file() and _is_executable_mpv(bundled):
        return str(bundled)
    if sys.platform.startswith('linux') and OPT_LINUX_MPV.is_file() and _is_executable_mpv(OPT_LINUX_MPV):
        return str(OPT_LINUX_MPV)
    return shutil.which('mpv')

class Mpv:
    def __init__(self,executable=None):
        self.executable=_resolve_mpv_executable(executable)
        self.process=None;self.directory=None;self.endpoint='';self._prewarmed_args=None
    def _base_args(self,extra_args=(),idle='once'):
        return [self.executable,'--no-config',f'--idle={idle}','--force-window=yes','--keep-open=no',
                '--osd-level=0','--no-osc',
                # Instant first frame + adaptive stream cache and fast reconnect.
                '--cache=yes','--demuxer-max-bytes=150MiB','--demuxer-readahead-secs=10',
                '--cache-pause-wait=1','--cache-pause-initial=yes','--network-timeout=60',
                '--stream-lavf-o=reconnect=1,reconnect_streamed=1,reconnect_delay_max=3',
                '--terminal=no','--autofit=88%x88%','--autofit-larger=88%x88%','--title=KINOSOTA Player',
                '--input-ipc-server='+self.endpoint,*extra_args]
    def prewarm(self,*,extra_args=()):
        """Spawn mpv in --idle=yes mode under the splash while the launch ticket is being fetched."""
        with _spawn_lock:
            if not self.executable or self.alive():return
            self.stop()
            self.directory=tempfile.TemporaryDirectory(prefix='kinosota-player-')
            self.endpoint=(r'\\.\pipe\kinosota-'+uuid.uuid4().hex) if os.name=='nt' else str(Path(self.directory.name)/'mpv.sock')
            self._prewarmed_args=tuple(extra_args)
            args=self._base_args(extra_args=extra_args,idle='yes')
            with native_loader():
                self.process=subprocess.Popen(args,env=child_environment(),stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0) if os.name=='nt' else 0)
    def start(self,url,*,extra_args=()):
        parts=urlsplit(url)
        if parts.scheme!='https' or not parts.netloc or parts.username or parts.password:
            raise ValueError('Only HTTPS media URLs are supported')
        if not self.executable:raise RuntimeError('mpv не установлен. Переустановите KINOSOTA Player.')
        with _spawn_lock:
            if not (self.alive() and self._prewarmed_args==tuple(extra_args)):
                self.stop()
                self.directory=tempfile.TemporaryDirectory(prefix='kinosota-player-')
                self.endpoint=(r'\\.\pipe\kinosota-'+uuid.uuid4().hex) if os.name=='nt' else str(Path(self.directory.name)/'mpv.sock')
                args=self._base_args(extra_args=extra_args,idle='once')
                with native_loader():
                    self.process=subprocess.Popen(args,env=child_environment(),stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                    creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0) if os.name=='nt' else 0)
            self._prewarmed_args=None
            proc=self.process
        try:
            for _ in range(200):
                if proc is None or proc.poll() is not None:raise RuntimeError('Не удалось запустить окно воспроизведения.')
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
        with _spawn_lock:
            if self.process:
                if self.process.poll() is None:
                    self.process.terminate()
                    try:self.process.wait(timeout=3)
                    except subprocess.TimeoutExpired:self.process.kill();self.process.wait(timeout=3)
                self.process=None
            self._prewarmed_args=None
            if self.directory:self.directory.cleanup();self.directory=None
    def alive(self):return bool(self.process and self.process.poll() is None)

    def exit_code(self):return self.process.poll() if self.process else None

    def property(self,name):
        """One mpv property over JSON IPC; None while mpv has no value yet ("property unavailable")."""
        try:return self.command(['get_property',name])
        except RuntimeError:return None

    def enable_osc(self):
        """Enable mpv OSC and OSD only after the first video frame is actively playing."""
        for cmd in (['set_property','osc',True],['set_property','osd-level',1]):
            try:self.command(cmd)
            except Exception:pass

    @staticmethod
    def frame_ready(playback_time,video_params=None):
        """Strict first-frame detector: playback-time must advance to >= 0.2s (never pop-in on demuxer dw/dh)."""
        return type(playback_time) in (int,float) and playback_time>=0.2

    def wait_playback_started(self,timeout=FIRST_FRAME_TIMEOUT,*,cancelled=lambda:False,interval=.1,sleep=time.sleep,clock=time.monotonic):
        """Block (off the UI thread) until the first frame is on screen.

        Returns 'playing', 'eof' (the file ended before a frame), 'exited' (mpv quit or crashed),
        'cancelled' or 'timeout'. A broken IPC connection is retried while the process is alive."""
        deadline=clock()+max(float(timeout),0.0)
        while True:
            if cancelled():return 'cancelled'
            if not self.alive():return 'exited'
            try:
                eof=self.property('eof-reached') is True
                if not eof and self.frame_ready(self.property('playback-time')):
                    self.enable_osc()
                    return 'playing'
                if eof:return 'eof'
            except (OSError,TimeoutError,ValueError):
                if not self.alive():return 'exited'
            if cancelled():return 'cancelled'
            if clock()>=deadline:return 'timeout'
            sleep(interval)
