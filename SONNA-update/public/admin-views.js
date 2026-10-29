'use strict';
// SONNA Admin: Người dùng, Nạp tiền, Đơn hàng, CTV, Sản phẩm, Cài đặt. Dùng các hàm chung trong admin.js.

// ---------- Người dùng ----------
LOAD.users = loadUsers;
const roleTag = u => u.isAdmin ? ' ' + pill('info', 'Admin') : u.isCTV ? ' ' + pill('pur', 'CTV') : '';
const userSt = u => u.locked ? 'Bị khóa' : 'Hoạt động';
VIEW.users = () => {
  const all = D.users || [];
  const tabs = [['all', 'Tất cả', u => true], ['ok', 'Hoạt động', u => !u.locked], ['lock', 'Bị khóa', u => u.locked], ['wallet', 'Có số dư ví', u => u.wallet > 0], ['ctv', 'CTV', u => u.isCTV]];
  const f = (tabs.find(t => t[0] === S.tab) || tabs[0])[2];
  const rows = all.filter(u => f(u) && matchQ(u, ['username', 'id']));
  return `<div class="hd"><h1>Người dùng</h1><span class="sp"></span><button class="btn" data-a="ucsv">Sao chép CSV</button></div>
${tabsHTML(tabs.map(([k, l, fn]) => [k, l, all.filter(fn).length]), S.tab)}
${grid(rows, [
    ['id', 'ID', u => 'KH-' + String(u.id).padStart(4, '0'), u => u.id],
    ['username', 'Tên đăng nhập', u => btn('udet', u.id, esc(u.username)) + roleTag(u)],
    ['createdAt', 'Ngày tạo', u => esc(dt(u.createdAt).slice(-10))],
    ['wallet', 'Số dư', u => fmt(u.wallet)],
    ['toppedUp', 'Đã nạp', u => fmt(u.toppedUp)],
    ['orderCount', 'Đơn', u => u.orderCount || 0],
    ['spent', 'Tổng chi', u => fmt(u.spent)],
    ['locked', 'Trạng thái', u => sp(userSt(u))]
  ], { acts: u => btn('udet', u.id, 'Chi tiết') + btn('uwal', u.id, 'Cộng/trừ tiền') + btn('ulock', u.id, u.locked ? 'Mở khóa' : 'Khóa', u.locked ? '' : 'bad') })}`;
};
const findUser = id => (D.users || []).find(u => String(u.id) === String(id));
A.ucsv = () => {
  const head = ['ID', 'Tên đăng nhập', 'Số dư', 'Đã nạp', 'Số đơn', 'Tổng chi', 'Trạng thái'];
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  cpy([head.join(',')].concat(S.rows.map(u => [u.id, u.username, u.wallet, u.toppedUp, u.orderCount, u.spent, userSt(u)].map(q).join(','))).join('\n'));
};
A.udet = (id, np) => {
  const u = findUser(id);
  if (!u) return;
  const tx = (u.transactions || []).map(x => `<div class="lr"><span>${esc(x.title)}<br><span class="mut small">${esc(x.time)} · ${esc(x.status)}</span>${(x.accounts || []).map(a => `<br><code>${esc(a.line)}</code> <span class="mut small">${esc(a.tag)}</span>`).join('')}</span><span style="color:${Number(x.amount) < 0 ? 'var(--bad)' : 'var(--ok)'}">${Number(x.amount) < 0 ? '' : '+'}${fmt(x.amount)}</span></div>`).join('');
  openM(u.username, `<div>${sp(userSt(u))}${roleTag(u)}<br>Số dư: <b>${fmt(u.wallet)}</b> · Đã nạp: <b>${fmt(u.toppedUp)}</b> · ${u.orderCount || 0} đơn · Tổng chi <b>${fmt(u.spent)}</b></div>
${np ? `<div class="alert" style="margin:0"><span>Mật khẩu mới: <code>${esc(np)}</code></span><span class="sp"></span>${btn('ucp', np, 'Copy')}</div>` : ''}
<div><h3>Đặt lại mật khẩu</h3><div style="display:flex;gap:8px"><input class="in" id="u_pw" value="${rpw()}" aria-label="Mật khẩu mới"><button type="button" class="btn" data-a="urand">Ngẫu nhiên</button><button type="button" class="btn p" data-a="urs" data-id="${u.id}">Đặt lại</button></div><p class="mut small" style="margin:6px 0 0">Mật khẩu cũ không xem được. Sau khi đặt lại, các phiên đăng nhập cũ của khách bị đăng xuất; hãy gửi mật khẩu mới cho khách qua kênh riêng.</p></div>
<div><h3>Giao dịch (${(u.transactions || []).length})</h3><div style="max-height:320px;overflow:auto">${tx || '<span class="mut">Chưa có giao dịch.</span>'}</div></div>`, null, 'Xong', true);
};
A.urand = () => { $('#u_pw').value = rpw(); };
A.ucp = t => cpy(t);
A.urs = async id => {
  const p = val('u_pw');
  if (p.length < 6 || p.length > 100) return toast('Mật khẩu cần 6–100 ký tự', true);
  await must('POST', '/api/admin/users/' + id + '/password', { password: p });
  log('Đã đặt lại mật khẩu cho ' + findUser(id).username);
  A.udet(id, p);
};
function walletForm(u, preset = {}) {
  openM('Cộng/trừ tiền cho ' + u.username, `<p style="margin:0">Số dư hiện tại: <b>${fmt(u.wallet)}</b></p>${selBox('w_t', 'Thao tác', [['1', 'Cộng tiền'], ['-1', 'Trừ tiền']], '1')}${fld('w_a', 'Số tiền (đ)', preset.amount || '', 'number', 'min="1"')}${fld('w_r', 'Lý do (khách sẽ thấy trong lịch sử ví)', preset.reason || '', 'text', 'maxlength="200"')}`, async () => {
    const a = num(val('w_a')), s = +val('w_t'), why = val('w_r');
    if (!a) { toast('Nhập số tiền lớn hơn 0', true); return false; }
    if (!why) { toast('Nhập lý do', true); return false; }
    if (s < 0 && a > u.wallet) { toast('Số dư không đủ để trừ', true); return false; }
    await must('POST', '/api/admin/users/' + u.id + '/wallet', { delta: s * a, reason: why });
    log((s > 0 ? 'Cộng ' : 'Trừ ') + fmt(a) + (s > 0 ? ' cho ' : ' của ') + u.username);
    await loadUsers();
    render();
  });
}
A.uwal = id => { const u = findUser(id); if (u) walletForm(u); };
A.ulock = id => {
  const u = findUser(id);
  if (!u) return;
  const run = async () => { await must('POST', '/api/admin/users/' + u.id + '/lock', { locked: !u.locked }); log((u.locked ? 'Đã mở khóa ' : 'Đã khóa ') + u.username); await loadUsers(); render(); };
  if (u.locked) return run().catch(fail);
  ask('Khóa tài khoản ' + esc(u.username) + '? Khách sẽ bị đăng xuất và không đăng nhập được.', run, 'Khóa');
};

// ---------- Nạp tiền ----------
LOAD.deposits = async () => {
  const [d, s] = await Promise.all([must('GET', '/api/admin/deposits'), must('GET', '/api/session')]);
  D.deposits = d.deposits || []; D.session = s;
  if (!D.users) await loadUsers().catch(() => {});
};
const depSt = d => d.status === 'credited' ? ['ok', 'Đã cộng ví'] : d.status === 'unmatched' ? ['warn', 'Chưa khớp khách'] : d.status === 'ignored' ? ['bad', 'Bỏ qua: ' + (d.reason || 'không hợp lệ')] : ['mut', d.status || 'Không rõ'];
VIEW.deposits = () => {
  const all = (D.deposits || []).map((d, i) => ({ ...d, _k: String(d.txId || d.id || i), _t: d.bankTime || d.time || '' }));
  const tabs = [['all', 'Tất cả', () => true], ['ok', 'Đã cộng ví', d => d.status === 'credited'], ['un', 'Chưa khớp', d => d.status === 'unmatched'], ['ig', 'Bỏ qua', d => d.status === 'ignored']];
  const f = (tabs.find(t => t[0] === S.tab) || tabs[0])[2];
  const rows = all.filter(d => f(d) && matchQ(d, ['username', 'content', 'txId', 'reference']));
  const p = (D.session && D.session.payment) || {};
  const origin = location.origin;
  return `<div class="hd"><h1>Nạp tiền</h1></div>
<div class="g2 mb12"><div class="card"><h3>Chuyển khoản SePay</h3>
${lr('Trạng thái', p.ready ? pill('ok', 'Đã cấu hình') : pill('bad', 'Chưa cấu hình'))}${lr('Ngân hàng', esc(p.bankName || p.bankShortName || '—'))}${lr('Số tài khoản', esc(p.vaNumber || p.accountNumber || '—'))}${lr('Chủ tài khoản', esc(p.accountName || '—'))}${lr('Webhook', `<code>${esc(origin)}/api/webhook/sepay</code>`)}
${D.session && D.session.simTopup ? '<div class="alert" style="margin:8px 0 0">Đang bật nạp giả lập (SIM_TOPUP). Tắt trước khi bán thật.</div>' : ''}</div>
<div class="card"><h3>Nạp thẻ cào</h3>${lr('Gạch Thẻ Auto', D.session && D.session.cardTopupReady ? pill('ok', 'Sẵn sàng') : pill('mut', 'Chưa cấu hình'))}<p class="mut small">Thông tin ngân hàng và khóa SePay cấu hình trong biến môi trường trên Render. Khuyến mãi nạp chỉnh ở trang <button class="lk" data-a="go" data-id="promo">Khuyến mãi</button>.</p>
<p class="mut small" style="margin:0">Giao dịch “Chưa khớp” là tiền đã vào tài khoản nhưng nội dung chuyển khoản sai mã khách. Dùng nút <b>Cộng tay</b> để cộng vào ví đúng khách; giao dịch vẫn hiện “Chưa khớp” sau đó nên hãy kiểm tra kỹ để không cộng hai lần.</p></div></div>
${tabsHTML(tabs.map(([k, l, fn]) => [k, l, all.filter(fn).length]), S.tab)}
${grid(rows, [
    ['_t', 'Thời gian', d => esc(d._t)],
    ['username', 'Khách', d => esc(d.username || '—')],
    ['content', 'Nội dung', d => `<code>${esc(d.content || '—')}</code>`],
    ['amount', 'Số tiền', d => fmt(d.amount)],
    ['bonus', 'Thưởng', d => Number(d.bonus) > 0 ? '+' + fmt(d.bonus) : '—'],
    ['type', 'Loại', d => d.type === 'gachthe' ? 'Thẻ cào' : 'Chuyển khoản'],
    ['status', 'Trạng thái', d => { const [c, t] = depSt(d); return pill(c, t); }]
  ], { key: '_k', acts: d => d.status === 'credited' ? '' : btn('dman', d._k, 'Cộng tay'), empty: 'Chưa có giao dịch nạp.' })}`;
};
A.dman = k => {
  const d = (D.deposits || []).find((x, i) => String(x.txId || x.id || i) === k);
  if (!d) return;
  const users = (D.users || []).filter(u => !u.isAdmin);
  if (!users.length) return toast('Chưa tải được danh sách khách', true);
  openM('Cộng tay giao dịch', `<p style="margin:0">Nội dung: <code>${esc(d.content || '—')}</code> · ${fmt(d.amount)}</p><label>Khách nhận<input class="in" id="m_u" list="m_ul" placeholder="Gõ tên đăng nhập"></label><datalist id="m_ul">${users.map(u => `<option value="${esc(u.username)}">`).join('')}</datalist>${fld('m_a', 'Số tiền cộng (đ)', num(d.amount), 'number', 'min="1"')}${fld('m_r', 'Lý do', 'Nạp chuyển khoản sai nội dung: ' + (d.content || ''), 'text', 'maxlength="200"')}`, async () => {
    const u = users.find(x => x.username.toLowerCase() === val('m_u').toLowerCase()), a = num(val('m_a'));
    if (!u) { toast('Không tìm thấy khách ' + val('m_u'), true); return false; }
    if (!a || !val('m_r')) { toast('Nhập số tiền và lý do', true); return false; }
    await must('POST', '/api/admin/users/' + u.id + '/wallet', { delta: a, reason: val('m_r').slice(0, 200) });
    log('Đã cộng ' + fmt(a) + ' cho ' + u.username);
    await loadUsers();
    render();
  }, 'Cộng tiền');
};

// ---------- Đơn hàng ----------
LOAD.orders = async () => { D.orders = (await must('GET', '/api/admin/orders')).orders || []; };
VIEW.orders = () => {
  const all = D.orders || [];
  const tabs = [['all', 'Tất cả', () => true], ['paid', 'Đã thanh toán', o => o.status === 'Đã thanh toán'], ['done', 'Hoàn tất', o => o.status === 'Hoàn tất'], ['ref', 'Đã hoàn tiền', o => o.status === 'Đã hoàn tiền']];
  const f = (tabs.find(t => t[0] === S.tab) || tabs[0])[2];
  const rows = all.filter(o => f(o) && matchQ(o, ['code', 'username', 'title', 'coupon']));
  return `<div class="hd"><h1>Đơn hàng</h1></div>${tabsHTML(tabs.map(([k, l, fn]) => [k, l, all.filter(fn).length]), S.tab)}
${grid(rows, [
    ['code', 'Mã', o => btn('odet', o.code, esc(o.code))],
    ['username', 'Khách'],
    ['title', 'Sản phẩm', o => `<span title="${esc(o.title)}">${esc(String(o.title || '').slice(0, 40))}</span>`],
    ['total', 'Tổng', o => fmt(o.total) + (Number(o.discount) > 0 ? ` <span class="mut small">(-${fmt(o.discount)})</span>` : '')],
    ['createdAt', 'Thời gian', o => esc(o.time || dt(o.createdAt))],
    ['status', 'Trạng thái', o => sp(o.status)]
  ], { key: 'code', acts: o => btn('odet', o.code, 'Chi tiết') + (o.status === 'Đã thanh toán' ? btn('ofin', o.code, 'Hoàn tất') : '') + (o.status !== 'Đã hoàn tiền' ? btn('oref', o.code, 'Hoàn tiền', 'bad') : ''), empty: 'Chưa có đơn hàng.' })}`;
};
const findOrder = c => (D.orders || []).find(o => o.code === c);
A.odet = c => {
  const o = findOrder(c);
  if (!o) return;
  openM('Đơn ' + o.code, `<div>${lr('Trạng thái', sp(o.status))}${lr('Khách', esc(o.username))}${lr('Sản phẩm', esc(o.title))}${lr('Số lượng', esc(o.qty || 1))}${o.coupon ? lr('Mã giảm giá', esc(o.coupon) + ' (-' + fmt(o.discount) + ')') : ''}${lr('Tổng thanh toán', fmt(o.total))}${lr('Thời gian', esc(o.time || dt(o.createdAt)))}${o.sellerId ? lr('CTV bán', esc(o.sellerId) + ' · ' + ((o.settlementStatus || 'pending') === 'settled' ? 'Đã tất toán' : 'Chưa tất toán')) : ''}</div>
<div><h3>Acc đã giao</h3>${(o.accs || []).map(a => `<div class="lr"><span><code>${esc(a.line)}</code></span><span>${esc(a.tag || '')} ${btn('ucp', a.line, 'Copy')}</span></div>`).join('') || '<span class="mut">Không có.</span>'}</div>`, null, 'Xong', true);
};
async function setOrder(c, status) {
  await must('POST', '/api/admin/orders/' + encodeURIComponent(c), { status });
  log('Đơn ' + c + ': ' + status);
  await LOAD.orders();
  render();
}
A.ofin = c => setOrder(c, 'Hoàn tất');
A.oref = c => { const o = findOrder(c); ask('Hoàn ' + fmt(o.total) + ' vào ví của ' + esc(o.username) + ' cho đơn ' + esc(c) + '? Acc đã giao không tự thu hồi.', () => setOrder(c, 'Đã hoàn tiền'), 'Hoàn tiền'); };

// ---------- CTV ----------
async function loadCtv() { D.ctvs = (await must('GET', '/api/admin/ctv')).ctvs || []; }
LOAD.ctv = loadCtv;
VIEW.ctv = () => {
  const all = D.ctvs || [];
  const tabs = [['all', 'Tất cả', () => true], ['ok', 'Hoạt động', c => !c.locked], ['lock', 'Bị khóa', c => c.locked], ['due', 'Chưa tất toán', c => c.unpaid > 0]];
  const f = (tabs.find(t => t[0] === S.tab) || tabs[0])[2];
  const rows = all.filter(c => f(c) && matchQ(c, ['name', 'username', 'contact']));
  const sum = k => all.reduce((s, c) => s + (Number(c[k]) || 0), 0);
  return `<div class="hd"><h1>CTV</h1><span class="sp"></span><button class="btn p" data-a="cadd">Tạo CTV</button></div>
<div class="kp">${[['CTV đang hoạt động', all.filter(c => !c.locked).length], ['Doanh thu CTV', fmt(sum('revenue'))], ['Đã tất toán', fmt(sum('paid'))], ['Chưa tất toán', fmt(sum('unpaid'))]].map(k => `<div class="card"><div class="l">${k[0]}</div><div class="v">${k[1]}</div></div>`).join('')}</div>
${tabsHTML(tabs.map(([k, l, fn]) => [k, l, all.filter(fn).length]), S.tab)}
${grid(rows, [
    ['name', 'Tên CTV', c => btn('cdet', c.id, esc(c.name))],
    ['username', 'Đăng nhập'],
    ['contact', 'Liên hệ', c => esc(c.contact || '—')],
    ['sold', 'Đã bán'],
    ['revenue', 'Doanh thu', c => fmt(c.revenue)],
    ['unpaid', 'Chưa tất toán', c => c.unpaid > 0 ? `<b>${fmt(c.unpaid)}</b>` : fmt(0)],
    ['locked', 'Trạng thái', c => sp(c.locked ? 'Bị khóa' : 'Hoạt động')]
  ], { acts: c => btn('cdet', c.id, 'Đơn') + (c.unpaid > 0 ? btn('cset', c.id, 'Tất toán') : '') + btn('ulock', c.id, c.locked ? 'Mở khóa' : 'Khóa', c.locked ? '' : 'bad'), empty: 'Chưa có CTV nào.' })}
<p class="mut small">CTV đăng nhập bằng tài khoản được tạo ở đây và chỉ quản lý được acc do chính mình đăng. Tất toán đánh dấu toàn bộ đơn chưa thanh toán của CTV là đã trả, sau khi bạn đã chuyển tiền cho họ.</p>`;
};
const findCtv = id => (D.ctvs || []).find(c => String(c.id) === String(id));
// Nút Khóa trên trang CTV dùng chung API khóa người dùng.
A.ulock = (orig => id => { if (S.v !== 'ctv') return orig(id); const c = findCtv(id); if (!c) return; const run = async () => { await must('POST', '/api/admin/users/' + c.id + '/lock', { locked: !c.locked }); log((c.locked ? 'Đã mở khóa CTV ' : 'Đã khóa CTV ') + c.name); await loadCtv(); render(); }; if (c.locked) return run().catch(fail); ask('Khóa CTV ' + esc(c.name) + '?', run, 'Khóa'); })(A.ulock);
A.cdet = id => {
  const c = findCtv(id);
  if (!c) return;
  openM('Đơn của ' + c.name, `<div>${lr('Đăng nhập', esc(c.username))}${lr('Liên hệ', esc(c.contact || '—'))}${lr('Đã bán', c.sold + ' đơn · ' + fmt(c.revenue))}${lr('Đã tất toán', fmt(c.paid))}${lr('Chưa tất toán', fmt(c.unpaid))}</div><div style="max-height:340px;overflow:auto">${(c.orders || []).slice().reverse().map(o => lr(`<b>${esc(o.code)}</b> · ${esc(o.title)}<br><span class="mut small">${esc(o.time)}</span>`, fmt(o.total) + ' · ' + ((o.settlementStatus || 'pending') === 'settled' ? 'Đã TT' : 'Chưa TT'))).join('') || '<span class="mut">Chưa có đơn.</span>'}</div>`, null, 'Xong', true);
};
A.cset = id => {
  const c = findCtv(id);
  ask('Bạn đã chuyển <b>' + fmt(c.unpaid) + '</b> cho ' + esc(c.name) + '? Bấm Đồng ý để đánh dấu toàn bộ đơn chưa thanh toán là đã tất toán.', async () => {
    const r = await must('POST', '/api/admin/ctv/settle', { ctvId: c.id });
    log('Đã tất toán ' + r.settled + ' đơn (' + fmt(r.total) + ') cho ' + c.name);
    await loadCtv(); render();
  }, 'Đã chuyển, tất toán');
};
A.cadd = () => openM('Tạo CTV', fld('c_n', 'Tên hiển thị', '') + fld('c_u', 'Tên đăng nhập (3–30 ký tự: chữ, số, _ . -)', '') + fld('c_c', 'Liên hệ (Zalo, SĐT...)', '') + fld('c_w', 'Mật khẩu', rpw()), async () => {
  const name = val('c_n'), username = val('c_u'), password = val('c_w');
  if (!name || !/^[A-Za-z0-9_.-]{3,30}$/.test(username)) { toast('Nhập tên và tên đăng nhập hợp lệ', true); return false; }
  if (password.length < 6) { toast('Mật khẩu tối thiểu 6 ký tự', true); return false; }
  await must('POST', '/api/admin/ctv/create', { name, username, password, contact: val('c_c') });
  log('Đã tạo CTV ' + name);
  await loadCtv(); render();
  setTimeout(() => openM('Thông tin đăng nhập CTV', `<p style="margin:0">Gửi thông tin này cho CTV qua kênh riêng:</p><div>Tên đăng nhập: <code>${esc(username)}</code><br>Mật khẩu: <code>${esc(password)}</code></div><p style="margin:0">${btn('ucp', username + ' | ' + password, 'Copy')}</p>`, null, 'Xong'), 80);
});

// ---------- Doanh thu (chế độ CTV) ----------
IC.rev = 'M4 20V10M10 20V4M16 20v-7M22 20H2';
LOAD.rev = async () => { D.rev = await must('GET', '/api/ctv/revenue'); };
VIEW.rev = () => {
  const r = D.rev || {}, orders = (r.orders || []).slice().reverse();
  const rows = orders.filter(o => matchQ(o, ['code', 'title'])).map(o => ({ ...o, settled: (o.settlementStatus || 'pending') === 'settled' }));
  return `<div class="hd"><h1>Doanh thu</h1></div>
<div class="kp">${[['Doanh thu bán ra', fmt(r.revenue), orders.length + ' đơn'], ['Đã được thanh toán', fmt(r.paid), 'Admin đã tất toán'], ['Chờ thanh toán', fmt(r.unpaid), 'Admin sẽ chuyển khoản cho bạn']].map(k => `<div class="card"><div class="l">${k[0]}</div><div class="v">${k[1]}</div><div class="s">${k[2]}</div></div>`).join('')}</div>
${grid(rows, [['code', 'Mã đơn'], ['title', 'Sản phẩm'], ['total', 'Số tiền', o => fmt(o.total), o => Number(o.total)], ['time', 'Thời gian'], ['status', 'Đơn', o => sp(o.status)], ['settled', 'Thanh toán', o => o.settled ? pill('ok', 'Đã nhận') : pill('warn', 'Chờ thanh toán')]], { key: 'code', empty: 'Chưa bán được acc nào.' })}`;
};

// ---------- Sản phẩm (bảng products trên PostgreSQL) ----------
LOAD.products = async () => { D.products = (await must('GET', '/api/products')).products || []; };
VIEW.products = () => {
  const rows = (D.products || []).filter(p => matchQ(p, ['title']));
  return `<div class="hd"><h1>Sản phẩm</h1><span class="sp"></span><button class="btn p" data-a="padd">Thêm sản phẩm</button></div>
<p class="mut">Danh sách sản phẩm riêng hiển thị ở <a href="/products" target="_blank" rel="noopener">/products</a>, chưa đồng bộ vào kho acc của cửa hàng.</p>
${grid(rows, [['imageUrl', 'Ảnh', p => p.imageUrl ? `<img class="thumb" src="${esc(p.imageUrl)}" alt="" loading="lazy">` : '—', () => 0], ['title', 'Tên'], ['price', 'Giá', p => fmt(p.price), p => Number(p.price)], ['createdAt', 'Ngày tạo', p => esc(dt(p.createdAt))]], { empty: 'Chưa có sản phẩm.' })}`;
};
A.padd = () => openM('Thêm sản phẩm', fld('p_t', 'Tên sản phẩm', '') + fld('p_p', 'Giá (đ)', '', 'number', 'min="0"') + fld('p_u', 'URL ảnh HTTPS', '', 'url') + '<label>Hoặc tải ảnh lên<input type="file" id="p_f" accept="image/*"></label>', async () => {
  let url = val('p_u');
  const f = $('#p_f').files[0];
  if (f) { const [r] = await uploadImages([f], 1400); if (!r.url) { toast(r.err, true); return false; } url = r.url; }
  if (!val('p_t') || !url) { toast('Nhập tên và ảnh', true); return false; }
  await must('POST', '/api/products', { title: val('p_t'), price: num(val('p_p')), imageUrl: url });
  log('Đã thêm sản phẩm ' + val('p_t'));
  await LOAD.products(); render();
});

// ---------- Cài đặt ----------
VIEW.set = () => `<div class="hd"><h1>Cài đặt</h1></div>
<div class="card fr mb12"><h3>Giao diện quản trị</h3><p style="margin:0">Chọn màu: <button class="btn" data-a="theme">Đổi Sáng / Đỏ sẫm</button></p><p class="mut small" style="margin:0">Giao diện quản trị cũ vẫn dùng được tại <a href="/?old=1#AdminDashboard">/?old=1#AdminDashboard</a> nếu cần tính năng chưa có ở đây.</p></div>
<div class="card fr"><h3 style="color:var(--bad)">Vùng nguy hiểm</h3><p class="mut" style="margin:0">Đặt lại dữ liệu cấu hình cửa hàng (banner, liên hệ, khuyến mãi, catalog...) về trống. Kho acc, khách hàng và đơn hàng không bị xóa.</p><div><button class="btn d" data-a="reset">Đặt lại dữ liệu cửa hàng</button></div></div>`;
A.reset = () => openM('Đặt lại dữ liệu cửa hàng', '<p style="margin:0">Thao tác này không thể hoàn tác. Gõ <b>DAT LAI</b> để xác nhận.</p>' + fld('r_c', 'Xác nhận', ''), async () => {
  if (val('r_c') !== 'DAT LAI') { toast('Gõ đúng DAT LAI để xác nhận', true); return false; }
  await must('DELETE', '/api/store');
  log('Đã đặt lại dữ liệu cửa hàng');
}, 'Đặt lại');
