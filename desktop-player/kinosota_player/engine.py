"""mpv child process with private JSON IPC. Media tokens never enter argv."""
import json, os, shutil, socket, subprocess, sys, tempfile, time, uuid
from pathlib import Path
from urllib.parse import urlsplit
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
              '--terminal=no','--osc=yes','--title=KINOSOTA Player','--input-ipc-server='+self.endpoint,*extra_args]
        self.process=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
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
        payload=(json.dumps({'command':command})+'\n').encode()
        if os.name=='nt':
            with open(self.endpoint,'r+b',buffering=0) as pipe:pipe.write(payload)
        else:
            with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as connection:
                connection.settimeout(1);connection.connect(self.endpoint);connection.sendall(payload)
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
