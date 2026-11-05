"""HTTPS API client. No passwords on disk, no tokens in URLs or logs."""
import re, threading, time, uuid
from urllib.parse import urlsplit
import httpx

API_ORIGIN='https://watch.scenrix.com'
USER_AGENT='KINOSOTA-Player/0.1.8'
# Stream warm-up: the first bytes of a cold torrent may take a while; mpv gets the URL only once they flow.
WARM_RANGE='bytes=0-262143';WARM_ENOUGH=65536
STALE_STREAM=(400,401,403,404,410)
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
def _year(value):
    if value is None:return None
    if type(value) is not int or not 1870<=value<=2100:raise ValueError('Invalid year')
    return value
def _rating(value):
    if value is None:return None
    if type(value) not in (int,float) or not 0<=value<=10:raise ValueError('Invalid rating')
    return float(value)
def _sorted_years(year_from,year_to):
    year_from,year_to=_year(year_from),_year(year_to)
    if year_from is not None and year_to is not None and year_from>year_to:year_from,year_to=year_to,year_from
    return year_from,year_to

# Player sort keys → KINOSOTA /movies and TMDB /torrents/catalog orders.
MOVIE_SORTS={'popularity':'popularity','rating':'rating_desc','newest':'newest','title':'title_asc'}
TMDB_SORTS={'popularity':'popular','rating':'rating','newest':'newest','title':'title'}
SLUG=re.compile(r'^[a-z0-9][a-z0-9_-]{0,39}$')

class Api:
    def __init__(self,origin=API_ORIGIN,transport=None):
        parsed=urlsplit(origin)
        if parsed.scheme!='https' or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('','/'):
            raise ValueError('A plain HTTPS origin is required')
        self.origin=origin.rstrip('/');self.token='';self.lock=threading.RLock()
        self.client=httpx.Client(base_url=self.origin+'/api/v1/',timeout=20,follow_redirects=False,transport=transport,
            headers={'User-Agent':USER_AGENT,'Accept':'application/json'})
        # Media node client: no session token, no redirects; the signed stream URL is the only credential.
        self.media=httpx.Client(timeout=httpx.Timeout(30,connect=10),follow_redirects=False,transport=transport,headers={'User-Agent':USER_AGENT})
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
    def movies(self,page=1,query='',genres=(),year_from=None,year_to=None,min_rating=None,sort='popularity',page_size=30):
        """KINOSOTA catalogue (/movies): any of the genre slugs, inclusive years, minimum rating."""
        if sort not in MOVIE_SORTS:raise ValueError('Unsupported sort')
        slugs=list(dict.fromkeys(genres))[:10]
        if any(not isinstance(g,str) or not SLUG.match(g) for g in slugs):raise ValueError('Invalid genre')
        year_from,year_to=_sorted_years(year_from,year_to)
        params={'page':max(1,int(page)),'page_size':max(1,min(100,int(page_size))),'sort':MOVIE_SORTS[sort]}
        if query:params['q']=str(query)[:100]
        if slugs:params['genres']=','.join(slugs)
        if year_from is not None:params['year_from']=year_from
        if year_to is not None:params['year_to']=year_to
        if _rating(min_rating) is not None:params['min_rating']=_rating(min_rating)
        return self.request('GET','/movies?'+str(httpx.QueryParams(params)))
    def torrent_catalog(self,kind='movie',query='',page=1,genres=(),year_from=None,year_to=None,rating=None,sort='popularity'):
        """TMDB titles with torrent sources. A title search takes no other filters (server rule)."""
        if sort not in TMDB_SORTS:raise ValueError('Unsupported sort')
        params={'kind':_kind(kind),'page':max(1,min(500,int(page)))}
        ids=[_tmdb(g) for g in dict.fromkeys(genres)][:10]
        year_from,year_to=_sorted_years(year_from,year_to);rating=_rating(rating)
        if query:
            if ids or year_from is not None or year_to is not None or rating is not None or sort!='popularity':
                raise ValueError('A title search takes no filters')
            params['q']=str(query)[:120]
        if ids:params['genres']=','.join(map(str,ids))
        if year_from is not None:params['year_from']=year_from
        if year_to is not None:params['year_to']=year_to
        if rating is not None:params['rating']=rating
        if sort!='popularity':params['sort']=TMDB_SORTS[sort]
        return self.request('GET','/torrents/catalog?'+str(httpx.QueryParams(params)))
    def genres(self):return self.request('GET','/genres')
    def torrent_genres(self,kind):return self.request('GET','/torrents/genres?'+str(httpx.QueryParams({'kind':_kind(kind)})))
    def library_membership(self,pairs):
        keys=list(dict.fromkeys(f'{_kind(kind)}:{_tmdb(tmdb_id)}' for kind,tmdb_id in pairs))[:100]
        if not keys:return {'saved':[]}
        return self.request('GET','/account/library/membership?'+str(httpx.QueryParams({'keys':','.join(keys)})))
    def torrent_detail(self,kind,tmdb_id):return self.request('GET',f'/torrents/detail/{_kind(kind)}/{_tmdb(tmdb_id)}')
    def torrent_sources(self,kind,tmdb_id):return self.request('GET',f'/torrents/sources/{_kind(kind)}/{_tmdb(tmdb_id)}')
    def prepare_source(self,source_id):return self.request('POST',f'/torrents/sources/{_uuid(source_id)}/prepare',{})
    def discover_sources(self,kind,tmdb_id):return self.request('POST',f'/torrents/sources/{_kind(kind)}/{_tmdb(tmdb_id)}/discover',{})
    def add_to_library(self,kind,tmdb_id):return self.request('PUT',f'/account/library/{_kind(kind)}/{_tmdb(tmdb_id)}',{})
    def remove_from_library(self,kind,tmdb_id):return self.request('DELETE',f'/account/library/{_kind(kind)}/{_tmdb(tmdb_id)}')
    def open_launch(self,launch_id):return self.request('POST',f'/torrents/desktop-launch/{_uuid(launch_id)}/open',{})
    def torrent_ticket(self,kind,tmdb_id,source_id=None,season=None,episode=None):
        body={'kind':_kind(kind),'tmdb_id':_tmdb(tmdb_id)}
        if source_id:body['source_id']=_uuid(source_id)
        if kind=='tv' and type(season) is int and type(episode) is int:body.update(season=season,episode=episode)
        return self.request('POST','/torrents/playback-ticket',body)
    def warm_stream(self,url,cancelled=lambda:False,budget=90,sleep=time.sleep,clock=time.monotonic):
        """Read the first bytes of a fresh stream ticket until the media node serves video.

        A cold torrent answers 5xx or stalls while peers connect; mpv would give up on that.
        Returns the byte count (0 when cancelled); raises ApiError for a stale link or when the
        budget runs out. Runs without the API lock: heartbeats and other requests keep flowing."""
        parts=urlsplit(str(url))
        if parts.scheme!='https' or not parts.hostname or parts.username or parts.password:raise ValueError('An HTTPS stream URL is required')
        deadline=clock()+max(1.0,float(budget));delay=1.0
        while not cancelled():
            left=deadline-clock()
            if left<=0:break
            try:
                limit=max(1.0,min(30.0,left))
                with self.media.stream('GET',str(url),headers={'Range':WARM_RANGE},timeout=httpx.Timeout(limit,connect=min(10.0,limit))) as r:
                    if r.status_code in STALE_STREAM:raise ApiError(r.status_code,message='Ссылка на поток устарела. Откройте фильм снова.')
                    if 300<=r.status_code<400 or r.status_code==416:return 0  # Not ours to judge: mpv handles it.
                    if r.is_success:
                        got=0
                        for chunk in r.iter_bytes():
                            got+=len(chunk)
                            if got>=WARM_ENOUGH or cancelled():return got
                        if got:return got
            except httpx.HTTPError:pass
            if cancelled():break
            pause=min(delay,deadline-clock())
            if pause<=0:break
            sleep(pause);delay=min(6.0,delay*1.6)
        if cancelled():return 0
        raise ApiError(0,message='Раздача пока не отдаёт видео. Попробуйте ещё раз через минуту.')
    def logout(self):
        try:
            if self.token:self.request('POST','/auth/logout',{})
        finally:self.token='';self.client.cookies.clear()
    def close(self):self.client.close();self.media.close()
