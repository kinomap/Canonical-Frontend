"""ZERO MEDIA ON VPS1/VPS2: the public edge (VPS2) never relays nor caches media bytes.

Films, series, torrents, ad creatives and the prestart intro (default and admin upload) go directly
client -> https://<node>/... with a signed token. This edge only serves the SPA, UI artwork and the
allowlisted JSON /api/ (plus posters/backdrops under /media/). The former v15 intro edge cache
(`intro_cache`, `slice`) and the Smart TV relays (/tv-stream/, /tv-ad/) are gone for good; every
media path answers 404 on both servers (:80 for Orsay/NetCast and :443).
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / 'nginx.public-only.conf.template'
STANDALONE = ROOT / 'nginx.public-only.conf'
PUBLIC = ROOT / 'frontend' / 'public'

MEDIA_EXTENSIONS = 'mp4|webm|m4v|mkv|mov|avi|ts|m3u8|mpd|mp3|aac|m4a|ogg|oga|opus|flac|wav'
MEDIA_FILES_DENY = 'location ~* ^/media/.+\\.(?:' + MEDIA_EXTENSIONS + ')$ { return 404; }'
DENIES = (
    'location = /stream { return 404; }',
    'location ^~ /stream/ { return 404; }',
    'location ^~ /media/cinema-intro/ { return 404; }',
    'location ^~ /cinema/intro/ { return 404; }',
    MEDIA_FILES_DENY,
)


def block(config: str, start: int) -> str:
    """The `{ ... }` block of the directive at `start`; braces inside "quoted" regexes ({1,64}) do not count."""
    depth = 0
    quoted = False
    for i in range(start, len(config)):
        if config[i] == '"':
            quoted = not quoted
        elif quoted:
            continue
        elif config[i] == '{':
            depth += 1
        elif config[i] == '}':
            depth -= 1
            if depth == 0:
                return config[start:i + 1]
    raise AssertionError('unbalanced block')


def servers(config: str) -> list[str]:
    return [block(config, m.start()) for m in re.finditer(r'^server \{', config, re.M)]


class PublicEdgeZeroMedia(unittest.TestCase):
    config = TEMPLATE.read_text()

    def test_placeholders_are_unchanged(self):
        self.assertEqual(self.config.count('__PUBLIC_HOST__'), 3)
        self.assertEqual(self.config.count('__BACKEND_WG_ADDRESS__'), 1)

    def test_there_is_no_media_cache_at_all(self):
        for forbidden in ('proxy_cache', 'intro_cache', 'slice', '$slice_range', '/var/cache/nginx'):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, self.config)

    def test_there_is_no_smart_tv_media_relay(self):
        for forbidden in ('/tv-stream', '/tv-ad', '$tvnode', '$tvsource', 'proxy_ssl', '.scenrix.com'):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, self.config)

    def test_only_the_control_pool_is_proxied_and_only_for_json_and_artwork(self):
        targets = re.findall(r'proxy_pass\s+([^;]+);', self.config)
        self.assertEqual(set(targets), {'http://control_pool'})
        for server in servers(self.config):
            proxied = [m.group(1) for m in re.finditer(r'location ([^{]+)\{(?:[^{}]|\{[^{}]*\})*?proxy_pass', server)]
            self.assertEqual([p.strip() for p in proxied], ['/api/', '/media/'])

    def test_both_servers_deny_every_media_path(self):
        found = servers(self.config)
        self.assertEqual(len(found), 2)  # :80 (Orsay/NetCast) and :443
        for server in found:
            with self.subTest(server=server[:40]):
                for deny in DENIES:
                    self.assertEqual(server.count(deny), 1, deny)

    def test_intro_deny_precedes_the_ui_artwork_prefix(self):
        for server in servers(self.config):
            intro = server.index('location ^~ /cinema/intro/ { return 404; }')
            artwork = server.index('location ^~ /cinema/ {')
            self.assertLess(intro, artwork)
            artwork_block = block(server, artwork)
            self.assertIn('root /usr/share/nginx/html/public;', artwork_block)
            self.assertIn('try_files $uri =404;', artwork_block)

    def test_media_file_deny_only_matches_audio_and_video(self):
        deny = re.compile(r'^/media/.+\.(?:' + MEDIA_EXTENSIONS + r')$', re.I)
        for path in ('/media/cinema-intro/b10e9c8894dac431.mp4', '/media/x/film.MKV', '/media/a/b.m3u8',
                     '/media/ads/creative.webm', '/media/a.mpd', '/media/track.opus', '/media/s/e01.ts'):
            with self.subTest(path=path):
                self.assertTrue(deny.match(path))
        for path in ('/media/posters/a.jpg', '/media/backdrops/w1280/b.webp', '/media/logo.png',
                     '/media/posters/mp4.jpg', '/media/a.mp4.jpg'):
            with self.subTest(path=path):
                self.assertFalse(deny.match(path))

    def test_media_relay_buffers_keep_artwork_off_temp_files(self):
        for server in servers(self.config):
            media = block(server, server.index('location /media/ {'))
            for line in ('proxy_buffer_size 128k;', 'proxy_buffers 16 128k;', 'proxy_busy_buffers_size 256k;'):
                self.assertIn(line, media)

    def test_standalone_public_image_never_serves_the_intro(self):
        text = STANDALONE.read_text()
        self.assertLess(text.index('location ^~ /cinema/intro/ { return 404; }'), text.index('location ^~ /cinema/ {'))
        self.assertNotIn('proxy_pass', text)

    def test_spa_bundle_ships_no_intro_media_but_keeps_ui_artwork(self):
        self.assertFalse((PUBLIC / 'cinema' / 'intro').exists())
        media = [p for p in PUBLIC.rglob('*') if p.suffix.lower().lstrip('.') in MEDIA_EXTENSIONS.split('|')]
        self.assertEqual(media, [])
        for artwork in ('v1', 'v3', 'v4'):
            with self.subTest(artwork=artwork):
                self.assertTrue(any((PUBLIC / 'cinema' / artwork).glob('*.webp')))


if __name__ == '__main__':
    unittest.main()
