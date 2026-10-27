"""HTTPS API client. No passwords on disk, no tokens in URLs or logs."""
import threading
from urllib.parse import urlsplit
import httpx

API_ORIGIN='https://watch.scenrix.com'
class ApiError(Exception):
    def __init__(self,status,code='',message=''):
        self.status=status;self.code=code
        super().__init__(message or {
          401:'Сессия истекла. Войдите снова.',403:'Для приложения нужна действующая платная подписка.',
          404:'Фильм не найден.',409:'Сейчас этот источник недоступен.',
          429:'Слишком много попыток. Подождите и повторите.',503:'Сервис временно недоступен.'
        }.get(status,'Не удалось выполнить запрос.'))

class Api:
    def __init__(self,origin=API_ORIGIN,transport=None):
        parsed=urlsplit(origin)
        if parsed.scheme!='https' or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('','/'):
            raise ValueError('A plain HTTPS origin is required')
        self.origin=origin.rstrip('/');self.token='';self.lock=threading.RLock()
        self.client=httpx.Client(base_url=self.origin+'/api/v1/',timeout=20,follow_redirects=False,transport=transport,
            headers={'User-Agent':'KINOSOTA-Player/0.1.3','Accept':'application/json'})
    def request(self,method,path,body=None,extra_headers=None):
        if not path.startswith('/') or path.startswith('//') or '://' in path:raise ValueError('Relative API path required')
        with self.lock:
            headers=dict(extra_headers or {})
            if self.token:headers['Authorization']='Bearer '+self.token
            try:r=self.client.request(method,path.lstrip('/'),json=body,headers=headers)
            except httpx.HTTPError:raise ApiError(0,message='Нет соединения. Проверьте интернет и повторите.') from None
            try:data=r.json()
            except ValueError:data={}
            if not r.is_success:
                detail=data.get('detail',{}) if isinstance(data,dict) else {}
                code=detail.get('code','') if isinstance(detail,dict) else str(detail)
                if r.status_code==401:self.token=''
                if r.status_code==503 and path.startswith('/desktop/playback/'):
                    raise ApiError(503,code,'Медиасервер временно недоступен. Приложение продолжает работать — попробуйте открыть фильм чуть позже.')
                if code=='MEDIA_UNAVAILABLE':raise ApiError(r.status_code,code,'Фильм больше недоступен на сайте. Попробуйте позднее — возможно, он появится снова.')
                if code=='MFA_REQUIRED':raise ApiError(403,code,'Введите код из приложения-аутентификатора.')
                raise ApiError(r.status_code,code)
            return data
    def login(self,identity,password,otp=''):
        result=self.request('POST','/auth/login',{'username_or_email':identity,'password':password},
            {'X-TOTP-Code':otp} if otp else {})
        token=result.get('access_token','')
        if not token or token=='cookie-session':raise ApiError(0,message='Сервер не вернул сессию приложения.')
        self.token=token
        return self.access()
    def access(self):return self.request('GET','/desktop/access')
    def search(self,query='',page=1):
        self.access()
        params=httpx.QueryParams({'q':query,'page':page,'page_size':30}) if query else httpx.QueryParams({'page':page,'page_size':30,'sort':'newest'})
        return self.request('GET',('/search?' if query else '/movies?')+str(params))
    def start(self,movie_id):return self.request('POST','/desktop/playback/start',{'movie_id':movie_id})
    def heartbeat(self,session_id):return self.request('POST','/desktop/playback/heartbeat',{'session_id':session_id})
    def stop(self,session_id):return self.request('POST','/desktop/playback/stop',{'session_id':session_id})
    def logout(self):
        try:
            if self.token:self.request('POST','/auth/logout',{})
        finally:self.token='';self.client.cookies.clear()
    def close(self):self.client.close()
