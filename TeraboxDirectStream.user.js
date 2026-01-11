// ==UserScript==
// @name         Terabox DDL & Stream Player
// @namespace    https://github.com/cyan-n1d3/
// @version      0.8.0
// @description  Terabox app within web, direct download links, and stream video files directly from Terabox shares.
// @author       cyan-n1d3
// @homepage     https://github.com/cyan-n1d3/tera-play
// @homepageURL  https://github.com/cyan-n1d3/tera-play
// @supportURL   https://github.com/cyan-n1d3/tera-play/issues
// @updateURL    https://github.com/cyan-n1d3/tera-play/raw/main/TeraboxDirectStream.user.js
// @downloadURL  https://github.com/cyan-n1d3/tera-play/raw/main/TeraboxDirectStream.user.js
// @icon         https://www.terabox.com/box-static/disk-system/images/favicon.ico
// @icon64       https://www.terabox.com/box-static/disk-system/images/favicon.ico
// @match        *://www.terabox.com/*
// @match        *://terabox.com/*
// @match        *://*.terabox.com/*
// @match        *://www.terabox.app/*
// @match        *://terabox.app/*
// @match        *://*.terabox.app/*
// @match        *://www.terabox.fun/*
// @match        *://terabox.fun/*
// @match        *://*.terabox.fun/*
// @match        *://www.terabox.link/*
// @match        *://terabox.link/*
// @match        *://*.terabox.link/*
// @match        *://www.terabox.club/*
// @match        *://terabox.club/*
// @match        *://*.terabox.club/*
// @match        *://www.1024tera.com/*
// @match        *://1024tera.com/*
// @match        *://*.1024tera.com/*
// @match        *://www.mirrobox.com/*
// @match        *://mirrobox.com/*
// @match        *://*.mirrobox.com/*
// @match        *://www.nephobox.com/*
// @match        *://nephobox.com/*
// @match        *://*.nephobox.com/*
// @match        *://www.momerybox.com/*
// @match        *://momerybox.com/*
// @match        *://*.momerybox.com/*
// @match        *://www.tibibox.com/*
// @match        *://tibibox.com/*
// @match        *://*.tibibox.com/*
// @match        *://www.terafileshare.com/*
// @match        *://terafileshare.com/*
// @match        *://*.terafileshare.com/*
// @run-at       document-end
// @license      MIT
// @compatible   chrome Compatible with Tampermonkey and Violentmonkey
// @compatible   firefox Compatible with Tampermonkey, Violentmonkey, and Greasemonkey
// @compatible   edge Compatible with Tampermonkey and Violentmonkey
// @compatible   safari Compatible with Userscripts
// @require      none
// ==/UserScript==

(function () {
    'use strict';

    const C = {
        DEBUG: false,

        PRIMARY: '#0d6efd',
        PRIMARY_DARK: '#0745b6',
        DANGER: '#dc3545',
        SUCCESS: '#198754',

        BG_DARK: '#1a1a1a',
        BG_DARKER: '#0d0d0d',
        BG_GRAY: '#2c3e50',

        TEXT: '#ecf0f1',
        TEXT_MUTED: '#6c757d',

        VIDEO_EXT: /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|mpeg|mpg)$/i,
        MAX_DEPTH: 10,
        TIMEOUT: 30000, // 30s
    };

    let totalScanned = 0;

    const log = (...args) => { if (C.DEBUG) console.log('[tera-play]', ...args); };
    const warn = (...args) => { if (C.DEBUG) console.warn('[tera-play]', ...args); };
    const err  = (...args) => { if (C.DEBUG) console.error('[tera-play]', ...args); };

    const openLink = (url) => {
        if (!url) return;
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const parseUrl = (url) => {
        try {
            const u = new URL(url);
            let key = u.searchParams.get('surl') || u.pathname.match(/\/s\/([^/?#]+)/)?.[1];
            return key && (key.startsWith('1') && key.length > 1 ? key.slice(1) : key);
        } catch {
            return null;
        }
    };

    const getToken = () => {
        try {
            return unsafeWindow.jsToken
                || unsafeWindow.yunData?.jsToken
                || document.documentElement.innerHTML.match(/fn%28%22(.*)%22%29/)?.[1]
                || document.documentElement.innerHTML.match(/window\.jsToken\s*=\s*["']([^"']+)["']/)?.[1];
        } catch {
            return null;
        }
    };

    const isVideo = (name) => C.VIDEO_EXT.test(name);

    const formatSize = (b) => {
        if (!b) return 'Unknown';
        const u = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        while (b >= 1024 && i < 3) { b /= 1024; i++; }
        return `${b.toFixed(2)} ${u[i]}`;
    };

    const api = async (url, method = 'GET', data = null) => {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), C.TIMEOUT);
        try {
            const opts = {
                method,
                credentials: 'include',
                signal: ctrl.signal,
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Origin': location.origin,
                    'Referer': location.href,
                }
            };

            if (method !== 'GET' && data != null) {
                opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                opts.body = data;
            }

            const r = await fetch(url, opts);
            const text = await r.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                throw new Error('Parse error: ' + e.message);
            }
        } catch (e) {
            if (e?.name === 'AbortError') throw new Error('Request timeout');
            throw new Error('Network error: ' + (e?.message || 'Unknown'));
        } finally {
            clearTimeout(timeout);
        }
    };

    const updateProgress = (text) => {
        const btn = document.getElementById('tb-stream-btn');
        if (btn) btn.textContent = text;
    };

    const scan = async (key, token, dir = '', depth = 0) => {
        if (depth > C.MAX_DEPTH) {
            warn(`Max depth ${C.MAX_DEPTH} reached, skipping a directory`);
            return [];
        }

        log(`Scanning depth ${depth}`);
        updateProgress(`Scanning... (${totalScanned} files)`);

        const p = new URLSearchParams({
            app_id: '250528',
            web: '1',
            channel: 'dubox',
            clienttype: '0',
            jsToken: token,
            shorturl: key,
            dir: dir,
            root: dir ? '0' : '1',
            order: 'name',
            desc: '0',
            num: '20000'
        });

        let res;
        try {
            res = await api(`${location.origin}/share/list?${p}`);
        } catch (e) {
            err(`API error during scan`, e);
            throw e;
        }

        if (res.errno === -6) throw new Error('AUTH');
        if (res.errno === 4000020) throw new Error('BAD_TOKEN');
        if (res.errno === -9) {
            warn('Invalid directory path');
            return [];
        }
        if (res.errno !== 0) {
            err('API error response', res);
            throw new Error(`API error ${res.errno}: ${res.show_msg || res.errmsg || 'Unknown'}`);
        }

        const items = res.list || res.entries || res.data?.list || [];
        log(`Found ${items.length} items`);

        const files = [];
        for (const e of items) {
            const isDir = e.isdir === 1 || e.isdir === '1' || e.isdir === true;
            if (isDir) {
                const subPath = e.path || (dir ? `${dir}/${e.server_filename || e.filename}` : `/${e.server_filename || e.filename}`);
                log(`Entering folder: ${subPath}`);
                try {
                    const subFiles = await scan(key, token, subPath, depth + 1);
                    files.push(...subFiles);
                } catch (e) {
                    err(`Failed to scan a subfolder`, e);
                }
            } else {
                totalScanned++;
                files.push({
                    id: e.fs_id,
                    name: e.server_filename || e.filename,
                    size: e.size,
                    dlink: e.dlink || e.dlink1 || e.dlink2 || null,
                    path: dir || '/',
                });
            }
        }

        return files;
    };

    const css = (el, styles) => Object.assign(el.style, styles);

    const btn = (text, bg, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        css(b, {
            background: bg,
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            whiteSpace: 'nowrap'
        });
        b.onmouseenter = () => b.style.opacity = '0.85';
        b.onmouseleave = () => b.style.opacity = '1';
        b.onclick = onClick;
        return b;
    };

    const play = (file, area) => {
        area.textContent = '';

        const v = document.createElement('video');
        css(v, { 
            width: '100%', 
            height: '100%',
            maxWidth: '100%',
            maxHeight: '100%', 
            outline: 'none',
            objectFit: 'contain',
            background: '#000'
        });
        v.controls = true;
        v.autoplay = true;
        v.src = file.dlink;

        v.onerror = () => {
            area.textContent = '';

            const wrap = document.createElement('div');
            css(wrap, {
                color: C.TEXT,
                textAlign: 'center',
                padding: '40px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
            });

            const icon = document.createElement('div');
            icon.textContent = '!';
            css(icon, { fontSize: '36px', marginBottom: '12px' });

            const title = document.createElement('div');
            title.textContent = 'Failed to load video';
            css(title, { fontSize: '16px', marginBottom: '8px' });

            const hint = document.createElement('div');
            hint.textContent = 'Authentication required';
            css(hint, { fontSize: '12px', color: C.TEXT_MUTED, marginBottom: '20px' });

            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = 'Open in New Tab';
            css(b, {
                background: C.PRIMARY,
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
            });
            b.addEventListener('click', () => openLink(file.dlink));

            wrap.appendChild(icon);
            wrap.appendChild(title);
            wrap.appendChild(hint);
            wrap.appendChild(b);
            area.appendChild(wrap);
        };

        area.appendChild(v);
    };

    const createPlayer = (files) => {
        const overlay = document.createElement('div');
        css(overlay, {
            position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.92)', zIndex: '10000000',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        });

        const box = document.createElement('div');
        css(box, {
            width: '100%', 
            maxWidth: '1100px',
            height: '90vh', 
            maxHeight: '90vh', 
            background: C.BG_DARK,
            borderRadius: '8px', 
            overflow: 'hidden', 
            display: 'flex', 
            flexDirection: 'column'
        });

        // Header
        const hdr = document.createElement('div');
        css(hdr, {
            background: C.BG_GRAY,
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        });

        const title = document.createElement('span');
        title.textContent = `Stream Player (${files.length} files)`;
        css(title, {
            color: C.TEXT,
            fontSize: '15px',
            fontWeight: '600',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        });

        const controls = document.createElement('div');
        css(controls, { display: 'flex', gap: '8px', alignItems: 'center' });
        
        // toogle in player
        const toggleP = document.createElement('button');
        toggleP.type = 'button';
        toggleP.textContent = 'Show';
        css(toggleP, {
            background: C.PRIMARY,
            color: 'white',
            border: 'none',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer'
        });
        toggleP.onmouseenter = () => toggleP.style.opacity = '0.85';
        toggleP.onmouseleave = () => toggleP.style.opacity = '1';
        
        // close button
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '✖';
        css(close, {
            background: C.DANGER,
            color: 'white',
            border: 'none',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            fontSize: '20px',
            cursor: 'pointer'
        });
        close.onmouseenter = () => close.style.opacity = '0.85';
        close.onmouseleave = () => close.style.opacity = '1';
        close.onclick = () => overlay.remove();
        
        hdr.appendChild(title);
        controls.appendChild(toggleP);
        controls.appendChild(close);
        hdr.appendChild(controls);        

        // Player
        const player = document.createElement('div');
        css(player, {
            background: C.BG_DARKER,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '45vh',
            maxHeight: '55vh',
            flex: '0 0 auto',
            overflow: 'hidden',
        });

        let collapsed = false;

        const applyCollapse = () => {
            if (collapsed) {
                player.style.display = 'none';
                toggleP.textContent = 'Show';
            } else {
                player.style.display = 'flex';
                toggleP.textContent = 'Hide';
            }
        };

        toggleP.addEventListener('click', () => {
            collapsed = !collapsed;
            applyCollapse();
            applyLayout();
        });

        // mobile interface
        if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) {
            collapsed = true;
            applyCollapse();
        }

        // List (wrapper + header + scroll body)
        const listWrap = document.createElement('div');
        css(listWrap, {
            display: 'flex',
            flexDirection: 'column',
            flex: '1',
            minHeight: '0',
            background: C.BG_GRAY
        });

        const listHdr = document.createElement('div');
        css(listHdr, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.08)'
        });

        const listHdrTitle = document.createElement('div');
        listHdrTitle.textContent = 'Files';
        css(listHdrTitle, {
            color: C.TEXT,
            fontSize: '12px',
            fontWeight: '600',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        });

        // Move toggleList here (below player, inside list header)
        const toggleList = document.createElement('button');
        toggleList.type = 'button';
        toggleList.textContent = 'Hide list';
        css(toggleList, {
            background: C.PRIMARY,
            color: 'white',
            border: 'none',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer'
        });
        toggleList.onmouseenter = () => toggleList.style.opacity = '0.85';
        toggleList.onmouseleave = () => toggleList.style.opacity = '1';

        listHdr.appendChild(listHdrTitle);
        listHdr.appendChild(toggleList);

        const listBody = document.createElement('div');
        css(listBody, {
            flex: '1',
            minHeight: '0',
            overflowY: 'auto',
            padding: '12px'
        });

        listWrap.appendChild(listHdr);
        listWrap.appendChild(listBody);

        let listCollapsed = false;

        const fitPlayerToBox = () => {
            const available = box.clientHeight - hdr.offsetHeight - listHdr.offsetHeight;
            const h = Math.max(180, available);
            player.style.height = `${h}px`;
            player.style.maxHeight = `${h}px`;
        };

        const applyLayout = () => {
            listBody.style.display = listCollapsed ? 'none' : 'block';
            toggleList.textContent = listCollapsed ? 'Show' : 'Hide';

        if (listCollapsed) {
            player.style.flex = '0 0 auto';
            fitPlayerToBox();
            listWrap.style.flex = '0 0 auto';
        } else {
            player.style.flex = '0 0 auto';
            player.style.height = '45vh';
            player.style.maxHeight = '55vh';
            listWrap.style.flex = '1 1 auto';
        }
        };

        toggleList.addEventListener('click', () => {
            listCollapsed = !listCollapsed;
            applyLayout();
        });

        window.addEventListener('resize', applyLayout);
        applyLayout();  

        // Group files by path
        const grouped = {};
        files.forEach(f => {
            const path = f.path || '/';
            if (!grouped[path]) grouped[path] = [];
            grouped[path].push(f);
        });

        // Render grouped files
        Object.keys(grouped).sort().forEach(path => {
            if (Object.keys(grouped).length > 1) {
                const pathHdr = document.createElement('div');
                pathHdr.textContent = path === '/' ? 'Root' : path;
                css(pathHdr, {
                    color: C.TEXT_MUTED, fontSize: '11px', fontWeight: '600',
                    marginBottom: '6px', marginTop: '12px', fontFamily: 'monospace'
                });
                listBody.appendChild(pathHdr);
            }

            grouped[path].forEach(f => {
                const item = document.createElement('div');
                css(item, {
                    background: C.BG_DARK, borderRadius: '6px', padding: '10px', marginBottom: '8px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                });

                if (f.dlink) {
                    item.onmouseenter = () => item.style.background = C.BG_DARKER;
                    item.onmouseleave = () => item.style.background = C.BG_DARK;
                }

                const info = document.createElement('div');
                css(info, { flex: '1', minWidth: '0' });

                const name = document.createElement('div');
                name.textContent = f.name;
                css(name, {
                    color: C.TEXT, fontSize: '13px', fontWeight: '500', marginBottom: '3px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                });

                const meta = document.createElement('div');
                meta.textContent = `${isVideo(f.name) ? 'Video' : 'File'} • ${formatSize(f.size)}`;
                css(meta, { color: C.TEXT_MUTED, fontSize: '11px', fontFamily: 'monospace' });

                info.appendChild(name);
                info.appendChild(meta);

                const acts = document.createElement('div');
                css(acts, { display: 'flex', gap: '6px', marginLeft: '12px' });

                if (f.dlink) {
                    if (isVideo(f.name)) {
                        acts.appendChild(btn('Play', C.SUCCESS, () => play(f, player)));
                    }
                    acts.appendChild(btn('Download', C.PRIMARY, () => openLink(f.dlink)));
                } else {
                    const na = document.createElement('span');
                    na.textContent = 'No link';
                    css(na, { color: C.DANGER, fontSize: '11px' });
                    acts.appendChild(na);
                }

                item.appendChild(info);
                item.appendChild(acts);
                listBody.appendChild(item);
            });
        });

        box.appendChild(hdr);
        box.appendChild(player);
        box.appendChild(listWrap);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const first = files.find(f => isVideo(f.name) && f.dlink);
        if (first && !collapsed) play(first, player);

    };

    const main = document.createElement('button');
    main.id = 'tb-stream-btn';
    main.textContent = 'Stream Player';
    css(main, {
        position: 'fixed', bottom: '20px', right: '20px', background: C.PRIMARY,
        color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px',
        fontSize: '13px', fontWeight: '500', cursor: 'pointer', zIndex: '999999',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
    });

    main.onmouseenter = () => {
        if (!main.disabled) css(main, { background: C.PRIMARY_DARK, transform: 'translateY(-1px)' });
    };
    main.onmouseleave = () => {
        if (!main.disabled) css(main, { background: C.PRIMARY, transform: 'translateY(0)' });
    };

    main.onclick = async () => {
        const orig = main.textContent;
        main.textContent = 'Loading...';
        main.disabled = true;
        css(main, { opacity: '0.6', cursor: 'not-allowed' });

        totalScanned = 0;

        try {
            const key = parseUrl(location.href);
            if (!key) throw new Error('No share key found');

            let token = getToken();
            if (!token) {
                await new Promise(r => setTimeout(r, 1000));
                token = getToken();
            }
            if (!token) throw new Error('No jsToken found');

            const files = await scan(key, token);
            if (!files.length) throw new Error('No files found');

            log(`Scan complete: ${files.length} files found`);
            createPlayer(files);

        } catch (e) {
            err('Error', e);
            if (e.message === 'AUTH') {
                alert('Authentication required. Please log in to Terabox in this browser, then try again.');
            } else if (e.message === 'BAD_TOKEN') {
                alert('jsToken expired. Please refresh the page and try again.');
            } else {
                alert(`Error: ${e.message}\n\nreport the issue if error persists.`);
            }
        } finally {
            main.textContent = orig;
            main.disabled = false;
            css(main, { opacity: '1', cursor: 'pointer' });
        }
    };

    document.body.appendChild(main);
})();
