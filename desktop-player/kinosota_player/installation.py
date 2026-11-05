"""Explicit graphical uninstall and update; never execute root UI or untrusted shell strings."""
import platform,sys,subprocess
from pathlib import Path
from PySide6.QtCore import QProcess,QProcessEnvironment
from PySide6.QtWidgets import QApplication,QMessageBox,QDialog,QVBoxLayout,QLabel,QPushButton,QProgressBar
from .engine import child_environment,native_loader
from .preferences import translate

def uninstall_command(system=None):
    system=system or platform.system()
    if system=='Linux':
        # Only the package installed at this fixed path is removable. Source/portable
        # previews must never accidentally remove a different system installation.
        if not getattr(sys,'frozen',False) or Path(sys.executable).resolve()!=Path('/opt/kinosota-player/kinosota-player'):return None
        if not Path('/usr/bin/pkexec').is_file() or not Path('/usr/bin/dpkg').is_file():return None
        return ['/usr/bin/pkexec','/usr/bin/dpkg','--remove','kinosota-player']
    if system=='Windows':
        exe=Path(sys.executable).parent/'unins000.exe'
        if getattr(sys,'frozen',False) and exe.is_file():return [str(exe)]
    return None

INSTALLED_LINUX='/opt/kinosota-player/kinosota-player'

def install_command(path,system=None):
    """0.1.9 in-app update: hand a verified build to the system installer, over the installed copy.

    Linux: apt via pkexec (one graphical password prompt; apt resolves new dependencies and
    waits for a busy package lock), dpkg as the fallback. Windows: the Inno Setup wizard in
    silent mode, which closes and restarts the player. macOS: the disk image in Finder.
    Source and portable previews get None: they only link to the website."""
    system=system or platform.system();path=Path(path)
    if not getattr(sys,'frozen',False) or not path.is_absolute():return None
    if system=='Linux':
        if Path(sys.executable).resolve()!=Path(INSTALLED_LINUX) or path.suffix!='.deb' or not Path('/usr/bin/pkexec').is_file():return None
        if Path('/usr/bin/apt-get').is_file():return ['/usr/bin/pkexec','/usr/bin/apt-get','install','-y','-o','DPkg::Lock::Timeout=120',str(path)]
        if Path('/usr/bin/dpkg').is_file():return ['/usr/bin/pkexec','/usr/bin/dpkg','-i',str(path)]
        return None
    if system=='Windows':
        if path.suffix.lower()!='.exe' or not (Path(sys.executable).parent/'unins000.exe').is_file():return None
        return [str(path),'/SILENT','/SP-','/NORESTART','/CLOSEAPPLICATIONS']
    if system=='Darwin':
        return ['/usr/bin/open',str(path)] if path.suffix=='.dmg' and Path('/usr/bin/open').is_file() else None
    return None

def restart_command(system=None):
    """Start the freshly installed Linux package once this process has exited."""
    if (system or platform.system())=='Linux' and getattr(sys,'frozen',False):
        return ['/bin/sh','-c','sleep 1; exec "$0"',INSTALLED_LINUX]
    return None

def show_uninstall(parent=None,language='ru'):
    tr=lambda s:translate(s,language);command=uninstall_command()
    if not command:
        text='macOS: закройте плеер и переместите KINOSOTA Player из Applications в Корзину.' if platform.system()=='Darwin' else 'Удаление доступно для установленного пакета. Откройте системный менеджер приложений.'
        QMessageBox.information(parent,tr('Удалить приложение'),tr(text));return
    answer=QMessageBox.question(parent,tr('Удалить приложение'),tr('Удалить KINOSOTA Player с этого компьютера? ОС запросит подтверждение. Другие приложения и аккаунт на сайте не будут удалены.'),QMessageBox.StandardButton.Yes|QMessageBox.StandardButton.No,QMessageBox.StandardButton.No)
    if answer!=QMessageBox.StandardButton.Yes:return
    if platform.system()=='Windows':
        with native_loader():subprocess.Popen(command,env=child_environment())
        if parent:parent.window().close()
        return
    dialog=QDialog(parent);dialog.setWindowTitle(tr('Удалить приложение'));layout=QVBoxLayout(dialog);label=QLabel(tr('Подтвердите удаление в системном окне.'));label.setWordWrap(True);layout.addWidget(label);bar=QProgressBar();bar.setRange(0,0);layout.addWidget(bar);close=QPushButton(tr('Закрыть'));close.setEnabled(False);close.clicked.connect(dialog.reject);layout.addWidget(close)
    process=QProcess(dialog);environment=QProcessEnvironment()
    for key,value in child_environment().items():environment.insert(key,value)
    process.setProcessEnvironment(environment)
    def finished(code,status):
        bar.hide();close.setEnabled(True)
        if code==0:
            dialog.accept()
            if parent:parent.window().close()
            else:QApplication.instance().quit()
        else:label.setText(tr('Удаление отменено или недоступно. Приложение не удалено. Закройте окно и повторите через менеджер пакетов.'))
    process.finished.connect(finished);process.errorOccurred.connect(lambda error:finished(-1,None))
    with native_loader():process.start(command[0],command[1:])
    dialog.exec()
