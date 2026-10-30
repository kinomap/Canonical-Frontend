import {it,expect} from 'vitest'
import seo from '../../scripts/generate-seo.mjs?raw'
import nginx from '../../../nginx.public-only.conf.template?raw'
it('preloads the current hero only and revalidates HTML snapshots',()=>{expect(seo).not.toContain('/cinema/v1/hero-');expect(seo).toContain('/cinema/v4/hero-');for(const route of ['/movies','/series','/genres']){const line=nginx.split('\n').find(x=>x.includes('location = '+route+' '));expect(line).toContain('Cache-Control "no-cache"')}expect(nginx).toContain('location ^~ /cinema/');expect(nginx).toContain('TLSv1.2 TLSv1.3');expect(nginx).toContain('location ^~ /admin/ { return 403; }')})
