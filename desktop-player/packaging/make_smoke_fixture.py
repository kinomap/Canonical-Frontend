"""Generate synthetic fixtures on cloud runners, never use real credentials."""
import os,subprocess,sys
from pathlib import Path

def generate(root):
    root=Path(root);root.mkdir(parents=True,exist_ok=True)
    for name,codec,audio,pixel in [('h264','libx264','aac','yuv420p'),('hevc','libx265','ac3','yuv420p10le')]:
        cmd=['ffmpeg','-y','-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x90:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','5','-c:v',codec,'-pix_fmt',pixel]
        if codec=='libx265':cmd+=['-x265-params','pools=1:frame-threads=1:log-level=error']
        subprocess.run(cmd+['-c:a',audio,str(root/(name+'.mkv'))],check=True,timeout=60)
    env=os.environ.copy();env['MSYS2_ARG_CONV_EXCL']='*'
    subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(root/'key.pem'),'-out',str(root/'cert.pem'),'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
if __name__=='__main__':generate(sys.argv[1])
