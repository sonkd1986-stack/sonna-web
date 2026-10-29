(function () {
  var MEM = {}, authed = false, pending = 'Store', cur = 'Store', NAV = [], PAGES = {};
  var timers = {}, storeWrites = {}, publicStoreSnapshot = null, liveStateSnapshot = null, adminStoreSnapshot = null, storeRefreshBusy = false, realtimeRefreshAt = 0;
  var realtimeClientLoading = false, realtimeClient = null;

  function api(method, url, body) {
    return fetch(url, {
      method: method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
        j._status = r.status;
        if ('user' in j) window.SONNA_USER = j.user;
        if (Array.isArray(j.orders)) window.SONNA_ORDERS = j.orders;
        if (j.order) window.SONNA_ORDERS = [j.order].concat(window.SONNA_ORDERS || []);
        if (j.sold) MEM.sold = j.sold;
        if (Array.isArray(j.recentSales)) MEM.recentSales = j.recentSales;
        if (typeof j.soldAccountCount === 'number') MEM.soldAccountCount = j.soldAccountCount;
        if (j.salesDisplay && typeof j.salesDisplay === 'object') MEM.salesDisplay = j.salesDisplay;
        if (j.catalog && typeof j.catalog === 'object') MEM.catalog = j.catalog;
        if (j.store && typeof j.store === 'object') MEM = Object.assign({}, MEM, j.store);
        return j;
      }); });
  }

  // Store đồng bộ trong bộ nhớ, ghi nền lên Supabase.
  window.SONNA_USER = null; window.SONNA_ORDERS = []; window.SONNA_ADMIN = false;
  window.SONNA_API = api; // cửa hàng gọi API khách hàng qua đây
  function persistStoreValue(k, v) {
    var request = api('PUT', '/api/store/' + encodeURIComponent(k), { value: v }).then(function (r) {
      if (r._status === 401) { authed = false; showLogin(); }
      else if (r._status !== 200) alert('Không lưu được dữ liệu lên máy chủ (mã ' + r._status + '). Hãy tải lại trang và thử ít ảnh hơn.');
      return r;
    });
    storeWrites[k] = request;
    request.then(function () { if (storeWrites[k] === request) delete storeWrites[k]; });
    return request;
  }
  function flushStoreValue(k) {
    var request = storeWrites[k] || Promise.resolve({ _status: 200 });
    if (!timers[k]) return request;
    clearTimeout(timers[k]); delete timers[k];
    return request.then(function (r) {
      if (r && r._status !== 200) return r;
      return persistStoreValue(k, MEM[k]);
    });
  }
  function hydrateStore(s) {
    publicStoreSnapshot = JSON.stringify(s.store || {});
    liveStateSnapshot = JSON.stringify({ store: s.store || {}, payment: s.payment || {}, simTopup: !!s.simTopup, cardTopupReady: !!s.cardTopupReady });
    window.SONNA_CONFIG = { payment: s.payment || {}, simTopup: !!s.simTopup, cardTopupReady: !!s.cardTopupReady };
    setAuthed(!!s.authed);
    if (!authed) {
      MEM = s.store || {};
      return Promise.resolve(true);
    }
    return api('GET', '/api/store').then(function (privateStore) {
      if (privateStore._status !== 200 || !privateStore.data || !privateStore.data.acc) {
        console.error('[SONNA] Không tải được kho dữ liệu quản trị:', privateStore.error || privateStore._status);
        alert('Không tải được dữ liệu quản trị. Hãy đăng nhập lại trước khi tiếp tục.');
        setAuthed(false);
        return false;
      }
      MEM = Object.assign({}, privateStore.data, s.store || {});
      MEM.acc = privateStore.data.acc;
      adminStoreSnapshot = JSON.stringify(privateStore.data);
      return true;
    });
  }
  function refreshStore() {
    var queued = Object.keys(timers);
    queued.forEach(function (k) { clearTimeout(timers[k]); delete timers[k]; });
    return Promise.all(Object.keys(storeWrites).map(function (k) { return storeWrites[k]; })).then(function () {
      return Promise.all(queued.map(function (k) { return persistStoreValue(k, MEM[k]); }));
    }).then(function (writes) {
      if (writes.some(function (r) { return r._status !== 200; })) return null;
      return api('GET', '/api/session').then(function (s) {
        if (s._status !== 200) { alert('Không làm mới được dữ liệu cửa hàng (mã ' + s._status + ').'); return null; }
        return hydrateStore(s).then(function (ok) { return ok ? true : null; });
      });
    }).catch(function (error) {
      console.error('[SONNA] Không thể đồng bộ dữ liệu trước khi tải cửa hàng:', error);
      alert('Không lưu được thay đổi lên máy chủ. Hãy kiểm tra kết nối rồi thử lại.');
      return null;
    });
  }
  function refreshLiveState() {
    if (document.hidden || storeRefreshBusy) return Promise.resolve();
    var now = Date.now();
    if (now - realtimeRefreshAt < 1500) return Promise.resolve();
    realtimeRefreshAt = now;
    storeRefreshBusy = true;
    return api('GET', '/api/session').then(function (s) {
      if (s._status !== 200) throw new Error('Live state refresh failed (' + s._status + ').');
      var snapshot = JSON.stringify({ store: s.store || {}, payment: s.payment || {}, simTopup: !!s.simTopup, cardTopupReady: !!s.cardTopupReady });
      var changed = snapshot !== liveStateSnapshot;
      window.SONNA_CONFIG = { payment: s.payment || {}, simTopup: !!s.simTopup, cardTopupReady: !!s.cardTopupReady };
      publicStoreSnapshot = JSON.stringify(s.store || {});
      if (cur.indexOf('Admin') === 0 && s.authed) {
        return api('GET', '/api/store').then(function (privateStore) {
          if (privateStore._status !== 200 || !privateStore.data || !privateStore.data.acc) {
            throw new Error('Admin state refresh failed (' + privateStore._status + ').');
          }
          var privateSnapshot = JSON.stringify(privateStore.data);
          if (privateSnapshot !== adminStoreSnapshot) {
            MEM = Object.assign({}, privateStore.data, s.store || {});
            MEM.acc = privateStore.data.acc;
            adminStoreSnapshot = privateSnapshot;
            changed = true;
          }
          if (changed) liveStateSnapshot = snapshot;
          return changed;
        });
      }
      if (changed) liveStateSnapshot = snapshot;
      return changed;
    }).then(function (changed) {
      if (!changed) return;
      if (f.contentWindow && typeof f.contentWindow.SONNA_REFRESH === 'function') {
        f.contentWindow.SONNA_REFRESH();
      }
    }).catch(function (error) {
      console.error('[SONNA] Không thể tự cập nhật dữ liệu giao diện:', error);
    }).then(function () {
      storeRefreshBusy = false;
    });
  }
  function setupSupabaseRealtime(config) {
    if (!config || !config.url || !config.key || realtimeClientLoading || realtimeClient) return;
    realtimeClientLoading = true;
    var script = document.createElement('script');
    script.src = '/vendor/supabase.js';
    script.onload = function () {
      try {
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
          throw new Error('Supabase browser SDK did not initialize.');
        }
        realtimeClient = window.supabase.createClient(config.url, config.key, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          realtime: { params: { eventsPerSecond: 5 } }
        });
        realtimeClient.channel('sonna:store-updates', {
          config: { broadcast: { self: false }, private: false }
        }).on('broadcast', { event: 'store_changed' }, function () {
          refreshLiveState();
        }).subscribe(function (status, error) {
          if (status === 'SUBSCRIBED') {
            console.info('[SONNA] Supabase Realtime store updates connected.');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[SONNA] Supabase Realtime unavailable; polling fallback remains active.', error || status);
          }
        });
      } catch (error) {
        console.error('[SONNA] Could not initialize Supabase Realtime; polling fallback remains active.', error);
      }
    };
    script.onerror = function () {
      console.error('[SONNA] Could not load Supabase Realtime client; polling fallback remains active.');
    };
    document.head.appendChild(script);
  }
  window.SONNA_STORE = {
    get: function (k, d) { return MEM[k] !== undefined ? MEM[k] : d; },
    set: function (k, v) {
      MEM[k] = v;
      clearTimeout(timers[k]);
      timers[k] = setTimeout(function () {
        delete timers[k];
        persistStoreValue(k, v);
      }, 150);
      return true;
    },
    flush: flushStoreValue
  };

  var navBox = document.getElementById('nav'), f = document.getElementById('f'), lg = document.getElementById('login');
  var app = document.getElementById('app'), html = document.documentElement;

  function setAuthed(v) {
    authed = v; window.SONNA_ADMIN = v;
    document.body.classList.toggle('authed', v);
  }

  // Theme sáng / đỏ sẫm cho khu quản trị; không chọn thì theo hệ điều hành.
  var THEME_KEY = 'sonna-admin-theme';
  function savedTheme() { try { return localStorage.getItem(THEME_KEY) || ''; } catch (e) { return ''; } }
  function applyTheme(t) {
    if (t) html.dataset.theme = t; else delete html.dataset.theme;
    var d = f.contentDocument && f.contentDocument.documentElement;
    if (d) { if (t) d.dataset.theme = t; else delete d.dataset.theme; }
  }
  applyTheme(savedTheme());
  document.getElementById('themeBtn').onclick = function () {
    var dark = html.dataset.theme ? html.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    var t = dark ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    applyTheme(t);
  };
  document.getElementById('menuBtn').onclick = document.getElementById('scrim').onclick = function () { app.classList.toggle('open'); };
  document.getElementById('miniBtn').onclick = function () { app.classList.toggle('mini'); };
  document.getElementById('resetData').onclick = function () {
    if (!authed) { pending = cur; showLogin(); return; }
    if (!confirm('Đặt lại toàn bộ dữ liệu cửa hàng về mẫu? Không thể hoàn tác.')) return;
    api('DELETE', '/api/store').then(function () { MEM = {}; go(cur, ''); });
  };
  document.getElementById('logout').onclick = function () {
    api('POST', '/api/logout').then(function () { setAuthed(false); go('Store', ''); });
  };

  var ICONS = {
    Store: 'M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z',
    AdminDashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
    AdminAccounts: 'M3 5h18v14H3zM3 10h18',
    AdminProducts: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
    AdminOrders: 'M6 7h12l1 13H5zM9 7a3 3 0 016 0',
    AdminPayments: 'M3 6h18v12H3zM3 10h18M7 15h4',
    AdminUsers: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
    AdminPromos: 'M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM7.5 7.5h.01',
    AdminContent: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    AdminRoles: 'M16 11a3 3 0 100-6 3 3 0 000 6zM3 20a7 7 0 0114 0M17 14a5 5 0 014 5',
    AdminFeatures: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6'
  };
  function buildNav() {
    var svgNS = 'http://www.w3.org/2000/svg';
    NAV.filter(function (n) { return n.k.indexOf('Admin') === 0; }).forEach(function (n) {
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'nav'; btn.dataset.k = n.k;
      var svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24');
      var path = document.createElementNS(svgNS, 'path'); path.setAttribute('d', ICONS[n.k] || ICONS.AdminFeatures);
      svg.appendChild(path); btn.appendChild(svg);
      var label = document.createElement('span'); label.textContent = n.label; btn.appendChild(label);
      btn.onclick = function () { app.classList.remove('open'); go(n.k, ''); };
      navBox.appendChild(btn);
    });
  }

  function markNav(k) {
    var admin = authed && k.indexOf('Admin') === 0 && lg.style.display !== 'flex';
    document.body.classList.toggle('adm', admin);
    var n = NAV.filter(function (x) { return x.k === k; })[0];
    document.getElementById('ttl').textContent = n ? n.label : '';
    Array.prototype.forEach.call(navBox.querySelectorAll('button[data-k]'), function (b) {
      var on = b.dataset.k === k;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  function showLogin() {
    f.style.display = 'none'; lg.style.display = 'flex';
    document.body.classList.add('lgn'); markNav(pending);
    document.getElementById('lu').focus();
  }

  function loadPage(k) {
    if (PAGES[k]) return Promise.resolve(PAGES[k]);
    return api('GET', '/api/pages/' + encodeURIComponent(k)).then(function (p) {
      if (p._status === 401) return null;
      if (p._status !== 200) return undefined;
      PAGES[k] = p; return p;
    });
  }

  var RUNTIME = '';
  var mobileFix = '<style>html,body{margin:0;min-height:100%}@media (max-width: 768px) {  body { -webkit-text-size-adjust: 100%; }  .card { padding: 8px !important; gap: 6px !important; }  .card > div:first-child { height: 75px !important; }  .card > div:first-child svg { width: 60px !important; height: 60px !important; }  div[style*="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))"] { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)) !important; gap: 10px !important; }}</style>';
  var storeMobileFix = '<style>@media (max-width: 768px) { .cat-grid { display: none !important; } }</style>';
  // Màu cố định của các trang admin cũ -> biến theme (runtime.js thay khi render).
  var ADMIN_THEME_MAP = {
    '0F1320': 'bg', '171C2B': 'card', '1F2538': 'sf', '252B3C': 'sf', '2B3248': 'line', '454D65': 'line', '343B50': 'line',
    'EAEFFA': 'ink', 'F5EEE9': 'ink', 'FFFFFF': 'ink', 'A3ACC4': 'mut', 'FFB689': 'mut',
    'FF8A1F': 'ac', 'FF7A1A': 'ac', 'FFB14A': 'ac', '1A1206': 'acb', '170E0A': 'acb', '1A0508': 'acb',
    '52C7FF': 'info', '8EDDFF': 'info', '43D9A0': 'ok', 'FFC24B': 'warn',
    'FF6B7A': 'bad', 'FF9AA5': 'bad', '3A1F2B': 'bads', 'C792FF': 'pur',
    $: { "'Barlow Condensed'": "'Be Vietnam Pro'", "'Barlow'": "'Be Vietnam Pro'", 'rgba(20,26,40,0.9)': 'var(--card)' }
  };
  var THEME_VARS = '--bg:#f3f5f7;--card:#fff;--sf:#f1f4f7;--ink:#14202b;--mut:#64748b;--line:#e2e8ee;--ac:#0e7c86;--acs:#e0f2f3;--acb:#fff;--ok:#15803d;--warn:#b45309;--bad:#be123c;--bads:#ffe4ea;--info:#0369a1;--pur:#7e22ce;color-scheme:light';
  var THEME_DARK = '--bg:#2a0808;--card:#3b0e0e;--sf:#4a1414;--ink:#ffd84d;--mut:#d9b04a;--line:#5e1c1c;--ac:#ffc933;--acs:#5b1a12;--acb:#3b0e0e;--ok:#9be8a8;--warn:#ffd84d;--bad:#ff8f84;--bads:#6e1717;--info:#8fd3ff;--pur:#e0b3ff;color-scheme:dark';
  var adminTheme = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"><style>' +
    ':root{' + THEME_VARS + '}' +
    '@media(prefers-color-scheme:dark){:root:not([data-theme=light]){' + THEME_DARK + '}}' +
    ':root[data-theme=dark]{' + THEME_DARK + '}' +
    'html,body{background:var(--bg)!important;color:var(--ink)}' +
    'body,button,input,select,textarea{font-family:"Be Vietnam Pro",system-ui,-apple-system,"Segoe UI",sans-serif}' +
    '#root input::placeholder,#root textarea::placeholder{color:var(--mut);opacity:.8}' +
    '#root h1{font-size:21px!important;font-weight:700!important;letter-spacing:0!important}' +
    '#root h2{font-size:16px!important;font-weight:700!important;letter-spacing:0!important}' +
    '</style>';
  var adminCompact = '<style>' +
    '#root{font-size:14px!important}' +
    '#root [style*="font-size:11px"],#root [style*="font-size: 11px"]{font-size:10px!important}' +
    '#root [style*="font-size:12px"],#root [style*="font-size: 12px"]{font-size:11px!important}' +
    '#root [style*="font-size:13px"],#root [style*="font-size: 13px"]{font-size:12px!important}' +
    '#root [style*="font-size:14px"],#root [style*="font-size: 14px"]{font-size:13px!important}' +
    '#root [style*="font-size:15px"],#root [style*="font-size: 15px"]{font-size:13px!important}' +
    '#root [style*="font-size:16px"],#root [style*="font-size: 16px"]{font-size:14px!important}' +
    '#root [style*="font-size:17px"],#root [style*="font-size: 17px"]{font-size:15px!important}' +
    '#root [style*="font-size:18px"],#root [style*="font-size: 18px"]{font-size:15px!important}' +
    '#root [style*="font-size:20px"],#root [style*="font-size: 20px"]{font-size:17px!important}' +
    '#root [style*="font-size:22px"],#root [style*="font-size: 22px"]{font-size:18px!important}' +
    '#root [style*="font-size:24px"],#root [style*="font-size: 24px"]{font-size:18px!important}' +
    '#root [style*="font-size:26px"],#root [style*="font-size: 26px"]{font-size:20px!important}' +
    '#root [style*="font-size:28px"],#root [style*="font-size: 28px"]{font-size:20px!important}' +
    '#root [style*="font-size:32px"],#root [style*="font-size: 32px"]{font-size:22px!important}' +
    '#root [style*="font-size:36px"],#root [style*="font-size: 36px"]{font-size:24px!important}' +
    '#root [style*="font-size:40px"],#root [style*="font-size: 40px"]{font-size:22px!important}' +
    '#root [style*="font-size:44px"],#root [style*="font-size: 44px"]{font-size:26px!important}' +
    '#root [style*="font-size:48px"],#root [style*="font-size: 48px"]{font-size:28px!important}' +
    '#root .account-category-tab:hover{transform:translateY(-1px);filter:brightness(1.12)}' +
    '#root .account-category-tab:focus-visible{outline:2px solid #FFC24B;outline-offset:2px}' +
    '#root>div>aside{display:none!important}' +
    '#root>div>main{flex:1 1 100%!important;padding:20px 24px!important;gap:16px!important}' +
    '#root>div>main section{padding:16px!important}' +
    '#root>div>div[style*="max-width:1280px"]{padding:28px 24px!important;gap:20px!important}' +
    '#root .sonna-scrollbox{overflow-y:scroll!important;scrollbar-width:thin;scrollbar-color:#FF8A1F #1F2538}' +
    '#root .sonna-scrollbox::-webkit-scrollbar{width:12px}' +
    '#root .sonna-scrollbox::-webkit-scrollbar-track{background:#1F2538;border-radius:8px}' +
    '#root .sonna-scrollbox::-webkit-scrollbar-thumb{background:#FF8A1F;border:2px solid #1F2538;border-radius:8px}' +
    '#root .sonna-scrollbox::-webkit-scrollbar-thumb:hover{background:#FFC24B}' +
    '#root section[aria-labelledby="subs-title"] h2{min-width:0;overflow-wrap:anywhere;line-height:1.2}' +
    '#root .admin-subs-scroll{width:100%;max-width:100%;overflow-x:auto!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch}' +
    '#root .admin-subs-table{width:1000px!important;min-width:1000px!important;table-layout:fixed!important}' +
    '#root .admin-subs-table th:first-child,#root .admin-subs-table td:first-child{position:sticky!important;left:0;z-index:2;width:220px!important;min-width:220px!important;max-width:220px!important;box-sizing:border-box;background:#171C2B}' +
    '#root .admin-subs-table th:first-child{z-index:4;white-space:normal;word-break:normal;overflow-wrap:normal}' +
    '#root .admin-subs-table td:first-child input{display:block;width:100%!important;max-width:100%;min-width:0!important;box-sizing:border-box;min-height:44px!important;padding:0 10px!important;font-size:16px!important}' +
    '#root .admin-subs-images{display:flex;flex-wrap:wrap;align-items:center;gap:8px;max-width:100%}' +
    '#root .admin-subs-images input[type="url"]{max-width:100%;box-sizing:border-box}' +
    '@media(max-width:768px){#root .admin-subs-scroll{width:100%!important}#root .admin-subs-table{width:1000px!important;min-width:1000px!important}#root .admin-subs-table col:first-child{width:110px!important}#root .admin-subs-table col:nth-child(5){width:355px!important}#root .admin-subs-table th:first-child,#root .admin-subs-table td:first-child{width:110px!important;min-width:110px!important;max-width:110px!important}}' +
    '@media(max-width:768px){#root>div>main{padding:16px!important}#root>div>div[style*="max-width:1280px"]{padding:20px 16px!important}}' +
    '</style>';

  function go(k, hash) {
    if (!/^[A-Za-z0-9_]+$/.test(k) || !NAV.some(function (n) { return n.k === k; })) k = 'Store';
    if (k.indexOf('Admin') === 0 && !authed) { pending = k; cur = k; history.replaceState(null, '', '#' + k); showLogin(); return; }
    var ready = k === 'Store' ? refreshStore() : Promise.resolve();
    ready.then(function (ok) {
      if (ok === null) return null;
      return loadPage(k);
    }).then(function (p) {
      if (p === null && authed) return;
      if (p === null) { setAuthed(false); pending = k; showLogin(); return; }
      if (!p) return go('Store', '');
      lg.style.display = 'none'; f.style.display = 'block'; document.body.classList.remove('lgn'); cur = k; markNav(k);
      document.title = 'SONNA - ' + p.title;
      var isAdmin = k.indexOf('Admin') === 0, theme = isAdmin && html.dataset.theme ? ' data-theme="' + html.dataset.theme + '"' : '';
      var page = Object.assign({}, p, { hash: hash || '' }, isAdmin ? { theme: ADMIN_THEME_MAP } : {});
      // adminTheme đặt sau helmet để font/màu nền mới thắng style gốc của trang.
      f.srcdoc = '<!doctype html><html lang="vi"' + theme + '><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        mobileFix + (isAdmin ? adminCompact : '') + p.helmet + (isAdmin ? adminTheme : '') + (k === 'Store' ? storeMobileFix : '') + '</head><body><div id="root"></div><script>window.__PAGE=' +
        JSON.stringify(page).replace(/<\//g, '<\\/') + ';<\/script><script>' + RUNTIME + '<\/script></body></html>';
      if (location.hash !== '#' + k) history.replaceState(null, '', '#' + k);
    });
  }

  document.getElementById('lf').addEventListener('submit', function (e) {
    e.preventDefault();
    var u = document.getElementById('lu').value.trim(), p = document.getElementById('lp').value, err = document.getElementById('le');
    if (!u || !p) { err.textContent = 'Nhập tên đăng nhập và mật khẩu.'; return; }
    api('POST', '/api/login', { username: u, password: p }).then(function (r) {
      if (r._status !== 200) { err.textContent = r.error || 'Đăng nhập thất bại.'; return; }
      err.textContent = ''; document.getElementById('lp').value = '';
      setAuthed(true);
      var destination = pending.indexOf('Admin') === 0 ? pending : 'AdminDashboard';
      pending = destination;
      api('GET', '/api/store').then(function (s) { MEM = s.data || MEM; go(destination, ''); });
    });
  });
  window.addEventListener('message', function (e) { if (e.data && e.data.go) go(e.data.go, e.data.hash); });
  window.addEventListener('hashchange', function () { go(location.hash.slice(1), ''); });
  window.setInterval(refreshLiveState, 10000);

  Promise.all([
    api('GET', '/api/session'),
    fetch('/runtime.js').then(function (r) { return r.text(); })
  ]).then(function (res) {
    var s = res[0]; RUNTIME = res[1]; NAV = s.nav || [];
    setupSupabaseRealtime(s.realtime);
    buildNav();
    hydrateStore(s).then(function (ok) {
      if (!ok) { pending = location.hash.slice(1) || 'Store'; showLogin(); return; }
      go(location.hash.slice(1) || 'Store', '');
    });
  });
})();
