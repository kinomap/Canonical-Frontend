import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
from PySide6.QtWidgets import QApplication,QLineEdit
from PySide6.QtCore import Qt
from kinosota_player.app import Window
from kinosota_player.api import ApiError

class Vault:
    backend=None
    def load(self):return ''
    def save(self,t):return False
    def clear(self):pass
class Engine:
    def alive(self):return False
    def stop(self):pass
class Api:
    origin='https://watch.scenrix.com';token=''
    def close(self):pass

def test_login_password_is_masked_and_empty_input_is_local():
    app=QApplication.instance() or QApplication([])
    w=Window(api=Api(),engine=Engine(),vault=Vault(),restore=False);w.show();app.processEvents()
    assert w.pages.currentIndex()==0 and w.password.echoMode()==QLineEdit.EchoMode.Password
    w.login();assert 'Введите логин' in w.message.text()
    w.show_error(ApiError(403));assert 'подписка' in w.message.text()
    w.close();app.processEvents()

def test_catalog_selection_and_401_returns_to_login():
    from PySide6.QtWidgets import QListWidgetItem
    app=QApplication.instance() or QApplication([])
    w=Window(api=Api(),engine=Engine(),vault=Vault(),restore=False)
    item=QListWidgetItem('Fixture');item.setData(Qt.ItemDataRole.UserRole,{'id':'fixture','title':'Сказка'})
    w.results.addItem(item);w.results.setCurrentRow(0);w.pages.setCurrentIndex(1)
    assert w.selected_title.text()=='Сказка' and w.play_button.isEnabled()
    w.show_error(ApiError(401));assert w.pages.currentIndex()==0
    w.close();app.processEvents()


def test_stop_cancels_pending_play_and_releases_its_server_session():
    from PySide6.QtWidgets import QListWidgetItem
    import pytest
    class FakeApi(Api):
        stopped=[]
        def start(self,_):return {'session_id':'pending','media_url':'https://media.invalid/test'}
        def stop(self,sid):self.stopped.append(sid)
    class NeverStart(Engine):
        def start(self,*a):pytest.fail('Cancelled play must not launch mpv')
    app=QApplication.instance() or QApplication([])
    api=FakeApi();w=Window(api=api,engine=NeverStart(),vault=Vault(),restore=False)
    pending=[];w.work=lambda fn,done=None,fail=None:pending.append((fn,done,fail))
    item=QListWidgetItem('Fixture');item.setData(Qt.ItemDataRole.UserRole,{'id':'fixture','title':'Fixture'})
    w.results.addItem(item);w.results.setCurrentRow(0)
    w.play();fn,done,fail=pending.pop();assert w.busy
    w.stop();assert not w.busy
    with pytest.raises(RuntimeError,match='Cancelled'):fn()
    assert api.stopped==[]  # Cancellation is checked before allocating a lease.
    w.close();app.processEvents()


def test_abnormal_mpv_exit_diagnoses_absence_instead_of_reporting_success():
    class FailedEngine(Engine):
        def exit_code(self):return 2
    class FakeApi(Api):
        def stop(self,sid):return {}
        def request(self,method,path,body):
            assert path=='/playback/diagnose' and body=={'movie_id':'deleted-fixture'}
            return {'state':'unavailable'}
    app=QApplication.instance() or QApplication([])
    w=Window(api=FakeApi(),engine=FailedEngine(),vault=Vault(),restore=False)
    w.work=lambda fn,done=None,fail=None:done(fn()) if done else fn()
    w.session='fixture-session';w.playing_movie='deleted-fixture'
    w.check_process()
    assert 'Фильм больше недоступен на сайте' in w.message.text()
    assert not w.session
    w.close();app.processEvents()


def test_live_search_debounces_and_clearing_restores_catalog():
    from PySide6.QtTest import QTest
    app=QApplication.instance() or QApplication([])
    w=Window(api=Api(),engine=Engine(),vault=Vault(),restore=False)
    calls=[];w.work=lambda fn,done=None,fail=None:calls.append((w.query,done,fail))
    w.search.setFocus();QTest.keyClicks(w.search,'duna');QTest.qWait(100)
    assert calls==[]
    QTest.qWait(220);assert len(calls)==1 and calls[0][0]=='duna'
    calls[0][1]({'items':[],'total':0,'total_pages':1})
    w.search.clear();w.schedule_search();QTest.qWait(320)
    assert calls[-1][0]==''
    calls[-1][1]({'items':[]});w.close();app.processEvents()


def test_stale_success_and_error_do_not_replace_newer_search():
    app=QApplication.instance() or QApplication([])
    w=Window(api=Api(),engine=Engine(),vault=Vault(),restore=False)
    tasks=[];w.work=lambda fn,done=None,fail=None:tasks.append((done,fail))
    w.search.setText('old');w.new_search();w.search.setText('new');w.new_search()
    assert len(tasks)==1
    tasks[0][0]({'items':[{'id':'old','title':'OLD'}]})
    assert w.results.count()==0 and len(tasks)==2
    tasks[1][0]({'items':[{'id':'new','title':'NEW'}]})
    assert w.results.item(0).text()=='NEW'
    w.search.setText('older');w.new_search();w.search.setText('latest');w.new_search()
    tasks[2][1](ApiError(503));assert 'Сервис временно' not in w.message.text()
    tasks[3][0]({'items':[]});w.close();app.processEvents()


def test_catalog_is_poster_grid_without_redundant_controls():
    from PySide6.QtWidgets import QListView,QPushButton
    app=QApplication.instance() or QApplication([])
    w=Window(api=Api(),engine=Engine(),vault=Vault(),restore=False);w.pages.setCurrentIndex(1);w.show();app.processEvents()
    assert w.results.viewMode()==QListView.ViewMode.IconMode
    assert not w.search_button.isVisible() and not w.play_button.isVisible()
    visible=[x.text() for x in w.findChildren(QPushButton) if x.isVisible()]
    assert not {'Смотреть','Пауза / продолжить','Остановить','Найти'} & set(visible)
    assert w.results.gridSize().width()>=160
    w.close();app.processEvents()


def test_switching_releases_previous_session_before_start_and_can_repeat():
    from PySide6.QtWidgets import QListWidgetItem
    calls=[]
    class FakeApi(Api):
        def start(self,mid):calls.append(('start',mid));return {'session_id':'session-'+mid,'media_url':'https://media.invalid/clip'}
        def stop(self,sid):calls.append(('stop',sid));return {'ok':True}
    class PlayEngine(Engine):
        def start(self,url):calls.append(('mpv',url))
    app=QApplication.instance() or QApplication([])
    w=Window(api=FakeApi(),engine=PlayEngine(),vault=Vault(),restore=False)
    w.work=lambda fn,done=None,fail=None:done(fn()) if done else fn()
    for mid in ('one','two','one'):
        item=QListWidgetItem(mid);item.setData(Qt.ItemDataRole.UserRole,{'id':mid,'title':mid});w.results.addItem(item)
        w.play(item);assert not w.busy and w.session=='session-'+mid
    lifecycle=[c for c in calls if c[0]!='mpv']
    assert lifecycle==[('start','one'),('stop','session-one'),('start','two'),('stop','session-two'),('start','one')]
    w.close();app.processEvents()


def test_stop_failure_does_not_allocate_new_session_and_retry_can_recover():
    from PySide6.QtWidgets import QListWidgetItem
    class FakeApi(Api):
        broken=True;starts=0
        def start(self,mid):self.starts+=1;return {'session_id':'new','media_url':'https://media.invalid/clip'}
        def stop(self,sid):
            if self.broken:raise ApiError(503)
    class PlayEngine(Engine):
        def start(self,url):pass
    app=QApplication.instance() or QApplication([]);api=FakeApi();w=Window(api=api,engine=PlayEngine(),vault=Vault(),restore=False)
    def work(fn,done=None,fail=None):
        try:value=fn()
        except Exception as e:
            if fail:fail(e)
            else:raise
        else:
            if done:done(value)
    w.work=work;w.pending_stops=['old'];item=QListWidgetItem('new');item.setData(Qt.ItemDataRole.UserRole,{'id':'new','title':'new'});w.results.addItem(item);w.play(item)
    assert api.starts==0 and not w.busy and w.pending_stops==['old']
    api.broken=False;w.play(item);assert api.starts==1 and not w.pending_stops
    w.close();app.processEvents()


def test_poster_requests_reject_local_and_untrusted_sources():
    app=QApplication.instance() or QApplication([]);w=Window(api=Api(),engine=Engine(),vault=Vault(),restore=False)
    for bad in ['file:///etc/passwd','http://image.tmdb.org/test','https://evil.invalid/art','https://user:pass@watch.scenrix.com/art']:
        assert not w.results.posters.url(bad)
    assert w.results.posters.url('/artwork/a.jpg')=='https://watch.scenrix.com/artwork/a.jpg'
    w.close();app.processEvents()


def test_short_titles_keep_full_poster_cell():
    qapp=QApplication.instance() or QApplication([])
    from kinosota_player.catalog import PosterGrid
    from PySide6.QtWidgets import QListWidgetItem
    from PySide6.QtCore import Qt
    view=PosterGrid('https://watch.scenrix.com');view.resize(1200,700)
    for title in ['Up','Matchbox','A']:
        item=QListWidgetItem(title);item.setData(Qt.ItemDataRole.UserRole,{'title':title});view.addItem(item)
    view.show();qapp.processEvents()
    for i in range(view.count()):
        rect=view.visualItemRect(view.item(i))
        assert rect.width()>=view.gridSize().width()-2
        assert rect.height()>=view.gridSize().height()-2
    view.close()


def test_login_fits_without_scrolling_at_supported_sizes(tmp_path):
    from PySide6.QtWidgets import QScrollArea
    from PySide6.QtCore import QSettings
    from kinosota_player.preferences import Preferences
    app=QApplication.instance() or QApplication([])
    prefs=Preferences(QSettings(str(tmp_path/'prefs.ini'),QSettings.Format.IniFormat))
    w=Window(api=Api(),engine=Engine(),vault=Vault(),restore=False,preferences=prefs)
    for language in ('ru','en'):
        w.set_language(language)
        for width,height in [(760,600),(800,640),(1024,768),(1240,840),(1440,900),(1920,1080)]:
            w.resize(width,height);w.show()
            for _ in range(4):app.processEvents()
            assert (w.width(),w.height())==(width,height)
            assert not w.pages.widget(0).findChildren(QScrollArea)
            controls=[w.identity,w.password,w.otp,w.remember,w.login_button,w.browser_button]
            previous_bottom=-1
            for c in controls:
                point=c.mapTo(w,c.rect().topLeft())
                assert point.y()>previous_bottom
                assert point.y()+c.height()<=w.message.y()
                assert point.x()>=0 and point.x()+c.width()<=w.width()
                assert c.height()>=28 or c is w.remember
                previous_bottom=point.y()+c.height()-1
    w.close();app.processEvents()


def test_two_complete_rows_at_supported_sizes(tmp_path):
    from PySide6.QtWidgets import QListWidgetItem
    from PySide6.QtCore import QSettings
    from kinosota_player.preferences import Preferences
    app=QApplication.instance() or QApplication([])
    w=Window(api=Api(),engine=Engine(),vault=Vault(),restore=False,preferences=Preferences(QSettings(str(tmp_path/'p.ini'),QSettings.Format.IniFormat)))
    w.pages.setCurrentIndex(1)
    for i in range(30):
        item=QListWidgetItem('Title');item.setData(Qt.ItemDataRole.UserRole,{'id':str(i),'title':'Очень длинное название фильма для проверки переноса'});w.results.addItem(item)
    for size in [(760,600),(800,640),(1024,768),(1240,840),(1440,900),(1920,1080)]:
        w.resize(*size);w.show()
        for _ in range(6):app.processEvents()
        g=w.results;cols=g.viewport().width()//g.gridSize().width();last=g.visualItemRect(g.item(cols*2-1))
        assert last.bottom()<g.viewport().height(),(size,g.gridSize(),last,g.viewport().size())
        assert g.gridSize().height()*2<=g.viewport().height()
        assert w.search.width()<w.pages.width()*.85
    w.close();app.processEvents()


def test_language_preferences_and_provider_title_fallback(tmp_path):
    from PySide6.QtCore import QSettings
    from kinosota_player.preferences import Preferences,movie_title,translate,TEXT
    p=Preferences(QSettings(str(tmp_path/'p.ini'),QSettings.Format.IniFormat));p.set('interface_language','en');p.set('title_language','ru')
    q=Preferences(QSettings(str(tmp_path/'p.ini'),QSettings.Format.IniFormat));assert q.get('interface_language')=='en' and q.get('title_language')=='ru'
    m={'title':'Сказка','original_title':'Original','title_en':'Fairy Tale'}
    assert movie_title(m,'ru')=='Сказка' and movie_title(m,'en')=='Fairy Tale'
    del m['title_en'];assert movie_title(m,'en')=='Original'
    del m['original_title'];assert movie_title(m,'en')=='Сказка'
    assert all(translate(k,'en')==v for k,v in TEXT.items())


def test_drawer_is_in_window_and_focus_contained(tmp_path):
    from PySide6.QtCore import QSettings
    from PySide6.QtTest import QTest
    from kinosota_player.preferences import Preferences
    app=QApplication.instance() or QApplication([])
    w=Window(api=Api(),engine=Engine(),vault=Vault(),restore=False,preferences=Preferences(QSettings(str(tmp_path/'p.ini'),QSettings.Format.IniFormat)));w.resize(760,600);w.show();app.processEvents();w.settings_button.setFocus();w.open_settings()
    w.drawer.animation.setCurrentTime(180);app.processEvents()
    assert w.drawer.parentWidget() is w.backdrop and not w.drawer.isWindow()
    for _ in range(16):
        QTest.keyClick(app.focusWidget(),Qt.Key.Key_Tab);assert w.drawer.panel.isAncestorOf(app.focusWidget())
    w.drawer.update_account({'username':'admin','email':'a@example.com','subscription_status':'free'})
    assert w.drawer.fields['subscription_status'].text()=='Бесплатная' # admin is not a made-up paid subscription
    w.set_language('en');assert w.drawer.fields['subscription_status'].text()=='Free'
    QTest.keyClick(app.focusWidget(),Qt.Key.Key_Escape);assert not w.drawer.isVisible() and app.focusWidget() is w.settings_button
    w.close();app.processEvents()


def test_expired_session_closes_settings_and_clears_private_data(tmp_path):
    from PySide6.QtCore import QSettings
    from kinosota_player.preferences import Preferences
    app=QApplication.instance() or QApplication([])
    w=Window(api=Api(),engine=Engine(),vault=Vault(),restore=False,preferences=Preferences(QSettings(str(tmp_path/'p.ini'),QSettings.Format.IniFormat)));w.show();app.processEvents();w.drawer.update_account({'email':'a@example.com'});w.drawer.present();w.pages.setCurrentIndex(1)
    w.show_error(ApiError(401));app.processEvents()
    assert w.pages.currentIndex()==0 and not w.drawer.isVisible() and not w.account and not w.drawer.account
    assert w.results.count()==0
    w.close();app.processEvents()
