"""Packaged-app QA: loopback HTTPS only, no account or production media."""
import functools,json,platform,ssl,threading,time
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler

def run_playback_smoke(engine,fixture,report):
    fixture=Path(fixture).resolve();report=Path(report)
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self,*args):pass
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(fixture)))
    context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(fixture/'cert.pem',fixture/'key.pem')
    server.socket=context.wrap_socket(server.socket,server_side=True)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    results=[]
    try:
        for filename,video,audio,pixel in [('h264.mkv','h.264','aac','yuv420p'),('hevc.mkv','hevc','ac3','yuv420p10le')]:
            engine.start(f'https://127.0.0.1:{server.server_port}/{filename}',extra_args=['--vo=null','--ao=null','--pause=yes','--tls-ca-file='+str(fixture/'cert.pem')])
            deadline=time.monotonic()+25
            def prop(name):
                try:return engine.command(['get_property',name])
                except RuntimeError:return None
            while time.monotonic()<deadline and engine.alive():
                codec=prop('video-codec');acodec=prop('audio-codec-name');fmt=prop('video-params/pixelformat')
                if codec and acodec and fmt:break
                time.sleep(.1)
            else:raise RuntimeError('Packaged decoder did not initialize')
            assert video in codec.lower(), 'Unexpected video decoder'
            assert acodec==audio and fmt==pixel, 'Unexpected audio/pixel format'
            engine.command(['set_property','pause',False])
            deadline=time.monotonic()+5
            while time.monotonic()<deadline:
                position=prop('time-pos')
                if isinstance(position,(float,int)) and position>0:break
                time.sleep(.1)
            else:raise RuntimeError('Playback made no progress')
            engine.command(['set_property','pause',True]);assert prop('pause') is True
            results.append({'video':video,'audio':audio,'pixel_format':fmt,'progress':True,'ipc':True})
            engine.stop();assert not engine.alive()
        report.parent.mkdir(parents=True,exist_ok=True)
        report.write_text(json.dumps({'status':'PASS','system':platform.system(),'architecture':platform.machine(),'packaged_app':True,'checks':results},indent=2),encoding='utf-8')
    finally:
        engine.stop();server.shutdown();server.server_close();thread.join(3)
