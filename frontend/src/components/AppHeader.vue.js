/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, watch, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import SearchBar from '@/components/SearchBar.vue';
import BrandLogo from '@/components/BrandLogo.vue';
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const searchQuery = ref('');
const mobileMenuOpen = ref(false);
onMounted(() => {
    if (authStore.token.value && !authStore.user.value) {
        authStore.fetchCurrentUser();
    }
});
function handleSearch(query) {
    if (query.trim().length > 0) {
        router.push({ path: '/movies', query: { q: query.trim() } });
    }
}
function toggleMobileMenu() {
    mobileMenuOpen.value = !mobileMenuOpen.value;
}
function closeMobileMenu() {
    mobileMenuOpen.value = false;
}
watch(route, () => {
    closeMobileMenu();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['brand-link']} */ ;
/** @type {__VLS_StyleScopedClasses['desktop-logo']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-logo']} */ ;
/** @type {__VLS_StyleScopedClasses['desktop-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['header-search']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['login-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['register-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-hamburger-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-link']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "app-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-container" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-left" },
});
const __VLS_0 = {}.RouterLink;
/** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "/",
    ...{ class: "brand-link" },
    tabindex: "0",
}));
const __VLS_2 = __VLS_1({
    to: "/",
    ...{ class: "brand-link" },
    tabindex: "0",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "desktop-logo" },
});
/** @type {[typeof BrandLogo, ]} */ ;
// @ts-ignore
const __VLS_4 = __VLS_asFunctionalComponent(BrandLogo, new BrandLogo({}));
const __VLS_5 = __VLS_4({}, ...__VLS_functionalComponentArgsRest(__VLS_4));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mobile-logo" },
});
/** @type {[typeof BrandLogo, ]} */ ;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent(BrandLogo, new BrandLogo({
    compact: true,
}));
const __VLS_8 = __VLS_7({
    compact: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "desktop-nav" },
});
const __VLS_10 = {}.RouterLink;
/** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent(__VLS_10, new __VLS_10({
    to: "/",
    ...{ class: "nav-link" },
    ...{ class: ({ active: __VLS_ctx.route.path === '/' }) },
}));
const __VLS_12 = __VLS_11({
    to: "/",
    ...{ class: "nav-link" },
    ...{ class: ({ active: __VLS_ctx.route.path === '/' }) },
}, ...__VLS_functionalComponentArgsRest(__VLS_11));
__VLS_13.slots.default;
var __VLS_13;
const __VLS_14 = {}.RouterLink;
/** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
// @ts-ignore
const __VLS_15 = __VLS_asFunctionalComponent(__VLS_14, new __VLS_14({
    to: "/movies",
    ...{ class: "nav-link" },
    ...{ class: ({ active: __VLS_ctx.route.path.startsWith('/movies') }) },
}));
const __VLS_16 = __VLS_15({
    to: "/movies",
    ...{ class: "nav-link" },
    ...{ class: ({ active: __VLS_ctx.route.path.startsWith('/movies') }) },
}, ...__VLS_functionalComponentArgsRest(__VLS_15));
__VLS_17.slots.default;
var __VLS_17;
const __VLS_18 = {}.RouterLink;
/** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
// @ts-ignore
const __VLS_19 = __VLS_asFunctionalComponent(__VLS_18, new __VLS_18({
    to: "/genres",
    ...{ class: "nav-link" },
    ...{ class: ({ active: __VLS_ctx.route.path === '/genres' }) },
}));
const __VLS_20 = __VLS_19({
    to: "/genres",
    ...{ class: "nav-link" },
    ...{ class: ({ active: __VLS_ctx.route.path === '/genres' }) },
}, ...__VLS_functionalComponentArgsRest(__VLS_19));
__VLS_21.slots.default;
var __VLS_21;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-right" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-search" },
});
/** @type {[typeof SearchBar, ]} */ ;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(SearchBar, new SearchBar({
    ...{ 'onSearch': {} },
    modelValue: (__VLS_ctx.searchQuery),
    placeholder: "Search movies...",
}));
const __VLS_23 = __VLS_22({
    ...{ 'onSearch': {} },
    modelValue: (__VLS_ctx.searchQuery),
    placeholder: "Search movies...",
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
let __VLS_25;
let __VLS_26;
let __VLS_27;
const __VLS_28 = {
    onSearch: (__VLS_ctx.handleSearch)
};
var __VLS_24;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "auth-controls" },
});
if (__VLS_ctx.authStore.isAuthenticated.value) {
    const __VLS_29 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
        to: "/profile",
        ...{ class: "profile-btn" },
        title: "User Profile",
    }));
    const __VLS_31 = __VLS_30({
        to: "/profile",
        ...{ class: "profile-btn" },
        title: "User Profile",
    }, ...__VLS_functionalComponentArgsRest(__VLS_30));
    __VLS_32.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "avatar-circle" },
    });
    ((__VLS_ctx.authStore.user.value?.username || 'U')[0].toUpperCase());
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "user-name" },
    });
    (__VLS_ctx.authStore.user.value?.username || 'Profile');
    var __VLS_32;
}
else {
    const __VLS_33 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
        to: "/login",
        ...{ class: "login-btn" },
    }));
    const __VLS_35 = __VLS_34({
        to: "/login",
        ...{ class: "login-btn" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_34));
    __VLS_36.slots.default;
    var __VLS_36;
    const __VLS_37 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
        to: "/register",
        ...{ class: "register-btn" },
    }));
    const __VLS_39 = __VLS_38({
        to: "/register",
        ...{ class: "register-btn" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    __VLS_40.slots.default;
    var __VLS_40;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.toggleMobileMenu) },
    ...{ class: "mobile-hamburger-btn" },
    'aria-expanded': (__VLS_ctx.mobileMenuOpen),
    'aria-label': "Toggle Navigation Menu",
});
if (!__VLS_ctx.mobileMenuOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "24",
        height: "24",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: "4",
        x2: "20",
        y1: "12",
        y2: "12",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: "4",
        x2: "20",
        y1: "6",
        y2: "6",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: "4",
        x2: "20",
        y1: "18",
        y2: "18",
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        width: "24",
        height: "24",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: "18",
        y1: "6",
        x2: "6",
        y2: "18",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: "6",
        y1: "6",
        x2: "18",
        y2: "18",
    });
}
if (__VLS_ctx.mobileMenuOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mobile-menu-drawer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mobile-search-wrapper" },
    });
    /** @type {[typeof SearchBar, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(SearchBar, new SearchBar({
        ...{ 'onSearch': {} },
        modelValue: (__VLS_ctx.searchQuery),
        placeholder: "Search movies...",
    }));
    const __VLS_42 = __VLS_41({
        ...{ 'onSearch': {} },
        modelValue: (__VLS_ctx.searchQuery),
        placeholder: "Search movies...",
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    let __VLS_44;
    let __VLS_45;
    let __VLS_46;
    const __VLS_47 = {
        onSearch: (__VLS_ctx.handleSearch)
    };
    var __VLS_43;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
        ...{ class: "mobile-nav" },
    });
    const __VLS_48 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        ...{ 'onClick': {} },
        to: "/",
        ...{ class: "mobile-nav-link" },
    }));
    const __VLS_50 = __VLS_49({
        ...{ 'onClick': {} },
        to: "/",
        ...{ class: "mobile-nav-link" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    let __VLS_52;
    let __VLS_53;
    let __VLS_54;
    const __VLS_55 = {
        onClick: (__VLS_ctx.closeMobileMenu)
    };
    __VLS_51.slots.default;
    var __VLS_51;
    const __VLS_56 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        ...{ 'onClick': {} },
        to: "/movies",
        ...{ class: "mobile-nav-link" },
    }));
    const __VLS_58 = __VLS_57({
        ...{ 'onClick': {} },
        to: "/movies",
        ...{ class: "mobile-nav-link" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    let __VLS_60;
    let __VLS_61;
    let __VLS_62;
    const __VLS_63 = {
        onClick: (__VLS_ctx.closeMobileMenu)
    };
    __VLS_59.slots.default;
    var __VLS_59;
    const __VLS_64 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        ...{ 'onClick': {} },
        to: "/genres",
        ...{ class: "mobile-nav-link" },
    }));
    const __VLS_66 = __VLS_65({
        ...{ 'onClick': {} },
        to: "/genres",
        ...{ class: "mobile-nav-link" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    let __VLS_68;
    let __VLS_69;
    let __VLS_70;
    const __VLS_71 = {
        onClick: (__VLS_ctx.closeMobileMenu)
    };
    __VLS_67.slots.default;
    var __VLS_67;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mobile-auth-divider" },
    });
    if (__VLS_ctx.authStore.isAuthenticated.value) {
        const __VLS_72 = {}.RouterLink;
        /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            ...{ 'onClick': {} },
            to: "/profile",
            ...{ class: "mobile-nav-link" },
        }));
        const __VLS_74 = __VLS_73({
            ...{ 'onClick': {} },
            to: "/profile",
            ...{ class: "mobile-nav-link" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        let __VLS_76;
        let __VLS_77;
        let __VLS_78;
        const __VLS_79 = {
            onClick: (__VLS_ctx.closeMobileMenu)
        };
        __VLS_75.slots.default;
        (__VLS_ctx.authStore.user.value?.username);
        var __VLS_75;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.mobileMenuOpen))
                        return;
                    if (!(__VLS_ctx.authStore.isAuthenticated.value))
                        return;
                    __VLS_ctx.authStore.logout();
                    __VLS_ctx.closeMobileMenu();
                } },
            ...{ class: "mobile-logout-btn" },
        });
    }
    else {
        const __VLS_80 = {}.RouterLink;
        /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            ...{ 'onClick': {} },
            to: "/login",
            ...{ class: "mobile-nav-link" },
        }));
        const __VLS_82 = __VLS_81({
            ...{ 'onClick': {} },
            to: "/login",
            ...{ class: "mobile-nav-link" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        let __VLS_84;
        let __VLS_85;
        let __VLS_86;
        const __VLS_87 = {
            onClick: (__VLS_ctx.closeMobileMenu)
        };
        __VLS_83.slots.default;
        var __VLS_83;
        const __VLS_88 = {}.RouterLink;
        /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
            ...{ 'onClick': {} },
            to: "/register",
            ...{ class: "mobile-nav-link register" },
        }));
        const __VLS_90 = __VLS_89({
            ...{ 'onClick': {} },
            to: "/register",
            ...{ class: "mobile-nav-link register" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_89));
        let __VLS_92;
        let __VLS_93;
        let __VLS_94;
        const __VLS_95 = {
            onClick: (__VLS_ctx.closeMobileMenu)
        };
        __VLS_91.slots.default;
        var __VLS_91;
    }
}
/** @type {__VLS_StyleScopedClasses['app-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-container']} */ ;
/** @type {__VLS_StyleScopedClasses['header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-link']} */ ;
/** @type {__VLS_StyleScopedClasses['desktop-logo']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-logo']} */ ;
/** @type {__VLS_StyleScopedClasses['desktop-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['header-search']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['avatar-circle']} */ ;
/** @type {__VLS_StyleScopedClasses['user-name']} */ ;
/** @type {__VLS_StyleScopedClasses['login-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['register-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-hamburger-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-menu-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-search-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-auth-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-logout-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['register']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            SearchBar: SearchBar,
            BrandLogo: BrandLogo,
            route: route,
            authStore: authStore,
            searchQuery: searchQuery,
            mobileMenuOpen: mobileMenuOpen,
            handleSearch: handleSearch,
            toggleMobileMenu: toggleMobileMenu,
            closeMobileMenu: closeMobileMenu,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
