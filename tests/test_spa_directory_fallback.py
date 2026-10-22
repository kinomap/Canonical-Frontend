"""A physical artwork directory must not shadow the /genres SPA route."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class SPAFallbackContract(unittest.TestCase):
    def test_public_templates_do_not_select_artwork_directories(self):
        for name in ['nginx.public-only.conf.template', 'nginx.prod.conf.template', 'nginx.public-only.conf']:
            with self.subTest(name=name):
                config = (ROOT / name).read_text()
                self.assertNotIn('try_files $uri $uri/ /index.html', config)
                self.assertIn('try_files $uri /index.html', config)

    def test_private_api_denials_are_preserved(self):
        config = (ROOT / 'nginx.public-only.conf.template').read_text()
        for location in ['location = /admin { return 403; }', 'location ^~ /admin/ { return 403; }', 'location ^~ /api/v1/admin/ { return 403; }', 'location ^~ /api/v1/internal/ { return 403; }']:
            self.assertIn(location, config)
