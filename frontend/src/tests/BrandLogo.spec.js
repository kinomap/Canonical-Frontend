import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BrandLogo from '@/components/BrandLogo.vue';
describe('BrandLogo.vue', () => {
    it('renders KINOSOTA wordmark by default', () => {
        const wrapper = mount(BrandLogo);
        expect(wrapper.text()).toContain('KINOSOTA');
        expect(wrapper.find('.logo-svg').exists()).toBe(true);
    });
    it('renders compact mode without wordmark', () => {
        const wrapper = mount(BrandLogo, {
            props: { compact: true }
        });
        expect(wrapper.text()).not.toContain('KINOSOTA');
        expect(wrapper.find('.logo-svg').exists()).toBe(true);
    });
});
