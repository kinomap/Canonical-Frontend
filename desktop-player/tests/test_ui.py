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
    assert api.stopped==['pending']
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
