import json
import httpx
import pytest
from kinosota_player.api import Api,ApiError
from kinosota_player.credentials import SessionVault
from kinosota_player.engine import Mpv

@pytest.mark.parametrize('origin',['http://example.com','https://u:p@example.com','https://example.com/path','https://example.com?x=1'])
def test_plain_https_origin_only(origin):
    with pytest.raises(ValueError):Api(origin)

def test_login_otp_search_and_paid_recheck():
    calls=[]
    def serve(r):
        calls.append(r)
        if r.url.path.endswith('/auth/login'):
            assert json.loads(r.content)=={'username_or_email':'viewer','password':'fixture'}
            assert r.headers['X-TOTP-Code']=='123456'
            return httpx.Response(200,json={'access_token':'opaque-session'})
        assert r.headers['Authorization']=='Bearer opaque-session'
        return httpx.Response(200,json={'ok':True,'username':'viewer','items':[]})
    api=Api(transport=httpx.MockTransport(serve));assert api.login('viewer','fixture','123456')['ok']
    api.search('Сказка & море',2)
    assert calls[-2].url.path=='/api/v1/desktop/access'
    assert calls[-1].url.params['q']=='Сказка & море' and calls[-1].url.params['page']=='2'
    assert 'password' not in str(calls[-1].url)
    api.close()

@pytest.mark.parametrize('path',['https://evil.test','//evil.test','relative'])
def test_no_credential_forwarding(path):
    api=Api(transport=httpx.MockTransport(lambda r:pytest.fail('must not send')));api.token='secret'
    with pytest.raises(ValueError):api.request('GET',path)
    api.close()

def test_redirect_not_followed_and_errors_do_not_echo_tokens():
    seen=[]
    def serve(r):seen.append(r);return httpx.Response(302,headers={'Location':'https://evil.test/?token=private'})
    api=Api(transport=httpx.MockTransport(serve));api.token='private'
    with pytest.raises(ApiError) as e:api.access()
    assert len(seen)==1 and 'private' not in str(e.value)
    api.close()

def test_expired_session_removed():
    api=Api(transport=httpx.MockTransport(lambda r:httpx.Response(401,json={'detail':'private'})));api.token='private'
    with pytest.raises(ApiError):api.access()
    assert api.token=='';api.close()

def test_subscription_denial_stops_catalog_request():
    calls=[]
    def serve(r):calls.append(r);return httpx.Response(403,json={'detail':{'code':'PLAYER_SUBSCRIPTION_REQUIRED'}})
    api=Api(transport=httpx.MockTransport(serve));api.token='private'
    with pytest.raises(ApiError):api.search('test')
    assert len(calls)==1 and calls[0].url.path.endswith('/desktop/access');api.close()

def test_no_plaintext_vault():
    class Plain:
        def set_password(self,*a):pytest.fail('no disk secret')
    vault=SessionVault(Plain());assert not vault.save('secret') and vault.load()==''

def test_os_vault_round_trip_and_failure():
    class Safe:
        __module__='keyring.backends.SecretService'
        token=''
        def get_password(self,*a):return self.token
        def set_password(self,*a):self.token=a[-1]
        def delete_password(self,*a):self.token=''
    vault=SessionVault(Safe());assert vault.save('secret');assert vault.load()=='secret';vault.clear();assert not vault.load()

@pytest.mark.parametrize('url',['http://media.test/a','file:///etc/passwd','https://u:p@media.test/a'])
def test_mpv_only_https(url):
    with pytest.raises(ValueError):Mpv('/nonexistent').start(url)

def test_mpv_tokens_only_in_ipc(monkeypatch):
    from kinosota_player import engine
    seen=[];commands=[]
    class Proc:
        def poll(self):return None
        def terminate(self):pass
        def wait(self,timeout):return 0
    monkeypatch.setattr(engine.subprocess,'Popen',lambda argv,**kw:(seen.append(argv) or Proc()))
    mpv=Mpv('mpv');monkeypatch.setattr(mpv,'command',lambda c:commands.append(c))
    mpv.start('https://media.test/stream?token=private')
    assert not any('private' in s or 'https://' in s for s in seen[0])
    assert commands==[['loadfile','https://media.test/stream?token=private','replace']]
    assert '--no-config' in seen[0] and '--tls-verify=no' not in seen[0]
    mpv.stop()


def test_missing_media_message_is_not_a_codec_or_subscription_error():
    def handler(request):
        return httpx.Response(410,json={'detail':{'code':'MEDIA_UNAVAILABLE'}})
    api=Api(transport=httpx.MockTransport(handler))
    with pytest.raises(ApiError) as err:api.start('deleted-fixture')
    assert err.value.code=='MEDIA_UNAVAILABLE'
    assert 'Фильм больше недоступен на сайте' in str(err.value)
    assert 'кодек' not in str(err.value) and 'подписк' not in str(err.value)
    api.close()
