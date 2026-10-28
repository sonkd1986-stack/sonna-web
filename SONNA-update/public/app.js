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
    authed = !!s.authed;
    window.SONNA_ADMIN = authed;
    if (bar) bar.style.display = authed ? 'flex' : 'none';
    if (lo) lo.style.display = authed ? '' : 'none';
    if (!authed) {
      MEM = s.store || {};
      return Promise.resolve(true);
    }
    return api('GET', '/api/store').then(function (privateStore) {
      if (privateStore._status !== 200 || !privateStore.data || !privateStore.data.acc) {
        console.error('[SONNA] Không tải được kho dữ liệu quản trị:', privateStore.error || privateStore._status);
        alert('Không tải được dữ liệu quản trị. Hãy đăng nhập lại trước khi tiếp tục.');
        authed = false;
        if (lo) lo.style.display = 'none';
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

  var bar = document.getElementById('bar'), f = document.getElementById('f'), lg = document.getElementById('login');
  var lo, groups = {};

  function buildBar() {
    NAV.forEach(function (n) {
      if (!groups[n.group]) {
        var g = document.createElement('div'); g.className = 'grp';
        var b = document.createElement('b'); b.textContent = n.group === 'Khách' ? 'CỬA HÀNG' : 'ADMIN';
        g.appendChild(b); bar.appendChild(g); groups[n.group] = g;
      }
      var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = n.label; btn.dataset.k = n.k;
      btn.onclick = function () { go(n.k, ''); };
      groups[n.group].appendChild(btn);
    });
    var rs = document.createElement('button'); rs.id = 'resetData'; rs.type = 'button'; rs.textContent = 'Đặt lại dữ liệu mẫu'; rs.style.marginLeft = 'auto';
    rs.onclick = function () {
      if (!authed) { pending = cur; showLogin(); return; }
      api('DELETE', '/api/store').then(function () { MEM = {}; go(cur, ''); });
    };
    bar.appendChild(rs);
    lo = document.createElement('button'); lo.type = 'button'; lo.textContent = 'Đăng xuất admin'; lo.style.display = 'none';
    lo.onclick = function () {     api('POST', '/api/logout').then(function () { authed = false; window.SONNA_ADMIN = false; bar.style.display = 'none'; lo.style.display = 'none'; go('Store', ''); }); };
    bar.appendChild(lo);
    var note = document.createElement('span'); note.id = 'note'; note.style.marginLeft = '0';
    note.textContent = 'Node.js · dữ liệu lưu trên Supabase'; bar.appendChild(note);
  }

  function markNav(k) {
    bar.dataset.page = k;
    Array.prototype.forEach.call(bar.querySelectorAll('button[data-k]'), function (b) {
      if (b.dataset.k === k) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  function showLogin() {
    f.style.display = 'none'; lg.style.display = 'flex'; markNav(pending);
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
    '#root [style*="font-size:24px"],#root [style*="font-size: 24px"]{font-size:19px!important}' +
    '#root [style*="font-size:26px"],#root [style*="font-size: 26px"]{font-size:21px!important}' +
    '#root [style*="font-size:28px"],#root [style*="font-size: 28px"]{font-size:22px!important}' +
    '#root [style*="font-size:32px"],#root [style*="font-size: 32px"]{font-size:25px!important}' +
    '#root [style*="font-size:36px"],#root [style*="font-size: 36px"]{font-size:26px!important}' +
    '#root [style*="font-size:40px"],#root [style*="font-size: 40px"]{font-size:28px!important}' +
    '#root [style*="font-size:44px"],#root [style*="font-size: 44px"]{font-size:30px!important}' +
    '#root [style*="font-size:48px"],#root [style*="font-size: 48px"]{font-size:32px!important}' +
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
    '@media(max-width:768px){#root>div>aside{display:none!important}#root>div>main{padding:14px 12px!important;gap:12px!important}#root>div>main section{padding:12px!important}#root>div>div[style*="max-width:1280px"]{padding:18px 12px!important;gap:12px!important}#root .account-category-tab{min-height:42px;padding:6px 10px;gap:6px}#root .account-category-tab > span:nth-child(2){max-width:100%;overflow-wrap:anywhere}#root .account-category-tab > span:nth-child(3){min-width:22px;padding:1px 6px;font-size:11px}#root .admin-subs-scroll{width:100%!important;max-height:420px!important}#root .admin-subs-table{width:1000px!important;min-width:1000px!important}#root .admin-subs-table col:first-child{width:110px!important}#root .admin-subs-table col:nth-child(5){width:355px!important}#root .admin-subs-table th:first-child,#root .admin-subs-table td:first-child{width:110px!important;min-width:110px!important;max-width:110px!important}#root .admin-subs-table th,#root .admin-subs-table td{padding:8px 6px!important;font-size:12px!important}}' +
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
      if (p === null) { authed = false; lo.style.display = 'none'; pending = k; showLogin(); return; }
      if (!p) return go('Store', '');
      lg.style.display = 'none'; f.style.display = 'block'; cur = k; markNav(k);
      document.title = 'SONNA - ' + p.title;
      var page = Object.assign({}, p, { hash: hash || '' });
      f.srcdoc = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        mobileFix + (k.indexOf('Admin') === 0 ? adminCompact : '') + p.helmet + (k === 'Store' ? storeMobileFix : '') + '</head><body><div id="root"></div><script>window.__PAGE=' +
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
      authed = true; window.SONNA_ADMIN = true; bar.style.display = 'flex'; lo.style.display = '';
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
    buildBar();
    hydrateStore(s).then(function (ok) {
      if (!ok) { pending = location.hash.slice(1) || 'Store'; showLogin(); return; }
      if (authed) lo.style.display = '';
      go(location.hash.slice(1) || 'Store', '');
    });
  });
})();
