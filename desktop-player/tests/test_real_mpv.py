"""Offline real decoder test over local HTTPS + trusted test-only certificate."""
import functools,json,shutil,socket,ssl,subprocess,threading,time
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import pytest
from kinosota_player.engine import Mpv

@pytest.mark.parametrize('codec,audio,pixel',[('libx264','aac','yuv420p'),('libx265','ac3','yuv420p10le')])
def test_real_https_ipc_and_codecs(tmp_path,codec,audio,pixel):
    assert shutil.which('mpv') and shutil.which('ffmpeg') and shutil.which('openssl')
    media=tmp_path/'movie.mkv'
    args=['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x90:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v',codec,'-pix_fmt',pixel]
    if codec=='libx265':args+=['-x265-params','pools=1:frame-threads=1:log-level=error']
    args+=['-c:a',audio,str(media)]
    subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
    cert=tmp_path/'cert.pem';key=tmp_path/'key.pem'
    subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(cert),'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self,*a):pass
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(tmp_path)))
    context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(cert,key);server.socket=context.wrap_socket(server.socket,server_side=True)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();engine=Mpv()
    def prop(name):
        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as s:
            s.settimeout(2);s.connect(engine.endpoint);s.sendall((json.dumps({'command':['get_property',name],'request_id':99})+'\n').encode());buf=b''
            while True:
                chunk=s.recv(8192)
                if not chunk:raise AssertionError('mpv IPC closed before property response')
                buf+=chunk
                while b'\n' in buf:
                    line,buf=buf.split(b'\n',1);row=json.loads(line)
                    if row.get('request_id')==99:return row.get('data')
    try:
        engine.start(f'https://127.0.0.1:{server.server_port}/movie.mkv?token=fixture-only',extra_args=['--vo=null','--ao=null','--pause=yes','--tls-ca-file='+str(cert),'--log-file='+str(tmp_path/'mpv.log')])
        deadline=time.monotonic()+20
        video=None
        while time.monotonic()<deadline and engine.alive():
            video=prop('video-codec')
            if video and prop('audio-codec-name'):break
            time.sleep(.1)
        assert video, (tmp_path/'mpv.log').read_text()[-4000:]
        assert ('hevc' if codec=='libx265' else 'h.264') in video.lower()
        assert prop('audio-codec-name')==audio
        assert '10' in prop('video-params/pixelformat') if pixel.endswith('10le') else prop('video-params/pixelformat')=='yuv420p'
        engine.command(['set_property','pause',False]);time.sleep(.25)
        assert prop('time-pos')>0
    finally:
        engine.stop();server.shutdown();server.server_close();thread.join(3)
