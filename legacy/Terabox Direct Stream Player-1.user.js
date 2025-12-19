// ==UserScript==
// @name         Terabox DDL & Stream Player
// @namespace    https://github.com/faridzfr/tera-play
// @version      0.5pre5
// @description  Terabox app within web, direct download links, and stream video files directly from Terabox shares.
// @author       https://github.com/faridzfr
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
// @icon         https://www.terabox.com/box-static/disk-system/images/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const C = {
        UA: 'terabox;1.40.0.132;PC;PC-Windows;10.0.26100;WindowsTeraBox',
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
        TIMEOUT: 30000, //30s
    };

    let totalScanned = 0;

    const parseUrl = (url) => {
        try {
            const u = new URL(url);
            let key = u.searchParams.get('surl') || u.pathname.match(/\/s\/([^/?#]+)/)?.[1];
            return key && (key.startsWith('1') && key.length > 1 ? key.slice(1) : key);
        } catch { return null; }
    };

    const getToken = () => {
        try {
            return unsafeWindow.jsToken || unsafeWindow.yunData?.jsToken ||
                   document.documentElement.innerHTML.match(/fn%28%22(.*)%22%29/)?.[1] ||
                   document.documentElement.innerHTML.match(/window\.jsToken\s*=\s*["']([^"']+)["']/)?.[1];
        } catch { return null; }
    };

    const isVideo = (name) => C.VIDEO_EXT.test(name);

    const formatSize = (b) => {
        if (!b) return 'Unknown';
        const u = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        while (b >= 1024 && i < 3) { b /= 1024; i++; }
        return `${b.toFixed(2)} ${u[i]}`;
    };

    const api = (url, method = 'GET', data = null) => new Promise((res, rej) => {
        const cookie = GM_getValue('tb_ndus', '');
        const timeout = setTimeout(() => rej(new Error('Request timeout')), C.TIMEOUT);

        GM_xmlhttpRequest({
            method, url, data,
            headers: {
                'User-Agent': C.UA,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': location.origin,
                'Referer': location.href,
                ...(cookie && { 'Cookie': `ndus=${cookie}` })
            },
            onload: r => {
                clearTimeout(timeout);
                try {
                    const json = JSON.parse(r.responseText);
                    res(json);
                } catch (e) {
                    rej(new Error('Parse error: ' + e.message));
                }
            },
            onerror: e => {
                clearTimeout(timeout);
                rej(new Error('Network error: ' + (e.message || 'Unknown')));
            }
        });
    });

    const updateProgress = (text) => {
        const btn = document.getElementById('tb-stream-btn');
        if (btn) btn.textContent = text;
    };

    const scan = async (key, token, dir = '', depth = 0) => {
        if (depth > C.MAX_DEPTH) {
            console.warn(`Max depth ${C.MAX_DEPTH} reached, skipping: ${dir}`);
            return [];
        }

        console.log(`Scanning [depth ${depth}]: ${dir || 'root'}`);
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
            console.error(`API error at ${dir}:`, e);
            throw e;
        }

        if (res.errno === -6) throw new Error('AUTH');
        if (res.errno === 4000020) throw new Error('BAD_TOKEN');
        if (res.errno === -9) {
            console.warn('Invalid directory path:', dir);
            return [];
        }
        if (res.errno !== 0) {
            console.error('API error response:', res);
            throw new Error(`API error ${res.errno}: ${res.show_msg || res.errmsg || 'Unknown'}`);
        }

        const items = res.list || res.entries || res.data?.list || [];
        console.log(`Found ${items.length} items in: ${dir || 'root'}`);

        const files = [];

        for (const e of items) {
            const isDir = e.isdir === 1 || e.isdir === '1' || e.isdir === true;

            if (isDir) {
                const subPath = e.path || (dir ? `${dir}/${e.server_filename || e.filename}` : `/${e.server_filename || e.filename}`);
                console.log(`Entering folder: ${subPath}`);

                try {
                    const subFiles = await scan(key, token, subPath, depth + 1);
                    files.push(...subFiles);
                } catch (e) {
                    console.error(`Failed to scan ${subPath}:`, e);
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
        b.textContent = text;
        css(b, {
            background: bg, color: 'white', border: 'none', padding: '6px 12px',
            borderRadius: '4px', fontSize: '12px', fontWeight: '500', cursor: 'pointer',
            fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap'
        });
        b.onmouseenter = () => b.style.opacity = '0.85';
        b.onmouseleave = () => b.style.opacity = '1';
        b.onclick = onClick;
        return b;
    };

    const play = (file, area) => {
        area.innerHTML = '';
        const v = document.createElement('video');
        css(v, { width: '100%', height: '100%', outline: 'none' });
        v.controls = true;
        v.autoplay = true;
        v.src = file.dlink;
        v.onerror = () => {
            area.innerHTML = `<div style="color:${C.TEXT};text-align:center;padding:40px;font-family:system-ui">
                <div style="font-size:36px;margin-bottom:12px">⚠</div>
                <div style="font-size:16px;margin-bottom:8px">Failed to load video</div>
                <div style="font-size:12px;color:${C.TEXT_MUTED};margin-bottom:20px">
                    Authentication required or restricted content
                </div>
                <button onclick="window.open('${file.dlink}')" style="background:${C.PRIMARY};color:white;
                    border:none;padding:10px 20px;border-radius:4px;cursor:pointer;font-size:13px">
                    Open in New Tab
                </button>
            </div>`;
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
            width: '100%', maxWidth: '1100px', maxHeight: '90vh', background: C.BG_DARK,
            borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column'
        });

        // Header
        const hdr = document.createElement('div');
        css(hdr, { background: C.BG_GRAY, padding: '12px 16px', display: 'flex',
                   justifyContent: 'space-between', alignItems: 'center' });

        const title = document.createElement('span');
        title.textContent = `Stream Player (${files.length} files)`;
        css(title, { color: C.TEXT, fontSize: '15px', fontWeight: '600',
                     fontFamily: 'system-ui, -apple-system, sans-serif' });

        const close = document.createElement('button');
        close.textContent = '×';
        css(close, { background: C.DANGER, color: 'white', border: 'none', width: '28px',
                     height: '28px', borderRadius: '50%', fontSize: '20px', cursor: 'pointer' });
        close.onmouseenter = () => close.style.opacity = '0.85';
        close.onmouseleave = () => close.style.opacity = '1';
        close.onclick = () => overlay.remove();

        hdr.appendChild(title);
        hdr.appendChild(close);

        // Player
        const player = document.createElement('div');
        css(player, { background: C.BG_DARKER, width: '100%', aspectRatio: '16/9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' });

        // List
        const list = document.createElement('div');
        css(list, { flex: '1', overflowY: 'auto', background: C.BG_GRAY, padding: '12px' });

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
                list.appendChild(pathHdr);
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
                    acts.appendChild(btn('Download', C.PRIMARY, () => window.open(f.dlink)));
                } else {
                    const na = document.createElement('span');
                    na.textContent = 'No link';
                    css(na, { color: C.DANGER, fontSize: '11px' });
                    acts.appendChild(na);
                }

                item.appendChild(info);
                item.appendChild(acts);
                list.appendChild(item);
            });
        });

        box.appendChild(hdr);
        box.appendChild(player);
        box.appendChild(list);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const first = files.find(f => isVideo(f.name) && f.dlink);
        if (first) play(first, player);
    };

    const handleAuth = () => {
        const stored = GM_getValue('tb_ndus', '');
        const msg = stored ? 'Session expired. Update cookie:' : 'Enter NDUS cookie:';
        const input = prompt(msg, stored);
        if (input?.length > 5) {
            GM_setValue('tb_ndus', input.trim());
            alert('Cookie saved. Try again.');
        }
    };

    const main = document.createElement('button');
    main.id = 'tb-stream-btn';
    main.textContent = 'Stream Player';
    css(main, {
        position: 'fixed', bottom: '20px', right: '20px', background: C.PRIMARY,
        color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px',
        fontSize: '13px', fontWeight: '500', cursor: 'pointer', zIndex: '999999',
        fontFamily: 'system-ui, -apple-system, sans-serif', boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
    });

    main.onmouseenter = () => {
        if (!main.disabled) {
            css(main, { background: C.PRIMARY_DARK, transform: 'translateY(-1px)' });
        }
    };
    main.onmouseleave = () => {
        if (!main.disabled) {
            css(main, { background: C.PRIMARY, transform: 'translateY(0)' });
        }
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

            console.log('Starting scan with key:', key);
            const files = await scan(key, token);

            if (!files.length) throw new Error('No files found');

            console.log(`Scan complete: ${files.length} files found`);
            createPlayer(files);

        } catch (e) {
            console.error('Error:', e);
            if (e.message === 'AUTH') {
                handleAuth();
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
