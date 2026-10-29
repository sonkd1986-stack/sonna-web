'use strict';
// SONNA Admin: lõi (API, định tuyến, bảng, hộp thoại), Tổng quan và Tài khoản.
// Các trang còn lại nằm trong admin-views.js và dùng chung các hàm ở đây.

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = x => parseInt(String(x == null ? '' : x).replace(/\D/g, ''), 10) || 0;
const dots = n => String(Math.trunc(Math.abs(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmt = n => (Number(n) < 0 ? '-' : '') + dots(n) + 'đ';
const fm = n => dots(n) + '₫'; // định dạng giá lưu trong kho acc (giống trang cũ)
const clone = o => JSON.parse(JSON.stringify(o == null ? null : o));
const dt = s => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? String(s) : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
};
const pill = (c, t) => `<span class="pill ${c}">${esc(t)}</span>`;
const btn = (a, id, html, c = '', dis = false) => `<button type="button" class="lk ${c}" data-a="${a}" data-id="${esc(id)}" ${dis ? 'disabled' : ''}>${html}</button>`;
const fld = (id, l, v = '', t = 'text', extra = '') => `<label>${l}<input class="in" id="${id}" type="${t}" value="${esc(v)}" ${extra}></label>`;
const area = (id, l, v = '', rows = 5, extra = '') => `<label>${l}<textarea class="in" id="${id}" rows="${rows}" ${extra}>${esc(v)}</textarea></label>`;
const selBox = (id, l, opts, v) => `<label>${l}<select class="in" id="${id}">${opts.map(([k, t]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
const val = id => { const e = $('#' + id); return e ? e.value.trim() : ''; };
const chk = id => { const e = $('#' + id); return !!(e && e.checked); };
const none = t => `<div class="em">${esc(t)}</div>`;
const lr = (a, b) => `<div class="lr"><span>${a}</span><span>${b}</span></div>`;
const remoteUrl = v => { try { const u = new URL(String(v || '').trim()); return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password ? u.href : ''; } catch (e) { return ''; } };
const rpw = () => [...crypto.getRandomValues(new Uint8Array(10))].map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

// ---------- API ----------
async function api(method, url, body) {
  let r;
  try {
    r = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { return { _status: 0, error: 'Lỗi kết nối máy chủ.' }; }
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (!j || typeof j !== 'object') j = {};
  j._status = r.status;
  if (r.status === 401 && url !== '/api/login') showLogin();
  return j;
}
async function must(method, url, body) {
  const j = await api(method, url, body);
  if (j._status < 200 || j._status >= 300) throw new Error(j.error || ('Máy chủ báo lỗi (mã ' + j._status + ').'));
  return j;
}

const D = { store: null, dash: null, users: null, orders: null, deposits: null, ctvs: null, session: null, products: null };
async function loadStore() { D.store = (await must('GET', '/api/store')).data || {}; return D.store; }
async function loadUsers() { D.users = (await must('GET', '/api/admin/users')).users || []; return D.users; }
// Ghi một khóa cấu hình: luôn đọc bản mới nhất trên máy chủ rồi mới sửa, tránh đè dữ liệu do đơn hàng vừa ghi.
async function saveKey(k, fn) {
  const s = await loadStore();
  const v = fn(clone(s[k]));
  if (v === false) return false;
  await must('PUT', '/api/store/' + k, { value: v });
  s[k] = v;
  return true;
}
const isCtv = () => !!(D.session && D.session.role === 'ctv');
const uname = id => { const u = (D.users || []).find(x => String(x.id) === String(id)); return u ? u.username : (id ? '#' + id : ''); };

// ---------- Kho acc: cùng cấu trúc dữ liệu với trang cũ ----------
const OK = '#43D9A0', OFF = '#A3ACC4';
const LOCKED = ['Đã bán', 'Đã đặt giữ', 'Đã tặng'];
const SELLING = ['Đang bán', 'Đã ẩn', 'Chờ kiểm tra', 'Nháp'];
const BASE_CATS = [
  { id: 'reroll-ios', label: 'Acc Reroll iOS', col: '#52C7FF', plat: 'iOS', code: 'RI' },
  { id: 'reroll-android', label: 'Acc Reroll Android', col: '#43D9A0', plat: 'Android', code: 'RA' },
  { id: 'char-ios', label: 'Acc Character + Chrono iOS', col: '#FFC24B', plat: 'iOS', code: 'CI' },
  { id: 'char-android', label: 'Acc Character + Chrono Android', col: '#FF8A1F', plat: 'Android', code: 'CA' },
  { id: 'team-meta', label: 'Team Meta', col: '#FF6B7A', plat: '', code: 'TM' },
  { id: 'promo', label: 'Acc Khuyến Mãi', col: '#C792FF', plat: '', code: 'KM' }
];
const DEFAULT_SUBS = {
  'reroll-ios': [{ id: 'ria', title: '50.000-60.000 cc iOS', price: '350.000' }, { id: 'rib', title: '60.000-70.000 cc iOS', price: '420.000' }, { id: 'ric', title: '70.000-80.000 cc iOS', price: '500.000' }],
  'reroll-android': [{ id: 'raa', title: '50.000-60.000 cc Android', price: '330.000' }, { id: 'rab', title: '60.000-70.000 cc Android', price: '400.000' }, { id: 'rac', title: '70.000-80.000 cc Android', price: '480.000' }],
  'promo': [{ id: 'pa', title: '50.000-60.000 cc iOS', price: '' }, { id: 'pb', title: '60.000-70.000 cc iOS', price: '' }, { id: 'pc', title: '50.000-60.000 cc Android', price: '' }, { id: 'pd', title: '60.000-70.000 cc Android', price: '' }]
};

function normAcc(a) {
  a = a && typeof a === 'object' ? a : {};
  const added = (Array.isArray(a.added) ? a.added : []).filter(x => x && x.id != null);
  const addedIds = new Set(added.map(x => String(x.id)));
  const seen = new Set();
  // GET /api/store trả listed đã gộp cả mục con (added); bỏ các bản ghi mục con và bản trùng trước khi ghi lại.
  const listed = (Array.isArray(a.listed) ? a.listed : []).filter(x => {
    if (!x || x.id == null) return false;
    const id = String(x.id);
    if (addedIds.has(id) && !x.tk) return false;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { ...a, listed, added, ov: a.ov || {}, edits: a.edits || {}, subPics: a.subPics || {}, accPics: a.accPics || {}, delSubs: a.delSubs || {}, rulesData: Array.isArray(a.rulesData) ? a.rulesData : [] };
}
const hasCred = r => String(r.tk || '').trim() && String(r.mk || '').trim();
function model(acc, catalog) {
  catalog = catalog || {};
  const customCats = (catalog.categories || []).filter(c => c && c.id && c.name);
  const cats = BASE_CATS.map(c => ({ ...c })).concat(customCats.map(c => ({ id: c.id, label: c.name, col: c.color || '#5B1F7A', plat: c.platform || '', code: c.code || 'CUS', custom: true })));
  const byId = Object.fromEntries(cats.map(c => [c.id, c]));
  const addedIds = new Set(acc.added.map(x => String(x.id)));
  const SUBS = {};
  Object.keys(DEFAULT_SUBS).forEach(catId => {
    const seen = new Set();
    const uniq = items => items.filter(x => { const id = String(x && x.id || ''); if (!id || addedIds.has(id) || seen.has(id)) return false; seen.add(id); return true; });
    const live = catId === 'promo'
      ? uniq(Array.isArray(catalog.giftSubs) ? catalog.giftSubs : []).map(x => ({ id: x.id, title: x.title, price: '' }))
      : uniq((Array.isArray(catalog.subs) ? catalog.subs : []).filter(x => x.cat === catId)).map(x => ({ id: x.id, title: x.title, price: Number(x.price) > 0 ? dots(Number(x.price)) : '' }));
    SUBS[catId] = catId === 'promo' ? live : (live.length ? live : DEFAULT_SUBS[catId]);
  });
  const v = (id, k, d) => acc.edits[id + ':' + k] !== undefined ? acc.edits[id + ':' + k] : d;
  const merged = acc.listed.map(r => ({ ...r, ...(acc.ov[r.id] || {}) }));
  const subsOf = catId => (SUBS[catId] || []).map(s => ({ ...s }))
    .concat(acc.added.filter(a => a.cat === catId).map(a => ({ id: a.id, title: '', price: '' })))
    .filter(s => !acc.delSubs[s.id])
    .map(s => {
      const rows = merged.filter(r => r.cat === catId && r.sub === s.id && !r.del && hasCred(r));
      return {
        id: s.id, cat: catId, title: v(s.id, 't', s.title) || '', price: v(s.id, 'p', s.price) || '',
        stock: rows.filter(r => catId === 'promo' ? r.status === 'Trong kho' : SELLING.includes(r.status)).length,
        given: catId === 'promo' ? rows.filter(r => r.status === 'Đã tặng').length : 0,
        pics: acc.subPics[s.id] || []
      };
    });
  const subById = {};
  cats.forEach(c => subsOf(c.id).forEach(s => { subById[s.id] = s; }));
  return { cats, byId, subsOf, subById, val: v, merged, customCats };
}
const ruleActive = r => {
  const now = new Date();
  return !r.paused && !(r.until && new Date(r.until + 'T23:59:59') < now) && !(r.from && new Date(r.from + 'T00:00:00') > now);
};
// Catalog mà cửa hàng đọc: tính lại y như trang Quản lý acc cũ.
function buildCatalog(acc, catalog) {
  const M = model(acc, catalog);
  const active = acc.rulesData.filter(ruleActive);
  const offerFor = x => active.filter(r => (r.buySubId && r.buySubId === x.id) || (!r.buySubId && r.buySub === x.title)).sort((a, b) => num(b.buy) - num(a.buy) || num(b.give) - num(a.give))[0];
  return {
    ...(catalog || {}),
    categories: M.customCats.map(c => ({ ...c })),
    giftSubs: M.subsOf('promo').map(x => ({ id: x.id, title: x.title })),
    subs: M.cats.filter(c => c.id !== 'promo').flatMap(c => M.subsOf(c.id).map(x => {
      const rule = offerFor(x);
      return { id: x.id, cat: c.id, title: x.title, price: num(x.price), gift: !!rule, giftOffer: rule ? { buy: num(rule.buy), give: num(rule.give) } : null };
    })),
    accts: M.merged.filter(r => !r.del && r.cat !== 'promo').map(r => ({ id: r.id, cat: r.cat, sub: r.sub, status: r.status, title: r.title || '', info: r.info || '', price: num(r.price), cost: num(r.cost), level: r.level, chrono: r.chrono, chars: r.chars }))
  };
}
// Mọi thay đổi kho acc đi qua đây: tải bản mới nhất, sửa, ghi acc rồi ghi catalog.
async function mutateAcc(fn) {
  const s = await loadStore();
  const acc = normAcc(s.acc);
  const catalog = clone(s.catalog || {}) || {};
  const r = fn(acc, catalog, model(acc, catalog));
  if (r === false) return false;
  const resp = await must('PUT', '/api/store/acc', { value: acc });
  if (isCtv()) {
    // CTV không thấy acc của người khác nên chỉ máy chủ biết tk nào trùng; lấy lại kho thật và báo số acc bị bỏ qua.
    await loadStore();
    const skipped = Number(resp.skipped) || 0;
    if (skipped) {
      toast('Máy chủ bỏ qua ' + skipped + ' acc: trùng tk với acc đã có trong kho hoặc trạng thái không hợp lệ.', true);
      if (r && typeof r === 'object' && typeof r.ok === 'number') { r.ok = Math.max(0, r.ok - skipped); r.skip = (r.skip || 0) + skipped; }
      if (r && typeof r === 'object' && typeof r.a === 'number') r.a = Math.max(0, r.a - skipped);
    }
    return r === undefined ? true : r; // catalog do admin quản lý
  }
  const cat = buildCatalog(acc, catalog);
  await must('PUT', '/api/store/catalog', { value: cat });
  s.acc = acc; s.catalog = cat;
  return r === undefined ? true : r;
}
function accCtx() {
  const s = D.store || {};
  const acc = normAcc(s.acc);
  const catalog = s.catalog || {};
  return { acc, catalog, M: model(acc, catalog) };
}
function patchOv(acc, M, id, p, allowLocked) {
  const r = M.merged.find(x => x.id === id);
  if (!r || (!allowLocked && LOCKED.includes(r.status))) return false;
  acc.ov[id] = { ...(acc.ov[id] || {}), ...p };
  return true;
}
function newIds(acc, M, code, n) {
  const used = new Set(acc.listed.map(x => String(x.id).toLowerCase()).concat(acc.added.map(x => String(x.id).toLowerCase())));
  let k = 5000 + M.merged.length;
  const out = [];
  while (out.length < n) { k++; const id = code + '-' + k; if (!used.has(id.toLowerCase())) { used.add(id.toLowerCase()); out.push(id); } }
  return out;
}
// Thêm acc mới (giống mkRow của trang cũ). o: {cat, sub, status, price, cost, lv, ch, tn, pics}
function addRows(acc, M, o, items) {
  const fc = M.byId[o.cat];
  if (!fc) throw new Error('Danh mục không tồn tại.');
  const sp = M.subsOf(o.cat).find(x => x.id === o.sub);
  const active = new Set(M.merged.filter(r => !r.del).map(r => String(r.tk).toLowerCase()));
  const seen = new Set();
  const good = items.filter(it => {
    const k = String(it.tk || '').toLowerCase();
    if (!it.tk || !it.mk || active.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const ids = newIds(acc, M, fc.code, good.length);
  const isChar = fc.code === 'CI' || fc.code === 'CA';
  const info = isChar ? 'Cấp ' + (o.lv || '?') + ' · ' + (o.ch || '?') + ' nhân vật'
    : (fc.custom ? (o.tn || fc.label) : (fc.code === 'TM' ? (o.tn || 'Team meta') : ((sp && sp.title) || fc.label)) + ' · Bandai Namco ID');
  good.forEach((it, i) => {
    const p = it.price != null ? it.price : num(o.price);
    acc.listed.push({
      cat: o.cat, sub: sp ? sp.id : '', id: ids[i], tk: it.tk, mk: it.mk, info,
      price: fc.code === 'KM' ? 'Không bán lẻ' : (p ? fm(p) : (sp && sp.price ? sp.price + '₫' : 'Chưa đặt giá')),
      cost: num(o.cost) ? fm(num(o.cost)) : '—', status: o.status, col: o.status === 'Nháp' ? OFF : OK,
      level: o.lv || '', chrono: '', chars: o.ch || '', listedAt: new Date().toLocaleString('vi-VN')
    });
    if (o.pics && o.pics.length) acc.accPics[ids[i]] = o.pics.slice(0, 5);
  });
  return { ok: good.length, skip: items.length - good.length };
}

// ---------- Ảnh ----------
function uploadImages(files, max = 1000) {
  return Promise.all([...files].map(f => new Promise(res => {
    if (!/^image\//.test(f.type)) return res({ err: f.name + ' không phải ảnh' });
    if (f.size > 8e6) return res({ err: f.name + ' quá 8MB' });
    const rd = new FileReader();
    rd.onerror = () => res({ err: 'Không đọc được ' + f.name });
    rd.onload = () => {
      const send = dataUrl => api('POST', '/api/admin/upload', { dataUrl }).then(r => res(r.url ? { url: r.url } : { err: r.error || 'Tải ảnh lên thất bại', dataUrl }));
      if (/gif|webp/i.test(f.type)) return send(rd.result);
      const im = new Image();
      im.onerror = () => res({ err: 'Ảnh ' + f.name + ' bị lỗi' });
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        send(cv.toDataURL('image/jpeg', 0.85));
      };
      im.src = rd.result;
    };
    rd.readAsDataURL(f);
  })));
}

// ---------- Giao diện chung ----------
const S = { v: 'dash', tab: 'all', q: '', sk: '', sd: 1, pg: 1, sel: new Set(), rows: [], cat: '', sub: '', wt: 'banner', lp: null };
const L = [];
const IC = {
  dash: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z', acc: 'M3 5h18v14H3zM3 10h18', users: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  deposits: 'M12 5v14M5 12h14', orders: 'M6 7h12l1 13H5zM9 7a3 3 0 016 0', promo: 'M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM7.5 7.5h.01',
  ctv: 'M16 11a3 3 0 100-6 3 3 0 000 6zM3 20a7 7 0 0114 0M17 14a5 5 0 014 5', web: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  products: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8', set: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6'
};
const NAV_CTV = [['acc', 'Acc của tôi'], ['rev', 'Doanh thu']];
const NAV = [['dash', 'Tổng quan'], ['acc', 'Tài khoản'], ['users', 'Người dùng'], ['deposits', 'Nạp tiền'], ['orders', 'Đơn hàng'], ['promo', 'Khuyến mãi'], ['ctv', 'CTV'], ['web', 'Nội dung web'], ['products', 'Sản phẩm'], ['set', 'Cài đặt']];
const VIEW = {}, LOAD = {}, A = {};
const STC = { 'Đang bán': 'ok', 'Trong kho': 'ok', 'Đã bán': 'mut', 'Đã tặng': 'pur', 'Đã đặt giữ': 'warn', 'Đã ẩn': 'mut', 'Chờ kiểm tra': 'info', 'Nháp': 'mut', 'Hoạt động': 'ok', 'Bị khóa': 'bad', 'Hoàn tất': 'ok', 'Đã thanh toán': 'info', 'Đang bàn giao': 'warn', 'Đã hoàn tiền': 'mut' };
const sp = t => pill(STC[t] || 'mut', t || '—');

function toast(m, bad) {
  const e = document.createElement('div');
  e.className = 'ti' + (bad ? ' bad' : '');
  e.textContent = m;
  $('#toast').append(e);
  setTimeout(() => e.remove(), bad ? 5000 : 2800);
}
function log(m) { L.unshift({ m, t: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) }); toast(m); }
const fail = e => { console.error('[SONNA admin]', e); toast(e && e.message ? e.message : 'Có lỗi xảy ra.', true); };

// Hộp thoại: onSave trả false để giữ hộp thoại mở; có thể là hàm async.
let SV = null, SAVING = false;
function openM(title, html, onSave, ok = 'Lưu', wide = false) {
  $('#dt').textContent = title;
  $('#db').innerHTML = html;
  $('#ok').textContent = ok;
  $('#ok').hidden = !onSave;
  $('#cancel').textContent = onSave ? 'Hủy' : 'Đóng';
  $('#dlg').classList.toggle('wide', !!wide);
  SV = onSave;
  if (!$('#dlg').open) $('#dlg').showModal();
  const f = $('#db input:not([type=checkbox]):not([type=file]),#db textarea,#db select');
  if (f) f.focus();
}
const closeM = () => { if (!SAVING) $('#dlg').close(); };
const ask = (msg, fn, ok = 'Đồng ý') => openM('Xác nhận', `<p style="margin:0">${msg}</p>`, fn, ok);
$('#df').addEventListener('submit', async e => {
  e.preventDefault();
  if (!SV || SAVING) return;
  SAVING = true; $('#ok').disabled = true;
  let r;
  try { r = await SV(); } catch (err) { fail(err); r = false; }
  SAVING = false; $('#ok').disabled = false;
  if (r !== false && $('#dlg').open) $('#dlg').close();
});

const loadingHTML = '<div class="card em">Đang tải dữ liệu...</div>';
function renderNav() {
  const { M } = D.store ? accCtx() : { M: null };
  const trash = M ? M.merged.filter(r => r.del && hasCred(r)).length : 0;
  $('#nav').innerHTML = (isCtv() ? NAV_CTV : NAV).map(([k, l]) => `<button type="button" class="nav ${S.v === k ? 'on' : ''}" data-a="go" data-id="${k}"><svg viewBox="0 0 24 24"><path d="${IC[k]}"/></svg><span>${l}</span>${k === 'acc' && trash ? `<b class="bd">${trash}</b>` : ''}</button>`).join('');
}
function render() {
  renderNav();
  try { $('#main').innerHTML = VIEW[S.v](); }
  catch (e) { console.error(e); $('#main').innerHTML = `<div class="card em">Không hiển thị được trang này: ${esc(e.message)}</div>`; }
}
async function go(v) {
  if (isCtv() ? !NAV_CTV.some(n => n[0] === v) : !VIEW[v] || v === 'rev') v = isCtv() ? 'acc' : 'dash';
  Object.assign(S, { v, tab: 'all', pg: 1, sk: '', sd: 1, q: '', lp: null });
  S.sel.clear();
  $('#gq').value = '';
  if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
  $('#app').classList.remove('open');
  renderNav();
  $('#main').innerHTML = loadingHTML;
  await refresh(true);
}
async function refresh(showErr) {
  const v = S.v;
  try { if (LOAD[v]) await LOAD[v](); }
  catch (e) {
    if (S.v !== v) return;
    if (showErr) $('#main').innerHTML = `<div class="card em">${esc(e.message)}<p><button class="btn" data-a="refresh">Thử lại</button></p></div>`;
    else fail(e);
    return;
  }
  if (S.v === v) render();
}
const tabsHTML = (list, cur, action = 'tab') => `<div class="tabs">${list.map(([k, l, n]) => `<button type="button" class="tab ${cur === k ? 'on' : ''}" data-a="${action}" data-id="${esc(k)}">${l}${n != null ? `<b>${n}</b>` : ''}</button>`).join('')}</div>`;
const matchQ = (x, fields) => { const q = S.q.trim().toLowerCase(); return !q || fields.some(f => String(x[f] == null ? '' : x[f]).toLowerCase().includes(q)); };
// Bảng có sắp xếp, phân trang, ô chọn. cols: [khóa, tiêu đề, hiển thị?, giá trị sắp xếp?]
function grid(rows, cols, opt = {}) {
  const key = opt.key || 'id';
  let list = rows;
  if (S.sk) {
    const c = cols.find(c => c[0] === S.sk);
    const sv = c && c[3] ? c[3] : (x => x[S.sk]);
    list = [...rows].sort((a, b) => { const x = sv(a), y = sv(b); return (x > y ? 1 : x < y ? -1 : 0) * S.sd; });
  }
  S.rows = list;
  const per = opt.per || 20, pages = Math.max(1, Math.ceil(list.length / per));
  S.pg = Math.min(Math.max(1, S.pg), pages);
  const pr = list.slice((S.pg - 1) * per, S.pg * per);
  const ids = pr.map(x => String(x[key]));
  const allOn = ids.length && ids.every(i => S.sel.has(i));
  const th = (opt.check ? `<th class="ns"><input type="checkbox" data-c="all" aria-label="Chọn tất cả" ${allOn ? 'checked' : ''}></th>` : '')
    + cols.map(([k, l]) => `<th data-a="sort" data-id="${k}">${l}${S.sk === k ? (S.sd > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('') + (opt.acts ? '<th class="ns"></th>' : '');
  const body = pr.map(x => `<tr>${opt.check ? `<td><input type="checkbox" data-c="row" value="${esc(x[key])}" aria-label="Chọn" ${S.sel.has(String(x[key])) ? 'checked' : ''}></td>` : ''}${cols.map(([k, , f]) => `<td>${f ? f(x) : esc(x[k])}</td>`).join('')}${opt.acts ? `<td style="text-align:right">${opt.acts(x)}</td>` : ''}</tr>`).join('');
  return `<div class="card" style="padding:4px 8px"><div class="tw"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>${pr.length ? '' : none(opt.empty || 'Không có dữ liệu phù hợp.')}</div>
<div class="pgr">${list.length} kết quả · Trang ${S.pg}/${pages}<button class="btn" data-a="pgp" ${S.pg < 2 ? 'disabled' : ''}>Trước</button><button class="btn" data-a="pgn" ${S.pg >= pages ? 'disabled' : ''}>Sau</button></div>`;
}
const cpy = t => navigator.clipboard.writeText(t).then(() => toast('Đã sao chép'), () => toast('Trình duyệt chặn sao chép, hãy bôi đen rồi nhấn Ctrl+C', true));
const shortMoney = v => v >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + 'tr' : Math.round(v / 1e3) + 'k';
function barChart(values, labels) {
  const m = Math.max(1, ...values);
  return `<svg viewBox="0 0 300 140" width="100%" role="img" aria-label="Biểu đồ doanh thu">${values.map((x, i) => {
    const h = Math.round(x / m * 90), c = i * 42 + 22;
    return `<rect x="${c - 14}" y="${112 - h}" width="28" height="${Math.max(h, 1)}" rx="6" fill="${i === values.length - 1 ? 'var(--ac)' : 'var(--acs)'}"/><text x="${c}" y="${106 - h}" text-anchor="middle" font-size="10" fill="var(--ink)">${x ? shortMoney(x) : ''}</text><text x="${c}" y="130" text-anchor="middle" font-size="10" fill="var(--mut)">${esc(labels[i])}</text>`;
  }).join('')}</svg>`;
}

// ---------- Tổng quan ----------
LOAD.dash = async () => { const [d] = await Promise.all([must('GET', '/api/admin/dashboard'), loadStore()]); D.dash = d; };
VIEW.dash = () => {
  const d = D.dash || {}, { M } = accCtx();
  const trash = M.merged.filter(r => r.del && hasCred(r)).length;
  const days = Array.isArray(d.days) ? d.days : [];
  const today = d.today || {}, month = d.month || {};
  const K = [
    ['Doanh thu hôm nay', fmt(today.revenue), (today.count || 0) + ' đơn'],
    ['Doanh thu tháng này', fmt(month.revenue), (month.count || 0) + ' đơn'],
    ['Acc đang bán', d.stock || 0, 'Có đủ TK|MK'],
    ['Tổng đơn hàng', d.orders || 0, 'Từ trước đến nay'],
    ['Khách hàng', d.users || 0, 'Tài khoản đã đăng ký'],
    ['Nạp tiền chưa khớp', d.unmatchedDeposits || 0, 'Cần kiểm tra nội dung CK']
  ];
  const recent = (d.recentOrders || []).slice(0, 8);
  return `<div class="hd"><h1>Tổng quan</h1><span class="sp"></span><button class="btn p" data-a="go" data-id="acc">+ Đăng acc</button></div>
${trash ? `<div class="alert"><span>${trash} tài khoản đang trong thùng rác.</span><span class="sp"></span><button class="btn" data-a="trash">Xem và khôi phục</button></div>` : ''}
${d.unmatchedDeposits ? `<div class="alert"><span>${d.unmatchedDeposits} giao dịch chuyển khoản chưa khớp khách hàng.</span><span class="sp"></span><button class="btn" data-a="go" data-id="deposits">Kiểm tra</button></div>` : ''}
<div class="kp">${K.map(k => `<div class="card"><div class="l">${k[0]}</div><div class="v">${esc(k[1])}</div><div class="s">${k[2]}</div></div>`).join('')}</div>
<div class="g2"><div class="card"><h3>Doanh thu 7 ngày</h3>${days.length ? barChart(days.map(x => Number(x.value) || 0), days.map(x => { const p = String(x.date || '').split('-'); return p.length === 3 ? +p[2] + '/' + +p[1] : x.label; })) : none('Chưa có dữ liệu.')}</div>
<div class="card"><h3>Đơn hàng gần đây</h3>${recent.map(o => lr(`<b>${esc(o.code)}</b> · ${esc(o.username)} · ${esc(o.title)}`, `${fmt(o.total)} · ${esc(o.time || '')}`)).join('') || '<span class="mut">Chưa có đơn hàng.</span>'}<p style="margin:10px 0 0"><button class="lk" data-a="go" data-id="orders">Xem tất cả đơn →</button></p></div></div>
<div class="card" style="margin-top:12px"><h3>Hoạt động trong phiên này</h3>${L.length ? `<ul class="act">${L.slice(0, 8).map(l => `<li><span>${esc(l.m)}</span><time>${l.t}</time></li>`).join('')}</ul>` : '<span class="mut">Chưa có thao tác nào.</span>'}</div>`;
};
A.trash = async () => { await go('acc'); S.tab = 'trash'; S.cat = ''; S.sub = ''; render(); };

// ---------- Tài khoản ----------
// Danh sách khách chỉ để hiện tên người mua; tải nền để không làm chậm trang.
LOAD.acc = async () => { await loadStore(); if (!isCtv()) loadUsers().then(() => S.v === 'acc' && !$('#dlg').open && render()).catch(() => {}); };
const accTabs = () => S.cat === 'promo'
  ? [['all', 'Tất cả'], ['ok', 'Trong kho'], ['sold', 'Đã tặng'], ['hide', 'Ẩn / nháp'], ['trash', 'Thùng rác']]
  : [['all', 'Tất cả'], ['ok', 'Đang bán'], ['sold', 'Đã bán'], ['hide', 'Ẩn / nháp'], ['trash', 'Thùng rác']];
function accTabMatch(r, t) {
  if (t === 'trash') return !!r.del;
  if (r.del) return false;
  if (t === 'ok') return r.status === 'Đang bán' || r.status === 'Trong kho';
  if (t === 'sold') return LOCKED.includes(r.status);
  if (t === 'hide') return ['Đã ẩn', 'Chờ kiểm tra', 'Nháp'].includes(r.status);
  return true;
}
const inFolder = r => (!S.cat || r.cat === S.cat) && (!S.sub || r.sub === S.sub);
const accRowsAll = M => M.merged.filter(r => hasCred(r) || r.del || r.tk);
function folderBar(M) {
  const stockOf = c => M.merged.filter(r => !r.del && r.cat === c.id && (c.id === 'promo' ? r.status === 'Trong kho' : r.status === 'Đang bán') && hasCred(r)).length;
  const cur = M.byId[S.cat], ctv = isCtv();
  const cats = ctv ? M.cats.filter(c => c.id !== 'promo') : M.cats;
  // Chip xuống dòng thay vì cuộn ngang; nút thao tác nằm ngay trên đầu mỗi hàng nên luôn nhìn thấy.
  const chip = (a, id, on, html) => `<button type="button" class="tab ${on ? 'on' : ''}" data-a="${a}" data-id="${esc(id)}">${html}</button>`;
  let h = `<div class="card mb12"><div class="fbh"><span class="fbl">Danh mục</span><span class="sp"></span>${ctv ? '' : (cur && cur.custom ? btn('fdel', cur.id, 'Xóa danh mục', 'bad') : '') + btn('fadd', '', '+ Danh mục')}</div>
<div class="chips">${chip('fcat', '', !S.cat, 'Tất cả')}${cats.map(c => chip('fcat', c.id, S.cat === c.id, `<i style="background:${esc(c.col)}"></i>${esc(c.label)}<b>${stockOf(c)}</b>`)).join('')}</div>`;
  if (cur) {
    const subs = M.subsOf(cur.id), s = M.subById[S.sub];
    const price = x => num(x.price) ? ' · ' + fmt(num(x.price)) : '';
    h += `<div class="fbh fsep"><span class="fbl">Thư mục con${s ? ': <b>' + esc(s.title || '(chưa đặt tên)') + '</b>' + esc(price(s)) : ' trong ' + esc(cur.label)}</span><span class="sp"></span>${ctv ? '' : (s ? btn('sedit', s.id, 'Sửa tên / giá') + btn('simg', s.id, 'Ảnh (' + s.pics.length + ')') + btn('sdel', s.id, 'Xóa', 'bad') : '') + btn('sadd', '', '+ Thư mục con')}</div>
<div class="chips">${chip('fsub', '', !S.sub, 'Tất cả')}${subs.map(x => chip('fsub', x.id, S.sub === x.id, `${esc(x.title || '(chưa đặt tên)')}<span class="cp">${esc(price(x))}</span><b>${x.stock}${cur.id === 'promo' ? '/' + x.given : ''}</b>`)).join('') || '<span class="mut small">Chưa có thư mục con. Bấm “+ Thư mục con” để tạo.</span>'}</div>`;
  }
  return h + '</div>';
}
function lookupCard(M) {
  const q = S.q.trim().toLowerCase();
  if (!q) return '';
  const m = accRowsAll(M).filter(x => String(x.tk || '').toLowerCase().includes(q));
  const h = m.slice(0, 6).map(x => {
    const c = M.byId[x.cat], place = (c ? c.label : x.cat) + (M.subById[x.sub] ? ' / ' + M.subById[x.sub].title : '');
    const st = x.del ? pill('bad', 'Trong thùng rác') : sp(x.status);
    const info = x.del ? 'Nằm trong thùng rác · ' + esc(place)
      : LOCKED.includes(x.status) ? `${x.status === 'Đã tặng' ? 'Đã tặng cho' : 'Đã bán cho'} <b>${esc(uname(x.soldTo || x.giftedTo) || '(chưa rõ)')}</b>${x.orderId ? ' · đơn ' + esc(x.orderId) : ''}${x.soldAt || x.giftedAt ? ' · ' + esc(dt(x.soldAt || x.giftedAt)) : ''}`
        : esc(place) + ' · ' + esc(x.price || '');
    const ac = (x.del ? btn('restore', x.id, 'Khôi phục') : LOCKED.includes(x.status) ? btn('view', x.id, 'Chi tiết') : btn('edit', x.id, 'Sửa') + btn('del', x.id, 'Xóa', 'bad')) + btn('cp', x.id, 'Copy');
    return `<div style="padding:8px 0;border-top:1px solid var(--line)"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><code>${esc(x.tk)}|${esc(x.mk)}</code>${st}<span style="flex:1"></span>${ac}</div><div class="mut" style="margin-top:4px">${info}</div></div>`;
  }).join('') || `<p class="mut" style="margin:0">Không tìm thấy tài khoản nào có tk chứa “${esc(S.q)}”.</p>`;
  return `<div class="card mb12"><h3>Tra cứu tk: ${esc(S.q)} (${m.length})</h3>${h}${m.length > 6 ? `<div class="mut">và ${m.length - 6} kết quả khác, gõ thêm để thu hẹp.</div>` : ''}</div>`;
}
VIEW.acc = () => {
  const { M, acc } = accCtx();
  if (S.cat && !M.byId[S.cat]) S.cat = '';
  if (S.sub && !M.subById[S.sub]) S.sub = '';
  const base = accRowsAll(M).filter(inFolder);
  const tabs = accTabs();
  if (!tabs.some(t => t[0] === S.tab)) S.tab = 'all';
  const rows = base.filter(r => accTabMatch(r, S.tab) && matchQ(r, ['tk', 'id', 'mk', 'info', 'title']));
  const n = S.sel.size, w = n ? n + ' đã chọn' : rows.length + ' trong danh sách', tr = S.tab === 'trash', ctv = isCtv();
  const bulk = `<div class="bulk">${w}<span style="flex:1"></span>${tr
    ? '<button class="btn" data-a="bres">Khôi phục</button>' + (ctv ? '' : '<button class="btn d" data-a="bpurge">Xóa vĩnh viễn</button>')
    : `<button class="btn" data-a="bshow">Mở bán</button><button class="btn" data-a="bhide">Ẩn</button>${S.cat === 'promo' ? '' : '<button class="btn" data-a="bprice">Đổi giá</button>' + (ctv ? '' : '<button class="btn" data-a="bgift">Chuyển kho quà</button>')}<button class="btn d" data-a="bdel">Xóa</button>`}</div>`;
  const lpRows = tr ? [] : rows;
  const sig = S.cat + '|' + S.sub + '|' + S.tab + '|' + S.q;
  const lpText = S.lp && S.lp.sig === sig ? S.lp.text : lpRows.map(x => x.tk + '|' + x.mk).join('\n');
  const lp = tr ? '' : `<div class="card mb12"><div class="hd" style="margin-bottom:8px"><h3 style="margin:0">Danh sách tk|mk (${lpRows.length})</h3><span class="sp"></span><button class="btn" data-a="cpall">Sao chép tất cả</button></div><textarea class="in" id="lst" rows="6" data-sig="${esc(sig)}" spellcheck="false">${esc(lpText)}</textarea><div class="hd" style="margin:8px 0 0"><span class="mut small">Gõ thêm dòng <code>tk|mk</code> hoặc <code>tk|mk|giá</code> để thêm acc vào thư mục đang chọn, sửa mk để đổi mật khẩu, xóa dòng để chuyển acc vào thùng rác, rồi bấm Lưu.</span><span class="sp"></span><button class="btn" data-a="lcut">Xóa phần bôi đen</button><button class="btn p" data-a="lsave">Lưu danh sách</button></div></div>`;
  const cols = [
    ['id', 'Mã'],
    ['tk', 'tk|mk', x => `<code>${esc(x.tk)}|${esc(x.mk)}</code>`],
    ['sub', 'Thư mục', x => { const c = M.byId[x.cat], s = M.subById[x.sub]; return esc((c ? c.label : x.cat || '—') + (s && s.title ? ' / ' + s.title : '')); }, x => (M.byId[x.cat] || {}).label + (M.subById[x.sub] || {}).title],
    ['img', 'Ảnh', x => btn('gal', x.id, 'Ảnh (' + ((acc.accPics[x.id] || []).length) + ')'), () => 0],
    ['price', 'Giá', x => { const p = num(x.price), c = num(x.cost); return p ? fmt(p) + (c > p ? ` <span class="pill bad">-${Math.round((c - p) * 100 / c)}%</span>` : '') : esc(x.price || '—'); }, x => num(x.price)],
    ['status', 'Trạng thái', x => sp(x.status)]
  ];
  const acts = x => x.del ? btn('restore', x.id, 'Khôi phục') + (ctv ? '' : btn('purge', x.id, 'Xóa vĩnh viễn', 'bad'))
    : btn('cp', x.id, 'Copy') + (LOCKED.includes(x.status) ? btn('view', x.id, 'Chi tiết') : btn('edit', x.id, 'Sửa') + btn('del', x.id, 'Xóa', 'bad'));
  return `<div class="hd"><h1>${ctv ? 'Acc của tôi' : 'Tài khoản'}</h1><span class="sp"></span><button class="btn" data-a="bulkadd">Thêm hàng loạt</button><button class="btn p" data-a="add">Thêm tài khoản</button></div>
${lookupCard(M)}${folderBar(M)}${tabsHTML(tabs.map(([k, l]) => [k, l, base.filter(r => accTabMatch(r, k)).length]), S.tab)}${bulk}${lp}${grid(rows, cols, { check: true, acts, empty: tr ? 'Thùng rác trống.' : 'Chưa có acc nào ở đây.' })}`;
};
A.fcat = id => { S.cat = id; S.sub = ''; S.pg = 1; S.sel.clear(); S.lp = null; render(); };
A.fsub = id => { S.sub = id; S.pg = 1; S.sel.clear(); S.lp = null; render(); };
const findAcc = id => accCtx().M.merged.find(x => x.id === id);
A.cp = id => { const x = findAcc(id); if (x) cpy(x.tk + '|' + x.mk); };
A.cpall = () => cpy($('#lst').value);
const subOpts = (M, cat) => M.subsOf(cat).map(s => [s.id, (s.title || '(chưa đặt tên)') + (s.price ? ' · ' + s.price + 'đ' : '')]);
const statusOpts = cat => (cat === 'promo' ? ['Trong kho', 'Đã ẩn', 'Nháp'] : ['Đang bán', 'Đã ẩn', 'Chờ kiểm tra', 'Nháp']).map(s => [s, s]);
function catPicker(M, cat, sub) {
  const subs = subOpts(M, cat);
  return selBox('f_cat', 'Danh mục', M.cats.filter(c => !isCtv() || c.id !== 'promo').map(c => [c.id, c.label]), cat)
    + `<div id="f_subw">${subs.length ? selBox('f_sub', 'Thư mục con', subs, sub) : '<input type="hidden" id="f_sub" value="">'}</div>`;
}
document.addEventListener('change', e => {
  if (e.target.id !== 'f_cat') return;
  const { M } = accCtx(), cat = e.target.value, subs = subOpts(M, cat);
  $('#f_subw').innerHTML = subs.length ? selBox('f_sub', 'Thư mục con', subs, '') : '<input type="hidden" id="f_sub" value="">';
  const st = $('#f_st');
  if (st) st.closest('label').outerHTML = selBox('f_st', 'Trạng thái', statusOpts(cat), cat === 'promo' ? 'Trong kho' : 'Đang bán');
  const ex = $('#f_extra');
  if (ex) ex.innerHTML = extraFields(M, cat);
});
function extraFields(M, cat) {
  const c = M.byId[cat] || {};
  if (c.code === 'CI' || c.code === 'CA') return `<div class="fg">${fld('f_lv', 'Cấp độ', '', 'number')}${fld('f_ch', 'Số nhân vật', '', 'number')}</div>`;
  if (c.code === 'TM' || c.custom) return fld('f_tn', c.code === 'TM' ? 'Tên đội' : 'Mô tả ngắn', '');
  return '';
}
function addForm(bulk) {
  const { M } = accCtx();
  const cat = S.cat || 'reroll-ios', sub = S.sub || (M.subsOf(cat)[0] || {}).id || '';
  const isPromo = cat === 'promo';
  const body = catPicker(M, cat, sub)
    + `<div class="fg">${fld('f_price', 'Giá bán (đ, để trống = giá thư mục)', '', 'number', 'min="0"')}${fld('f_cost', 'Giá gốc (đ, tùy chọn)', '', 'number', 'min="0"')}</div>`
    + selBox('f_st', 'Trạng thái', statusOpts(cat), isPromo ? 'Trong kho' : 'Đang bán')
    + `<div id="f_extra">${extraFields(M, cat)}</div>`
    + (bulk
      ? selBox('f_sep', 'Ký tự ngăn cách', [['|', '| (tk|mk)'], [':', ': (tk:mk)'], [';', '; (tk;mk)'], [',', ', (tk,mk)'], ['sp', 'Khoảng trắng']], '|')
        + area('f_bulk', 'Danh sách (mỗi dòng: tk|mk hoặc tk|mk|giá)', '', 8, 'placeholder="taikhoan1|matkhau1"')
      : `<div class="fg">${fld('f_tk', 'Tài khoản (tk)', '')}${fld('f_mk', 'Mật khẩu (mk)', '')}</div>`)
    + `<label>Ảnh acc (tùy chọn, tối đa 5)<input type="file" id="f_pics" accept="image/*" multiple></label>`;
  openM(bulk ? 'Thêm hàng loạt' : 'Thêm tài khoản', body, async () => {
    const cat2 = val('f_cat'), sub2 = val('f_sub');
    let items;
    if (bulk) {
      const sv = val('f_sep') || '|', SEP = sv === 'sp' ? /\s+/ : sv;
      items = $('#f_bulk').value.split('\n').filter(l => l.trim()).map(l => {
        const [a, b, c] = l.trim().split(SEP);
        return { tk: (a || '').trim(), mk: (b || '').trim(), price: c !== undefined && String(c).trim() !== '' ? num(c) : null };
      });
      if (!items.length) { toast('Nhập ít nhất một dòng tk|mk', true); return false; }
    } else {
      items = [{ tk: val('f_tk'), mk: val('f_mk'), price: null }];
      if (!items[0].tk || !items[0].mk) { toast('Nhập đủ tk và mk', true); return false; }
    }
    const files = $('#f_pics').files;
    let pics = [];
    if (files && files.length) {
      const up = await uploadImages([...files].slice(0, 5));
      pics = up.filter(x => x.url).map(x => x.url);
      up.filter(x => x.err).forEach(x => toast(x.err, true));
    }
    const o = { cat: cat2, sub: sub2, status: val('f_st'), price: val('f_price'), cost: val('f_cost'), lv: val('f_lv'), ch: val('f_ch'), tn: val('f_tn'), pics };
    const r = await mutateAcc((acc, c, M2) => addRows(acc, M2, o, items));
    if (!r.ok) { toast('Không có dòng hợp lệ (sai định dạng hoặc tk đã có trong kho)', true); return false; }
    S.cat = cat2; S.sub = sub2; S.tab = 'all'; S.lp = null;
    log('Đã thêm ' + r.ok + ' acc' + (r.skip ? ', bỏ qua ' + r.skip + ' dòng lỗi/trùng' : ''));
    render();
  }, bulk ? 'Thêm acc' : 'Thêm', true);
}
A.add = () => addForm(false);
A.bulkadd = () => addForm(true);
A.edit = id => {
  const { M, acc } = accCtx(), r = M.merged.find(x => x.id === id);
  if (!r) return toast('Không tìm thấy acc ' + id, true);
  if (LOCKED.includes(r.status)) return A.view(id);
  const c = M.byId[r.cat] || {}, isChar = c.code === 'CI' || c.code === 'CA', subs = subOpts(M, r.cat);
  openM('Sửa ' + r.id, `<div class="fg">${fld('e_id', 'Mã acc', r.id, 'text', isCtv() ? 'readonly' : '')}${fld('e_title', 'Tên sản phẩm', r.title || ('Acc #' + r.id))}</div>
<div class="fg">${fld('e_tk', 'Tài khoản (tk)', r.tk)}${fld('e_mk', 'Mật khẩu (mk)', r.mk)}</div>
${subs.length ? selBox('e_sub', 'Thư mục con', subs, r.sub) : ''}
${r.cat === 'promo' ? '' : `<div class="fg">${fld('e_price', 'Giá bán (đ)', num(r.price) || '', 'number', 'min="0"')}${fld('e_cost', 'Giá gốc (đ)', num(r.cost) || '', 'number', 'min="0"')}</div>`}
${selBox('e_st', 'Trạng thái', statusOpts(r.cat), r.status)}
${isChar ? `<div class="fg">${fld('e_lv', 'Cấp độ', r.level || '', 'number')}${fld('e_ch', 'Số nhân vật', r.chars || '', 'number')}</div>` : ''}
${fld('e_info', 'Thông tin hiển thị', r.info || '')}${fld('e_note', 'Ghi chú nội bộ', r.note || '')}
<p class="mut small" style="margin:0">Ảnh: ${(acc.accPics[r.id] || []).length} ảnh · ${btn('gal', r.id, 'Quản lý ảnh')}</p>`, async () => {
    const newId = val('e_id'), tk = val('e_tk'), mk = val('e_mk'), title = val('e_title');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(newId)) { toast('Mã acc 1–40 ký tự: chữ, số, - hoặc _', true); return false; }
    if (!tk || !mk) { toast('tk và mk không được để trống', true); return false; }
    if (!title || title.length > 100) { toast('Tên sản phẩm 1–100 ký tự', true); return false; }
    const res = await mutateAcc((acc2, cat, M2) => {
      const cur = M2.merged.find(x => x.id === r.id);
      if (!cur) throw new Error('Acc không còn trong kho.');
      if (LOCKED.includes(cur.status)) throw new Error('Acc vừa được bán/tặng nên không sửa được nữa.');
      if (M2.merged.some(x => x.id !== r.id && !x.del && String(x.tk).toLowerCase() === tk.toLowerCase())) throw new Error('tk ' + tk + ' đã có ở acc khác.');
      if (newId !== r.id && M2.merged.some(x => String(x.id).toLowerCase() === newId.toLowerCase())) throw new Error('Mã ' + newId + ' đã tồn tại.');
      const subId = val('e_sub') || cur.sub, ns = M2.subById[subId], os = M2.subById[cur.sub];
      let info = val('e_info');
      if (ns && os && ns.id !== os.id && os.title && info.includes(os.title)) info = info.split(os.title).join(ns.title);
      const p = { title, tk, mk, info, status: val('e_st'), col: ['Đang bán', 'Trong kho'].includes(val('e_st')) ? OK : OFF, sub: subId, note: val('e_note') };
      if (mk !== cur.mk) p.mkAt = new Date().toLocaleString('vi-VN');
      if (r.cat !== 'promo') {
        const n = num(val('e_price'));
        p.price = n ? fm(n) : (ns && ns.price ? ns.price + '₫' : 'Chưa đặt giá');
        p.cost = num(val('e_cost')) ? fm(num(val('e_cost'))) : '—';
      }
      if (isChar) {
        p.level = val('e_lv'); p.chars = val('e_ch');
        if (num(p.level)) p.info = p.info.replace(/Cấp [\d?]+/, 'Cấp ' + num(p.level));
        if (num(p.chars)) p.info = p.info.replace(/[\d?]+ nhân vật/, num(p.chars) + ' nhân vật');
      }
      patchOv(acc2, M2, r.id, p);
    });
    if (!res) return false;
    if (newId !== r.id) {
      await must('POST', '/api/admin/account-id', { oldId: r.id, newId });
      await loadStore();
    }
    log('Đã lưu acc ' + newId);
    S.lp = null;
    render();
  }, 'Lưu', true);
};
A.view = id => {
  const { M } = accCtx(), x = M.merged.find(r => r.id === id);
  if (!x) return;
  const c = M.byId[x.cat], s = M.subById[x.sub];
  const facts = [['Trạng thái', sp(x.status)], ['Danh mục', esc((c ? c.label : x.cat) + (s ? ' / ' + s.title : ''))], ['Giá', esc(x.price || '—')],
    ['Mã đơn', esc(x.orderId || '')], [x.status === 'Đã tặng' ? 'Khách nhận' : 'Khách mua', esc(uname(x.soldTo || x.giftedTo))],
    ['Thời gian', esc(dt(x.soldAt || x.giftedAt))], ['Đăng lúc', esc(x.listedAt || '')]].filter(f => f[1]);
  openM('Acc ' + x.id, `<div><code>${esc(x.tk)}|${esc(x.mk)}</code> ${btn('cp', x.id, 'Copy')}</div><div>${facts.map(f => lr(f[0], f[1])).join('')}</div><p class="mut small" style="margin:0">Acc đã bán, đặt giữ hoặc đã tặng không sửa hay xóa được.</p>`, null);
};
const delMsg = n => 'Chuyển ' + n + ' acc vào thùng rác? Acc sẽ biến mất khỏi cửa hàng, có thể khôi phục sau.';
A.del = id => ask(delMsg(1), async () => { await mutateAcc((acc, c, M) => { if (!patchOv(acc, M, id, { del: true })) throw new Error('Acc này đã bán/tặng nên không xóa được.'); }); log('Đã chuyển ' + id + ' vào thùng rác'); render(); });
A.restore = async id => {
  try {
    await mutateAcc((acc, c, M) => {
      const r = M.merged.find(x => x.id === id);
      if (r && M.merged.some(x => x.id !== id && !x.del && String(x.tk).toLowerCase() === String(r.tk).toLowerCase())) throw new Error('tk ' + r.tk + ' đã có ở acc khác đang hoạt động.');
      patchOv(acc, M, id, { del: false }, true);
    });
    log('Đã khôi phục ' + id); render();
  } catch (e) { fail(e); }
};
function purgeIn(acc, M, ids) {
  const set = new Set(ids.filter(id => { const r = M.merged.find(x => x.id === id); return r && r.del && !LOCKED.includes(r.status); }));
  acc.listed = acc.listed.filter(x => !set.has(x.id));
  set.forEach(id => { delete acc.ov[id]; delete acc.accPics[id]; });
  return set.size;
}
A.purge = id => ask('Xóa vĩnh viễn ' + esc(id) + '? Không thể hoàn tác.', async () => { const n = await mutateAcc((acc, c, M) => purgeIn(acc, M, [id])); log(n ? 'Đã xóa vĩnh viễn ' + id : 'Acc này không xóa vĩnh viễn được'); render(); }, 'Xóa vĩnh viễn');
// Nhóm thao tác hàng loạt: áp dụng cho acc đã chọn, nếu không chọn thì cho cả danh sách đang lọc.
const targetIds = () => S.sel.size ? [...S.sel] : S.rows.map(r => r.id);
function bulkPatch(label, p, opts = {}) {
  const ids = targetIds();
  if (!ids.length) return toast('Danh sách trống', true);
  ask(label + ' ' + ids.length + ' acc' + (S.sel.size ? ' đã chọn' : ' trong danh sách') + '? Acc đã bán/tặng sẽ được bỏ qua.', async () => {
    const n = await mutateAcc((acc, c, M) => ids.filter(id => {
      const r = M.merged.find(x => x.id === id);
      if (!r || r.del || (opts.skipPromo && r.cat === 'promo')) return false;
      return patchOv(acc, M, id, typeof p === 'function' ? p(r) : p);
    }).length);
    S.sel.clear(); S.lp = null;
    log(label + ' ' + n + ' acc'); render();
  });
}
A.bdel = () => bulkPatch('Chuyển vào thùng rác', { del: true });
A.bhide = () => bulkPatch('Ẩn', { status: 'Đã ẩn', col: OFF });
A.bshow = () => bulkPatch('Mở bán', r => r.cat === 'promo' ? { status: 'Trong kho', col: OK } : { status: 'Đang bán', col: OK });
A.bprice = () => openM('Đổi giá hàng loạt', fld('b_p', 'Giá bán mới (đ)', '', 'number', 'min="1"') + fld('b_c', 'Giá gốc (đ, để trống = không đổi)', '', 'number', 'min="0"'), () => {
  const p = num(val('b_p')), c = val('b_c');
  if (!p) { toast('Nhập giá lớn hơn 0', true); return false; }
  setTimeout(() => bulkPatch('Đổi giá', Object.assign({ price: fm(p) }, c ? { cost: num(c) ? fm(num(c)) : '—' } : {}), { skipPromo: true }), 50);
}, 'Tiếp tục');
A.bgift = () => {
  const { M } = accCtx(), g = M.subsOf('promo').filter(s => s.title);
  if (!g.length) return toast('Hãy tạo thư mục con trong danh mục Acc Khuyến Mãi trước', true);
  openM('Chuyển sang kho quà tặng', selBox('b_g', 'Thư mục kho quà', g.map(s => [s.id, s.title]), g[0].id) + '<p class="mut small" style="margin:0">Acc chuyển sang kho quà không còn bán lẻ, chỉ dùng để tặng theo quy tắc khuyến mãi.</p>', () => {
    const sub = val('b_g');
    setTimeout(() => bulkPatch('Chuyển kho quà', { cat: 'promo', status: 'Trong kho', col: OK, price: 'Không bán lẻ', sub }, { skipPromo: true }), 50);
  }, 'Tiếp tục');
};
A.bres = () => {
  const ids = targetIds();
  if (!ids.length) return toast('Thùng rác trống', true);
  ask('Khôi phục ' + ids.length + ' acc?', async () => {
    let skip = 0;
    const n = await mutateAcc((acc, c, M) => {
      const active = new Set(M.merged.filter(x => !x.del).map(x => String(x.tk).toLowerCase()));
      return ids.filter(id => {
        const r = M.merged.find(x => x.id === id);
        if (!r || !r.del) return false;
        const k = String(r.tk).toLowerCase();
        if (active.has(k)) { skip++; return false; }
        active.add(k);
        return patchOv(acc, M, id, { del: false }, true);
      }).length;
    });
    S.sel.clear(); log('Đã khôi phục ' + n + ' acc' + (skip ? ', bỏ qua ' + skip + ' acc trùng tk' : '')); render();
  });
};
A.bpurge = () => {
  const ids = targetIds();
  if (!ids.length) return toast('Thùng rác trống', true);
  ask('Xóa vĩnh viễn ' + ids.length + ' acc? Không thể hoàn tác.', async () => { const n = await mutateAcc((acc, c, M) => purgeIn(acc, M, ids)); S.sel.clear(); log('Đã xóa vĩnh viễn ' + n + ' acc'); render(); }, 'Xóa vĩnh viễn');
};
A.lcut = () => {
  const e = $('#lst'), v = e.value;
  let s = e.selectionStart, t = e.selectionEnd;
  if (s === t) return toast('Hãy bôi đen các dòng cần xóa', true);
  if (v[t - 1] === '\n') t--;
  s = s > 0 ? v.lastIndexOf('\n', s - 1) + 1 : 0;
  let n = v.indexOf('\n', t);
  n = n < 0 ? v.length : n + 1;
  e.value = (v.slice(0, s) + v.slice(n)).replace(/^\n+|\n+$/g, '');
  S.lp = { sig: e.dataset.sig, text: e.value };
  toast('Đã bỏ khỏi danh sách. Bấm Lưu danh sách để áp dụng.');
};
document.addEventListener('input', e => { if (e.target.id === 'lst') S.lp = { sig: e.target.dataset.sig, text: e.target.value }; });
A.lsave = () => {
  const { M } = accCtx();
  const lines = $('#lst').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [a, b, c] = l.split('|');
    return { tk: (a || '').trim(), mk: (b || '').trim(), price: c !== undefined && c.trim() !== '' ? num(c) : null };
  });
  const cur = new Map(S.rows.filter(x => !x.del).map(x => [String(x.tk).toLowerCase(), x]));
  const active = new Set(M.merged.filter(x => !x.del).map(x => String(x.tk).toLowerCase()));
  const seen = new Set(), add = [], upd = [];
  let bad = 0, locked = 0;
  lines.forEach(o => {
    const k = o.tk.toLowerCase();
    if (!o.tk || !o.mk || seen.has(k)) { bad++; return; }
    seen.add(k);
    const x = cur.get(k);
    if (x) { if (x.mk !== o.mk) { if (LOCKED.includes(x.status)) locked++; else upd.push([x.id, o.mk]); } }
    else if (active.has(k)) bad++;
    else add.push(o);
  });
  const gone = [...cur.values()].filter(x => !seen.has(String(x.tk).toLowerCase()));
  const goneOk = gone.filter(x => !LOCKED.includes(x.status));
  locked += gone.length - goneOk.length;
  if (!add.length && !upd.length && !goneOk.length) return toast(bad || locked ? 'Không có thay đổi hợp lệ (' + (bad + locked) + ' dòng lỗi, trùng hoặc acc đã bán)' : 'Danh sách không thay đổi', !!(bad || locked));
  const cat = S.cat;
  let sub = S.sub;
  if (add.length) {
    if (!cat) return toast('Chọn một danh mục ở trên trước khi thêm acc mới', true);
    if (!sub) sub = (M.subsOf(cat)[0] || {}).id || '';
  }
  const place = cat ? M.byId[cat].label + (M.subById[sub] ? ' / ' + M.subById[sub].title : '') : '';
  ask([add.length && `Thêm <b>${add.length}</b> acc vào ${esc(place)}`, upd.length && `Đổi mật khẩu <b>${upd.length}</b> acc`, goneOk.length && `Chuyển <b>${goneOk.length}</b> acc vào thùng rác`, (bad || locked) && `Bỏ qua ${bad + locked} dòng lỗi, trùng hoặc acc đã bán`].filter(Boolean).join('<br>') + '<br>Tiếp tục?', async () => {
    const r = await mutateAcc((acc, c, M2) => {
      const res = add.length ? addRows(acc, M2, { cat, sub, status: cat === 'promo' ? 'Trong kho' : 'Đang bán' }, add) : { ok: 0 };
      const u = upd.filter(([id, mk]) => patchOv(acc, M2, id, { mk, mkAt: new Date().toLocaleString('vi-VN') })).length;
      const g = goneOk.filter(x => patchOv(acc, M2, x.id, { del: true })).length;
      return { a: res.ok, u, g };
    });
    S.lp = null;
    log('Đã lưu danh sách: thêm ' + r.a + ', đổi mk ' + r.u + ', xóa ' + r.g);
    render();
  });
};
// Danh mục và thư mục con
A.fadd = () => openM('Thêm danh mục sản phẩm', fld('c_n', 'Tên danh mục', '') + selBox('c_p', 'Nền tảng', [['Android', 'Android'], ['iOS', 'iOS'], ['', 'Không ghi']], 'Android'), async () => {
  const name = val('c_n');
  if (name.length < 2 || name.length > 40) { toast('Tên danh mục cần 2–40 ký tự', true); return false; }
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let id = '';
  await mutateAcc((acc, catalog, M) => {
    if (M.cats.some(c => norm(c.label) === norm(name))) throw new Error('Tên danh mục này đã có.');
    const list = Array.isArray(catalog.categories) ? catalog.categories : [];
    if (list.length >= 20) throw new Error('Tối đa 20 danh mục tùy chỉnh.');
    id = 'product-' + Date.now().toString(36);
    catalog.categories = list.concat({ id, name, code: 'P' + id.slice(-5).toUpperCase(), platform: val('c_p'), color: '#5B1F7A' });
  });
  S.cat = id; S.sub = ''; log('Đã thêm danh mục ' + name); render();
});
A.fdel = id => {
  const { M } = accCtx(), c = M.byId[id];
  if (!c || !c.custom) return;
  if (M.merged.some(r => r.cat === id && !r.del) || M.subsOf(id).length) return toast('Danh mục còn acc hoặc thư mục con. Hãy xóa hết trước.', true);
  ask('Xóa danh mục “' + esc(c.label) + '”? Danh mục sẽ biến mất khỏi cửa hàng.', async () => {
    await mutateAcc((acc, catalog) => { catalog.categories = (catalog.categories || []).filter(x => x.id !== id); });
    S.cat = ''; S.sub = ''; log('Đã xóa danh mục ' + c.label); render();
  }, 'Xóa');
};
function subForm(s) {
  const { M } = accCtx(), cat = s ? s.cat : S.cat, isPromo = cat === 'promo';
  openM(s ? 'Sửa thư mục con' : 'Thêm thư mục con vào ' + M.byId[cat].label, fld('s_t', 'Tên thư mục con', s ? s.title : '', 'text', 'placeholder="VD: 50.000-60.000 cc iOS"') + (isPromo ? '<p class="mut small" style="margin:0">Kho quà nên đặt tên giống thư mục acc bán tương ứng để dễ tạo quy tắc tặng.</p>' : fld('s_p', 'Giá mặc định mỗi acc (đ)', s ? num(s.price) || '' : '', 'number', 'min="0"')), async () => {
    const t = val('s_t');
    if (!t || t.length > 80) { toast('Nhập tên thư mục con (tối đa 80 ký tự)', true); return false; }
    let id = s ? s.id : '';
    await mutateAcc((acc, catalog, M2) => {
      if (M2.subsOf(cat).some(x => x.id !== id && x.title.toLowerCase() === t.toLowerCase())) throw new Error('Thư mục con này đã có.');
      if (!id) { id = 'n' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); acc.added.push({ id, cat }); }
      const old = s ? s.title : '';
      acc.edits[id + ':t'] = t;
      if (!isPromo) acc.edits[id + ':p'] = num(val('s_p')) ? dots(num(val('s_p'))) : '';
      if (old && old !== t) acc.rulesData.forEach(r => { if (r.buySubId === id || (!r.buySubId && r.buySub === old)) r.buySub = t; if (r.giveSubId === id || (!r.giveSubId && r.giveSub === old)) r.giveSub = t; });
    });
    S.sub = id; log((s ? 'Đã sửa' : 'Đã thêm') + ' thư mục con ' + t); render();
  });
}
A.sadd = () => S.cat && subForm(null);
A.sedit = id => { const s = accCtx().M.subById[id]; if (s) subForm(s); };
A.sdel = id => {
  const { M, acc } = accCtx(), s = M.subById[id];
  if (!s) return;
  const inside = M.merged.filter(r => !r.del && r.sub === id);
  const locked = inside.filter(r => LOCKED.includes(r.status));
  if (locked.length) return toast('Không xóa được: còn ' + locked.length + ' acc đã bán/tặng trong thư mục này.', true);
  const rules = acc.rulesData.filter(r => r.buySubId === id || r.giveSubId === id || r.buySub === s.title || r.giveSub === s.title).length;
  ask('Xóa thư mục con “' + esc(s.title || '(chưa đặt tên)') + '”' + (inside.length ? ' và chuyển ' + inside.length + ' acc bên trong vào thùng rác' : '') + (rules ? ', xóa ' + rules + ' quy tắc tặng liên quan' : '') + '?', async () => {
    await mutateAcc((acc2, c, M2) => {
      M2.merged.filter(r => !r.del && r.sub === id).forEach(r => patchOv(acc2, M2, r.id, { del: true }));
      acc2.delSubs[id] = true;
      acc2.rulesData = acc2.rulesData.filter(r => !(r.buySubId === id || r.giveSubId === id || r.buySub === s.title || r.giveSub === s.title));
    });
    S.sub = ''; log('Đã xóa thư mục con ' + s.title); render();
  }, 'Xóa');
};
// Thư viện ảnh cho acc hoặc thư mục con (tối đa 5 ảnh).
let GT = null;
const galPics = () => { const { acc } = accCtx(); return (GT.kind === 'sub' ? acc.subPics : acc.accPics)[GT.id] || []; };
const drawG = () => { $('#gl').innerHTML = `<div class="gg">${galPics().map((s, i) => `<div class="gi"><img src="${esc(s)}" alt="Ảnh ${i + 1}" loading="lazy">${btn('gdel', i, 'Gỡ', 'bad')}</div>`).join('') || '<span class="mut">Chưa có ảnh.</span>'}</div>`; };
async function galSet(fn) {
  await mutateAcc(acc => { const box = GT.kind === 'sub' ? acc.subPics : acc.accPics; box[GT.id] = fn((box[GT.id] || []).slice()).slice(0, 5); });
  drawG();
}
function gallery(kind, id, title) {
  GT = { kind, id };
  openM(title, `<div id="gl"></div><label>Tải ảnh từ máy (chọn được nhiều ảnh)<input type="file" id="g_file" accept="image/*" multiple></label><div style="display:flex;gap:8px;align-items:end">${fld('g_url', 'Hoặc dán URL ảnh trực tiếp', '', 'url', 'placeholder="https://..."')}<button type="button" class="btn" data-a="gurl">Thêm</button></div>`, null, 'Xong');
  drawG();
}
A.gal = id => gallery('acc', id, 'Ảnh acc ' + id);
A.simg = id => gallery('sub', id, 'Ảnh thư mục con');
A.gurl = () => { const u = remoteUrl(val('g_url')); if (!u) return toast('URL phải bắt đầu bằng http:// hoặc https://', true); if (galPics().length >= 5) return toast('Tối đa 5 ảnh', true); galSet(a => a.concat(u)).then(() => { $('#g_url').value = ''; }, fail); };
A.gdel = i => galSet(a => { a.splice(+i, 1); return a; }).catch(fail);
document.addEventListener('change', async e => {
  if (e.target.id !== 'g_file' || !GT) return;
  const files = [...e.target.files].slice(0, Math.max(0, 5 - galPics().length));
  e.target.value = '';
  if (!files.length) return toast('Đã đủ 5 ảnh', true);
  toast('Đang tải ' + files.length + ' ảnh...');
  const up = await uploadImages(files);
  up.filter(x => x.err).forEach(x => toast(x.err, true));
  const urls = up.filter(x => x.url).map(x => x.url);
  if (urls.length) galSet(a => a.concat(urls)).catch(fail);
});
$('#dlg').addEventListener('close', () => { if (GT) { GT = null; if (S.v === 'acc') render(); } });

// ---------- Sự kiện chung ----------
A.go = id => go(id);
A.tab = id => { S.tab = id; S.pg = 1; S.sel.clear(); S.lp = null; render(); };
A.sort = id => { S.sd = S.sk === id ? -S.sd : 1; S.sk = id; render(); };
A.pgp = () => { S.pg--; render(); };
A.pgn = () => { S.pg++; render(); };
A.menu = () => $('#app').classList.toggle('open');
A.mini = () => $('#app').classList.toggle('mini');
A.close = closeM;
A.refresh = () => { S.lp = null; refresh(true).then(() => toast('Đã tải dữ liệu mới nhất')); };
const THEME_KEY = 'sonna-admin-theme';
function applyTheme() { let t = ''; try { t = localStorage.getItem(THEME_KEY) || ''; } catch (e) {} if (t) document.documentElement.dataset.theme = t; }
A.theme = () => {
  const h = document.documentElement, dark = h.dataset.theme ? h.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  h.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, h.dataset.theme); } catch (e) {}
};
A.logout = () => api('POST', '/api/logout').then(() => { location.href = '/'; });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (!b || !A[b.dataset.a] || b.disabled) return;
  if (b.tagName === 'A') e.preventDefault();
  Promise.resolve().then(() => A[b.dataset.a](b.dataset.id)).catch(fail);
});
document.addEventListener('change', e => {
  const t = e.target, c = t.dataset.c;
  if (c === 'row') { t.checked ? S.sel.add(t.value) : S.sel.delete(t.value); render(); }
  if (c === 'all') { document.querySelectorAll('[data-c=row]').forEach(i => t.checked ? S.sel.add(i.value) : S.sel.delete(i.value)); render(); }
});
let qT;
$('#gq').addEventListener('input', e => {
  clearTimeout(qT);
  qT = setTimeout(() => { S.q = e.target.value; S.pg = 1; S.lp = null; render(); }, 200);
});
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v && v !== S.v && VIEW[v]) go(v); });

// Tự làm mới khi không đang gõ hoặc mở hộp thoại: ngay khi có tín hiệu realtime, và mỗi 20 giây để dự phòng.
const LIVE_VIEWS = ['dash', 'acc', 'orders', 'deposits', 'users', 'ctv', 'rev'];
let rtDirty = false;
const canAutoRefresh = () => {
  const ae = document.activeElement;
  return !(document.hidden || $('#dlg').open || $('#app').hidden || (ae && ae.matches && ae.matches('input,textarea,select') && ae.id !== 'gq') || S.lp) && LIVE_VIEWS.includes(S.v);
};
setInterval(() => { if (canAutoRefresh()) { rtDirty = false; refresh(false); } }, 20000);
setInterval(() => { if (rtDirty && canAutoRefresh()) { rtDirty = false; refresh(false); } }, 1500);
// Supabase Broadcast chỉ mang thời điểm thay đổi, không mang dữ liệu; dữ liệu luôn lấy qua API có kiểm tra quyền.
function setupRealtime(cfg) {
  if (!cfg || !cfg.url || !cfg.key || setupRealtime.started) return;
  setupRealtime.started = true;
  const sc = document.createElement('script');
  sc.src = '/vendor/supabase.js';
  sc.onload = () => {
    try {
      const client = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { params: { eventsPerSecond: 5 } } });
      client.channel('sonna:store-updates', { config: { broadcast: { self: false }, private: false } })
        .on('broadcast', { event: 'store_changed' }, () => { rtDirty = true; })
        .subscribe(st => { if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') console.warn('[SONNA admin] Realtime tạm mất kết nối, trang vẫn tự làm mới mỗi 20 giây.'); });
    } catch (e) { console.warn('[SONNA admin] Không bật được realtime:', e); }
  };
  sc.onerror = () => console.warn('[SONNA admin] Không tải được thư viện realtime, trang vẫn tự làm mới mỗi 20 giây.');
  document.head.append(sc);
}

function showLogin() { $('#app').hidden = true; $('#login').hidden = false; if ($('#dlg').open) $('#dlg').close(); setTimeout(() => $('#lu').focus(), 0); }
$('#lf').addEventListener('submit', async e => {
  e.preventDefault();
  const u = val('lu'), p = $('#lp').value;
  if (!u || !p) { $('#le').textContent = 'Nhập tên đăng nhập và mật khẩu.'; return; }
  const r = await api('POST', '/api/login', { username: u, password: p });
  if (r._status !== 200) { $('#le').textContent = r.error || 'Đăng nhập thất bại.'; return; }
  $('#le').textContent = ''; $('#lp').value = '';
  boot();
});
async function boot() {
  applyTheme();
  const s = await api('GET', '/api/session');
  D.session = s;
  if (!s.authed) return showLogin();
  $('#login').hidden = true; $('#app').hidden = false;
  const who = s.role === 'ctv' && s.staff ? s.staff.name : 'Admin';
  $('.av').innerHTML = `<span>${esc(who)}${s.role === 'ctv' ? ' · CTV' : ''}</span><i>${esc(who.slice(0, 1).toUpperCase())}</i>`;
  setupRealtime(s.realtime);
  go(location.hash.slice(1) || (s.role === 'ctv' ? 'acc' : 'dash'));
}
window.addEventListener('DOMContentLoaded', boot);
