"""HTTPS API client. No passwords on disk, no tokens in URLs or logs."""
import threading, uuid
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

TICKET_ERRORS={403:'Для просмотра торрентов нужна подписка PRO.',404:'Раздача ещё готовится. Попробуйте через минуту.',
    409:'Раздача ещё готовится. Попробуйте через минуту.',422:'Такой серии нет в выбранной раздаче.',
    503:'Медиасервер временно недоступен. Попробуйте открыть фильм чуть позже.'}
KINDS=('movie','tv')

def _kind(kind):
    if kind not in KINDS:raise ValueError('Unsupported kind')
    return kind
def _tmdb(value):
    if type(value) is not int or not 0<value<=2147483647:raise ValueError('Invalid title id')
    return value
def _uuid(value):
    return str(uuid.UUID(str(value)))

class Api:
    def __init__(self,origin=API_ORIGIN,transport=None):
        parsed=urlsplit(origin)
        if parsed.scheme!='https' or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('','/'):
            raise ValueError('A plain HTTPS origin is required')
        self.origin=origin.rstrip('/');self.token='';self.lock=threading.RLock()
        self.client=httpx.Client(base_url=self.origin+'/api/v1/',timeout=20,follow_redirects=False,transport=transport,
            headers={'User-Agent':'KINOSOTA-Player/0.1.6','Accept':'application/json'})
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
                if path.startswith('/torrents/playback-ticket'):
                    message=TICKET_ERRORS.get(r.status_code)
                    if message:raise ApiError(r.status_code,code,message)
                elif path.startswith(('/torrents/','/account/library/')) and isinstance(detail,str) and 0<len(detail)<=300 and r.status_code not in (401,429,500,502,503,504):
                    # Torrent endpoints answer with short Russian, user-facing reasons.
                    raise ApiError(r.status_code,'',detail)
                raise ApiError(r.status_code,code)
            return data
    def login(self,identity,password,otp=''):
        result=self.request('POST','/auth/login',{'username_or_email':identity,'password':password},
            {'X-TOTP-Code':otp} if otp else {})
        token=result.get('access_token','')
        if not token or token=='cookie-session':raise ApiError(0,message='Сервер не вернул сессию приложения.')
        self.token=token
        return self.access()
    def account(self):return self.request('GET','/account')
    def access(self):return self.request('GET','/desktop/access')
    def search(self,query='',page=1):
        self.access()
        params=httpx.QueryParams({'q':query,'page':page,'page_size':30}) if query else httpx.QueryParams({'page':page,'page_size':30,'sort':'newest'})
        return self.request('GET',('/search?' if query else '/movies?')+str(params))
    def start(self,movie_id):return self.request('POST','/desktop/playback/start',{'movie_id':movie_id})
    def heartbeat(self,session_id):return self.request('POST','/desktop/playback/heartbeat',{'session_id':session_id})
    def stop(self,session_id):return self.request('POST','/desktop/playback/stop',{'session_id':session_id})
    # Torrents: same server contract as the website detail page. The app never
    # sees an infohash, magnet or tracker URL; the stream URL goes to mpv over IPC.
    def library(self,page=1):
        return self.request('GET','/account/library?'+str(httpx.QueryParams({'page':max(1,int(page)),'size':48})))
    def torrent_catalog(self,kind='movie',query='',page=1):
        params={'kind':_kind(kind),'page':max(1,min(500,int(page)))}
        if query:params['q']=str(query)[:120]
        return self.request('GET','/torrents/catalog?'+str(httpx.QueryParams(params)))
    def torrent_sources(self,kind,tmdb_id):return self.request('GET',f'/torrents/sources/{_kind(kind)}/{_tmdb(tmdb_id)}')
    def prepare_source(self,source_id):return self.request('POST',f'/torrents/sources/{_uuid(source_id)}/prepare',{})
    def discover_sources(self,kind,tmdb_id):return self.request('POST',f'/torrents/sources/{_kind(kind)}/{_tmdb(tmdb_id)}/discover',{})
    def add_to_library(self,kind,tmdb_id):return self.request('PUT',f'/account/library/{_kind(kind)}/{_tmdb(tmdb_id)}',{})
    def open_launch(self,launch_id):return self.request('POST',f'/torrents/desktop-launch/{_uuid(launch_id)}/open',{})
    def torrent_ticket(self,kind,tmdb_id,source_id=None,season=None,episode=None):
        body={'kind':_kind(kind),'tmdb_id':_tmdb(tmdb_id)}
        if source_id:body['source_id']=_uuid(source_id)
        if kind=='tv' and type(season) is int and type(episode) is int:body.update(season=season,episode=episode)
        return self.request('POST','/torrents/playback-ticket',body)
    def logout(self):
        try:
            if self.token:self.request('POST','/auth/logout',{})
        finally:self.token='';self.client.cookies.clear()
    def close(self):self.client.close()
