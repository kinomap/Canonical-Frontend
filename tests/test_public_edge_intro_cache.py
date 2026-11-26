"""v15: VPS2 edge cache for the cinema intro, /media/ buffers and TLS reuse towards the media nodes.

Smart TVs must get the published intro (<version>.mp4, -still.jpg, -poster.jpg: content-addressed,
immutable) from VPS2 RAM in 1 MiB slices instead of a relay of every Range request over WireGuard to
VPS1. Only those names are cached; anything else under /media/cinema-intro/ stays an uncached relay.
Functional behaviour (206/Content-Range, HIT on the 2nd request, stale-on-error) was checked against
the same nginx image with the guarded-rollout tmpfs/user; these are the source-level guarantees.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / 'nginx.public-only.conf.template'

MP4 = 'location ~ "^/media/cinema-intro/[0-9A-Za-z]{1,64}\\.mp4$" {'
STILLS = 'location ~ "^/media/cinema-intro/[0-9A-Za-z]{1,64}-(?:still|poster)\\.jpg$" {'


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


def blocks(config: str, opener: str) -> list[str]:
    return [block(config, m.start()) for m in re.finditer(re.escape(opener), config)]


class EdgeIntroCache(unittest.TestCase):
    config = TEMPLATE.read_text()

    def test_placeholders_are_unchanged(self):
        self.assertEqual(self.config.count('__PUBLIC_HOST__'), 3)
        self.assertEqual(self.config.count('__BACKEND_WG_ADDRESS__'), 1)

    def test_cache_zone_lives_on_the_container_tmpfs(self):
        paths = re.findall(r'^proxy_cache_path .*;$', self.config, re.M)
        self.assertEqual(len(paths), 1)
        line = paths[0]
        self.assertTrue(line.startswith('proxy_cache_path /var/cache/nginx/intro_cache '))  # tmpfs uid 101
        for part in ('keys_zone=intro_cache:10m', 'max_size=128m', 'inactive=7d', 'use_temp_path=off'):
            self.assertIn(part, line)

    def test_both_servers_cache_the_clip_in_1m_slices_inside_the_intro_prefix(self):
        prefixes = blocks(self.config, 'location ^~ /media/cinema-intro/ {')
        self.assertEqual(len(prefixes), 2)  # :80 (Orsay/NetCast) and :443
        for prefix in prefixes:
            with self.subTest(prefix=prefix[:40]):
                self.assertIn('proxy_buffering off;', prefix.split(MP4)[0])  # the uncached relay stays as it was
                (clip,) = blocks(prefix, MP4)
                for line in ('slice 1m;', 'proxy_set_header Range $slice_range;', 'proxy_cache intro_cache;',
                             'proxy_cache_key "$uri$slice_range";', 'proxy_cache_valid 200 206 30d;',
                             'proxy_cache_lock on;', 'proxy_buffering on;', 'proxy_pass http://control_pool;',
                             'proxy_ignore_headers Cache-Control Expires Set-Cookie;', 'proxy_hide_header Set-Cookie;',
                             'proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;',
                             'add_header X-Cache-Status $upstream_cache_status always;',
                             'add_header X-Content-Type-Options nosniff always;'):
                    self.assertIn(line, clip)
                (stills,) = blocks(prefix, STILLS)
                for line in ('proxy_cache intro_cache;', 'proxy_cache_key $uri;', 'proxy_cache_valid 200 30d;'):
                    self.assertIn(line, stills)
                self.assertNotIn('slice', stills)
                self.assertNotIn('$http_range', clip + stills)

    def test_immutable_header_is_never_sent_with_errors(self):
        # `always` would let a 404/502 be cached by TVs for a year.
        cached = [b for p in blocks(self.config, 'location ^~ /media/cinema-intro/ {') for b in blocks(p, MP4) + blocks(p, STILLS)]
        self.assertEqual(len(cached), 4)
        for body in cached:
            self.assertIn('add_header Cache-Control "public, max-age=31536000, immutable";', body)
            self.assertNotIn('immutable" always', body)

    def test_only_content_addressed_intro_files_match_the_cached_locations(self):
        mp4 = re.compile(r'^/media/cinema-intro/[0-9A-Za-z]{1,64}\.mp4$')
        stills = re.compile(r'^/media/cinema-intro/[0-9A-Za-z]{1,64}-(?:still|poster)\.jpg$')
        self.assertTrue(mp4.match('/media/cinema-intro/b10e9c8894dac431.mp4'))
        self.assertTrue(stills.match('/media/cinema-intro/b10e9c8894dac431-poster.jpg'))
        self.assertTrue(stills.match('/media/cinema-intro/b10e9c8894dac431-still.jpg'))
        for path in ('/media/cinema-intro/state.json', '/media/cinema-intro/incoming/upload-x.mp4',
                     '/media/cinema-intro/../posters/a.mp4', '/media/cinema-intro/a.mp4.part',
                     '/media/cinema-intro/b10e9c8894dac431-other.jpg', '/media/cinema-intro/' + 'a' * 65 + '.mp4'):
            with self.subTest(path=path):
                self.assertFalse(mp4.match(path) or stills.match(path))

    def test_media_relay_buffers_keep_artwork_off_temp_files(self):
        media = blocks(self.config, 'location /media/ {')
        self.assertEqual(len(media), 2)
        for body in media:
            for line in ('proxy_buffer_size 128k;', 'proxy_buffers 16 128k;', 'proxy_busy_buffers_size 256k;'):
                self.assertIn(line, body)

    def test_tv_relays_reuse_tls_sessions_with_the_media_nodes(self):
        relays = [b for opener in ('location ~ "^/tv-stream/', 'location ~ "^/tv-ad/') for b in blocks(self.config, opener)]
        self.assertEqual(len(relays), 4)
        for body in relays:
            self.assertIn('proxy_ssl_session_reuse on;', body)
            self.assertIn('proxy_ssl_verify on;', body)


if __name__ == '__main__':
    unittest.main()
