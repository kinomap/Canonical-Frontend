"""The OSD track menu (kinosota_tracks.lua + the bundled osc.lua) in a real mpv: 0.35 in the build image, newer here."""
import json
import os
import shutil
import socket
import subprocess
import time

import pytest

from kinosota_player import cinema

pytestmark = pytest.mark.skipif(not (shutil.which('mpv') and shutil.which('ffmpeg')), reason='needs mpv and ffmpeg')

AUDIO = [('rus', 'Дубляж'), ('rus', 'Авторский одноголосый (А. Гаврилов)'), ('eng', 'Оригинал')]


def make_film(tmp_path):
    subs = tmp_path / 'full.srt'
    subs.write_text('1\n00:00:00,000 --> 00:00:09,000\nПривет\n', encoding='utf-8')
    media = tmp_path / 'film.mkv'
    args = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=10']
    for _ in AUDIO:
        args += ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000']
    args += ['-i', str(subs), '-map', '0:v']
    for n in range(len(AUDIO)):
        args += ['-map', f'{n + 1}:a']
    args += ['-map', f'{len(AUDIO) + 1}:s', '-t', '9', '-c:v', 'libx264', '-c:a', 'ac3', '-ac', '6', '-ar', '48000',
             '-c:s', 'srt']
    for n, (lang, title) in enumerate(AUDIO):
        args += [f'-metadata:s:a:{n}', f'language={lang}', f'-metadata:s:a:{n}', f'title={title}',
                 f'-disposition:a:{n}', 'default' if n == 0 else '0']
    args += ['-metadata:s:s:0', 'language=rus', '-metadata:s:s:0', 'title=Full', '-disposition:s:0', '0', str(media)]
    subprocess.run(args, check=True, timeout=60)
    return media


class Ipc:
    def __init__(self, path):
        deadline = time.monotonic() + 15
        while True:
            try:
                self.sock = socket.socket(socket.AF_UNIX)
                self.sock.connect(str(path))
                break
            except OSError:
                if time.monotonic() > deadline:
                    raise
                time.sleep(0.05)
        self.sock.settimeout(10)
        self.buffer, self.events, self.request = b'', [], 0

    def _read(self):
        while b'\n' not in self.buffer:
            self.buffer += self.sock.recv(65536)
        line, self.buffer = self.buffer.split(b'\n', 1)
        return json.loads(line)

    def command(self, *args):
        self.request += 1
        self.sock.sendall(json.dumps({'command': list(args), 'request_id': self.request}).encode() + b'\n')
        while True:
            reply = self._read()
            if 'event' in reply:
                self.events.append(reply)
            elif reply.get('request_id') == self.request:
                return reply.get('data') if reply.get('error') == 'success' else None

    def menu_state(self, timeout=5):
        """The next «script-message kinosota-menu …» the script broadcast."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            for event in list(self.events):
                self.events.remove(event)
                args = event.get('args') or []
                if event.get('event') == 'client-message' and args[:1] == [cinema.MENU_STATE_MESSAGE]:
                    return args[1:]
            self.command('get_property', 'pid')  # Pulls the events queued meanwhile.
            time.sleep(0.02)
        raise AssertionError('the menu sent no state message')

    def wait(self, name, check, timeout=5):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            value = self.command('get_property', name)
            if check(value):
                return value
            time.sleep(0.05)
        raise AssertionError(f'{name} = {value!r}')


@pytest.fixture
def mpv(tmp_path):
    media = make_film(tmp_path)
    sock, log = tmp_path / 'mpv.sock', tmp_path / 'mpv.log'
    options = dict(cinema.FILM_OPTIONS)
    process = subprocess.Popen(['mpv', '--no-config', '--idle=no', '--vo=null', '--ao=null', '--pause', '--osc=no',
                                f'--scripts={options["scripts"]}', f'--script-opts={options["script-opts"]}',
                                f'--input-ipc-server={sock}', f'--log-file={log}', str(media)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ipc = Ipc(sock)
        ipc.wait('track-list', lambda tracks: tracks and len([t for t in tracks if t['type'] == 'audio']) == 3)
        yield ipc, log
    finally:
        process.terminate()
        process.wait(10)
    text = log.read_text(errors='replace')
    assert 'Lua error' not in text and '[kinosota_tracks] error' not in text.lower(), text[-4000:]
    assert not [line for line in text.splitlines() if '[osc]' in line and ' e]' in line.lower()], text[-4000:]


def test_the_scripts_ship_with_the_package_and_only_the_film_core_loads_them():
    assert cinema.OSC_SCRIPT.is_file() and cinema.TRACK_MENU_SCRIPT.is_file()
    options, intro = dict(cinema.FILM_OPTIONS), dict(cinema.INTRO_OPTIONS)
    assert options['scripts'].split(os.pathsep) == [str(cinema.OSC_SCRIPT), str(cinema.TRACK_MENU_SCRIPT)]
    assert options['osc'] == 'no'  # The built-in OSC would ignore the menu; the bundled copy replaces it.
    assert 'osc-visibility=never' in options['script-opts'].split(',')  # Hidden under the intro.
    assert 'scripts' not in intro and 'script-opts' not in intro and intro['osc'] == 'no'
    osc = cinema.OSC_SCRIPT.read_text(encoding='utf-8')
    assert osc.count('open_track_menu("audio")') == 1 and osc.count('open_track_menu("sub")') == 1
    assert 'set_track("audio", -1)' not in osc and 'set_track("sub", -1)' not in osc


def test_audio_menu_lists_every_track_like_select_lua_and_wheel_enter_switch_in_place(mpv):
    ipc, log = mpv
    ipc.command('script-message-to', 'kinosota_tracks', 'open', 'audio')
    assert ipc.menu_state() == ['open', 'audio']
    ipc.command('keypress', 'WHEEL_DOWN')
    ipc.command('keypress', 'WHEEL_DOWN')
    ipc.command('keypress', 'WHEEL_UP')
    ipc.command('keypress', 'ENTER')
    assert ipc.menu_state() == ['closed']
    assert ipc.wait('aid', lambda aid: aid == 2) == 2
    assert ipc.command('get_property', 'pause') is True  # Nothing else happened to the film.
    text = log.read_text(encoding='utf-8', errors='replace')
    assert 'menu Select an audio track:' in text
    assert 'row ● Дубляж (rus ac3 6ch 48 kHz) [default]' in text
    assert 'row ○ Авторский одноголосый (А. Гаврилов) (rus ac3 6ch 48 kHz)' in text
    assert 'row ○ Оригинал (eng ac3 6ch 48 kHz)' in text


def test_a_left_click_on_a_line_chooses_it_and_esc_or_a_click_outside_close_the_menu(mpv):
    ipc, _ = mpv
    ipc.command('script-message-to', 'kinosota_tracks', 'open', 'audio')
    assert ipc.menu_state() == ['open', 'audio']
    ipc.command('keypress', 'ESC')
    assert ipc.menu_state() == ['closed'] and ipc.command('get_property', 'aid') == 1
    ipc.command('script-message-to', 'kinosota_tracks', 'open', 'audio')
    assert ipc.menu_state() == ['open', 'audio']
    ipc.command('mouse', 2, 2)  # Far outside the centred menu.
    ipc.command('keypress', 'MBTN_LEFT')
    assert ipc.menu_state() == ['closed'] and ipc.command('get_property', 'aid') == 1
    # The 1280x720 OSD fallback (vo=null): 3 lines of 35 px under the prompt, the list starts at y=330.
    ipc.command('script-message-to', 'kinosota_tracks', 'open', 'audio')
    assert ipc.menu_state() == ['open', 'audio']
    ipc.command('mouse', 640, 330 + 2 * 35 + 17)
    ipc.command('keypress', 'MBTN_LEFT')
    assert ipc.menu_state() == ['closed']
    assert ipc.wait('aid', lambda aid: aid == 3) == 3


def test_subtitle_menu_starts_with_subtitles_off_and_sets_sid(mpv):
    ipc, log = mpv
    ipc.command('script-message-to', 'kinosota_tracks', 'open', 'sub')
    assert ipc.menu_state() == ['open', 'sub']
    ipc.command('keypress', 'DOWN')
    ipc.command('keypress', 'ENTER')
    assert ipc.menu_state() == ['closed'] and ipc.wait('sid', lambda sid: sid == 1) == 1
    ipc.command('script-message-to', 'kinosota_tracks', 'open', 'sub')
    assert ipc.menu_state() == ['open', 'sub']
    ipc.command('keypress', 'UP')
    ipc.command('keypress', 'ENTER')
    assert ipc.menu_state() == ['closed'] and ipc.wait('sid', lambda sid: sid is False) is False
    text = log.read_text(encoding='utf-8', errors='replace')
    assert 'menu Select a subtitle track:' in text
    assert 'row ● Выключить субтитры' in text and 'row ○ Full (rus subrip)' in text
