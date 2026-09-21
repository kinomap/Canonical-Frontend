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
    to: "/series",
    ...{ class: "nav-link" },
    ...{ class: ({ active: __VLS_ctx.route.path.startsWith('/series') }) },
}));
const __VLS_20 = __VLS_19({
    to: "/series",
    ...{ class: "nav-link" },
    ...{ class: ({ active: __VLS_ctx.route.path.startsWith('/series') }) },
}, ...__VLS_functionalComponentArgsRest(__VLS_19));
__VLS_21.slots.default;
var __VLS_21;
const __VLS_22 = {}.RouterLink;
/** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
// @ts-ignore
const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({
    to: "/genres",
    ...{ class: "nav-link" },
    ...{ class: ({ active: __VLS_ctx.route.path === '/genres' }) },
}));
const __VLS_24 = __VLS_23({
    to: "/genres",
    ...{ class: "nav-link" },
    ...{ class: ({ active: __VLS_ctx.route.path === '/genres' }) },
}, ...__VLS_functionalComponentArgsRest(__VLS_23));
__VLS_25.slots.default;
var __VLS_25;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-right" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-search" },
});
/** @type {[typeof SearchBar, ]} */ ;
// @ts-ignore
const __VLS_26 = __VLS_asFunctionalComponent(SearchBar, new SearchBar({
    ...{ 'onSearch': {} },
    modelValue: (__VLS_ctx.searchQuery),
    placeholder: "Search movies...",
}));
const __VLS_27 = __VLS_26({
    ...{ 'onSearch': {} },
    modelValue: (__VLS_ctx.searchQuery),
    placeholder: "Search movies...",
}, ...__VLS_functionalComponentArgsRest(__VLS_26));
let __VLS_29;
let __VLS_30;
let __VLS_31;
const __VLS_32 = {
    onSearch: (__VLS_ctx.handleSearch)
};
var __VLS_28;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "auth-controls" },
});
if (__VLS_ctx.authStore.isAuthenticated.value) {
    const __VLS_33 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
        to: "/profile",
        ...{ class: "profile-btn" },
        title: "User Profile",
    }));
    const __VLS_35 = __VLS_34({
        to: "/profile",
        ...{ class: "profile-btn" },
        title: "User Profile",
    }, ...__VLS_functionalComponentArgsRest(__VLS_34));
    __VLS_36.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "avatar-circle" },
    });
    ((__VLS_ctx.authStore.user.value?.username || 'U')[0].toUpperCase());
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "user-name" },
    });
    (__VLS_ctx.authStore.user.value?.username || 'Profile');
    var __VLS_36;
}
else {
    const __VLS_37 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
        to: "/login",
        ...{ class: "login-btn" },
    }));
    const __VLS_39 = __VLS_38({
        to: "/login",
        ...{ class: "login-btn" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    __VLS_40.slots.default;
    var __VLS_40;
    const __VLS_41 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
        to: "/register",
        ...{ class: "register-btn" },
    }));
    const __VLS_43 = __VLS_42({
        to: "/register",
        ...{ class: "register-btn" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_42));
    __VLS_44.slots.default;
    var __VLS_44;
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
    const __VLS_45 = __VLS_asFunctionalComponent(SearchBar, new SearchBar({
        ...{ 'onSearch': {} },
        modelValue: (__VLS_ctx.searchQuery),
        placeholder: "Search movies...",
    }));
    const __VLS_46 = __VLS_45({
        ...{ 'onSearch': {} },
        modelValue: (__VLS_ctx.searchQuery),
        placeholder: "Search movies...",
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    let __VLS_48;
    let __VLS_49;
    let __VLS_50;
    const __VLS_51 = {
        onSearch: (__VLS_ctx.handleSearch)
    };
    var __VLS_47;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
        ...{ class: "mobile-nav" },
    });
    const __VLS_52 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        ...{ 'onClick': {} },
        to: "/",
        ...{ class: "mobile-nav-link" },
    }));
    const __VLS_54 = __VLS_53({
        ...{ 'onClick': {} },
        to: "/",
        ...{ class: "mobile-nav-link" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    let __VLS_56;
    let __VLS_57;
    let __VLS_58;
    const __VLS_59 = {
        onClick: (__VLS_ctx.closeMobileMenu)
    };
    __VLS_55.slots.default;
    var __VLS_55;
    const __VLS_60 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        ...{ 'onClick': {} },
        to: "/movies",
        ...{ class: "mobile-nav-link" },
    }));
    const __VLS_62 = __VLS_61({
        ...{ 'onClick': {} },
        to: "/movies",
        ...{ class: "mobile-nav-link" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    let __VLS_64;
    let __VLS_65;
    let __VLS_66;
    const __VLS_67 = {
        onClick: (__VLS_ctx.closeMobileMenu)
    };
    __VLS_63.slots.default;
    var __VLS_63;
    const __VLS_68 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        ...{ 'onClick': {} },
        to: "/series",
        ...{ class: "mobile-nav-link" },
    }));
    const __VLS_70 = __VLS_69({
        ...{ 'onClick': {} },
        to: "/series",
        ...{ class: "mobile-nav-link" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    let __VLS_72;
    let __VLS_73;
    let __VLS_74;
    const __VLS_75 = {
        onClick: (__VLS_ctx.closeMobileMenu)
    };
    __VLS_71.slots.default;
    var __VLS_71;
    const __VLS_76 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        ...{ 'onClick': {} },
        to: "/genres",
        ...{ class: "mobile-nav-link" },
    }));
    const __VLS_78 = __VLS_77({
        ...{ 'onClick': {} },
        to: "/genres",
        ...{ class: "mobile-nav-link" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
    let __VLS_80;
    let __VLS_81;
    let __VLS_82;
    const __VLS_83 = {
        onClick: (__VLS_ctx.closeMobileMenu)
    };
    __VLS_79.slots.default;
    var __VLS_79;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mobile-auth-divider" },
    });
    if (__VLS_ctx.authStore.isAuthenticated.value) {
        const __VLS_84 = {}.RouterLink;
        /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
            ...{ 'onClick': {} },
            to: "/profile",
            ...{ class: "mobile-nav-link" },
        }));
        const __VLS_86 = __VLS_85({
            ...{ 'onClick': {} },
            to: "/profile",
            ...{ class: "mobile-nav-link" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
        let __VLS_88;
        let __VLS_89;
        let __VLS_90;
        const __VLS_91 = {
            onClick: (__VLS_ctx.closeMobileMenu)
        };
        __VLS_87.slots.default;
        (__VLS_ctx.authStore.user.value?.username);
        var __VLS_87;
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
        const __VLS_92 = {}.RouterLink;
        /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
            ...{ 'onClick': {} },
            to: "/login",
            ...{ class: "mobile-nav-link" },
        }));
        const __VLS_94 = __VLS_93({
            ...{ 'onClick': {} },
            to: "/login",
            ...{ class: "mobile-nav-link" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        let __VLS_96;
        let __VLS_97;
        let __VLS_98;
        const __VLS_99 = {
            onClick: (__VLS_ctx.closeMobileMenu)
        };
        __VLS_95.slots.default;
        var __VLS_95;
        const __VLS_100 = {}.RouterLink;
        /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            ...{ 'onClick': {} },
            to: "/register",
            ...{ class: "mobile-nav-link register" },
        }));
        const __VLS_102 = __VLS_101({
            ...{ 'onClick': {} },
            to: "/register",
            ...{ class: "mobile-nav-link register" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        let __VLS_104;
        let __VLS_105;
        let __VLS_106;
        const __VLS_107 = {
            onClick: (__VLS_ctx.closeMobileMenu)
        };
        __VLS_103.slots.default;
        var __VLS_103;
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
