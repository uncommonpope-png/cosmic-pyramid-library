(function () {
    'use strict';

    const localPage = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const params = new URLSearchParams(location.search);

    function validEndpoint(value, websocket) {
        if (!value) return '';
        try {
            const url = new URL(value);
            const allowed = websocket ? ['ws:', 'wss:'] : ['http:', 'https:'];
            if (!allowed.includes(url.protocol)) return '';
            if (!localPage && (url.protocol === 'http:' || url.protocol === 'ws:')) return '';
            return url.toString().replace(/\/$/, '');
        } catch (_) {
            return '';
        }
    }

    const publicFallback = {
        gsk: 'https://r4zlt8a.abc-tunnel.us/gsk',
        thoughts: 'wss://r4zlt8a.abc-tunnel.us/thoughts',
        sanctum: 'wss://r4zlt8a.abc-tunnel.us/sanctum'
    };

    function endpoint(name, websocket, localFallback) {
        const queryValue = params.get(name);
        const storageKey = `cpl-${name}-endpoint`;
        const selected = validEndpoint(queryValue, websocket)
            || validEndpoint(localStorage.getItem(storageKey), websocket)
            || (localPage ? localFallback : (publicFallback[name] || ''));
        if (queryValue && selected) localStorage.setItem(storageKey, selected);
        return selected;
    }

    window.GSK_ENDPOINT = window.GSK_ENDPOINT || endpoint('gsk', false, 'http://localhost:3001');
    window.GSK_WS_ENDPOINT = window.GSK_WS_ENDPOINT || endpoint('thoughts', true, 'ws://localhost:3002');
    window.SANCTUM_WS_ENDPOINT = window.SANCTUM_WS_ENDPOINT || endpoint('sanctum', true, 'ws://localhost:9001');
    window.GSK_API_KEY = window.GSK_API_KEY || sessionStorage.getItem('cpl-soul-key') || '';

    window.configureCPLSoul = function (config) {
        const values = {
            gsk: validEndpoint(config.gsk, false),
            thoughts: validEndpoint(config.thoughts, true),
            sanctum: validEndpoint(config.sanctum, true)
        };
        for (const [name, value] of Object.entries(values)) {
            if (value) localStorage.setItem(`cpl-${name}-endpoint`, value);
        }
        if (config.key) sessionStorage.setItem('cpl-soul-key', config.key);
        location.reload();
    };
})();
