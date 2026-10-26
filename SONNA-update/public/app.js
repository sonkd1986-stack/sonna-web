(function () {
  var MEM = {}, authed = false, pending = 'Store', cur = 'Store', NAV = [], PAGES = {};
  var timers = {}, storeWrites = {};

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

  // Store đồng bộ trong bộ nhớ, ghi nền lên máy chủ (data/store.json)
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
    window.SONNA_CONFIG = { payment: s.payment || {}, simTopup: !!s.simTopup };
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
  var loginChoice = document.getElementById('login-choice');
  document.getElementById('login-choice-open').addEventListener('click', function () { loginChoice.showModal(); });
  document.getElementById('login-choice-close').addEventListener('click', function () { loginChoice.close(); });
  Array.prototype.forEach.call(loginChoice.querySelectorAll('a'), function (link) {
    link.addEventListener('click', function () { loginChoice.close(); });
  });
  loginChoice.addEventListener('click', function (event) { if (event.target === loginChoice) loginChoice.close(); });

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
    note.textContent = 'Node.js · dữ liệu lưu trong data/store.json'; bar.appendChild(note);
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

  Promise.all([
    api('GET', '/api/session'),
    fetch('/runtime.js').then(function (r) { return r.text(); })
  ]).then(function (res) {
    var s = res[0]; RUNTIME = res[1]; NAV = s.nav || [];
    buildBar();
    hydrateStore(s).then(function (ok) {
      if (!ok) { pending = location.hash.slice(1) || 'Store'; showLogin(); return; }
      if (authed) lo.style.display = '';
      go(location.hash.slice(1) || 'Store', '');
    });
  });
})();
