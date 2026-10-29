'use strict';
// SONNA Admin: Khuyến mãi và Nội dung web. Định dạng dữ liệu giữ nguyên như các trang quản trị cũ.

// ---------- Khuyến mãi ----------
LOAD.promo = async () => { await loadStore(); if (!D.users) await loadUsers().catch(() => {}); };
// Khi chưa lưu mã nào, máy chủ dùng bộ mã mặc định này (data/defaults.json).
const DEF_CODES = [
  { code: 'GIAM10', kind: 'pct', val: 10, min: 300000, cap: 50000, scope: 'Tất cả danh mục', used: 0, limit: 0, until: '31/10/2026', status: 'run' },
  { code: 'BANMOI', kind: 'amt', val: 20000, min: 100000, cap: 0, scope: 'Tất cả danh mục', used: 0, limit: 0, until: 'Không hết hạn', status: 'run' },
  { code: 'REROLLIOS', kind: 'pct', val: 5, min: 0, cap: 0, scope: 'Acc Reroll iOS', used: 0, limit: 0, until: '20/12/2026', status: 'run' },
  { code: 'TETVUI', kind: 'amt', val: 50000, min: 500000, cap: 0, scope: 'Tất cả danh mục', used: 0, limit: 0, until: '30/09/2026', status: 'expired' }
];
const SCOPES = ['Tất cả danh mục', 'Acc Reroll iOS', 'Acc Reroll Android', 'Acc Character + Chrono iOS', 'Acc Character + Chrono Android', 'Team Meta'];
const codesOf = s => Array.isArray(s.codes) ? s.codes : clone(DEF_CODES);
const untilDate = u => { const m = /^(\d+)\/(\d+)\/(\d+)$/.exec(u || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1], 23, 59, 59) : null; };
const codeState = c => c.status === 'expired' || (untilDate(c.until) && untilDate(c.until) < new Date()) ? 'expired' : (c.limit > 0 && c.used >= c.limit ? 'full' : c.status === 'paused' ? 'paused' : 'run');
const CODE_ST = { run: ['ok', 'Đang chạy'], paused: ['warn', 'Tạm dừng'], expired: ['mut', 'Hết hạn'], full: ['mut', 'Hết lượt'] };
const ruleState = r => r.until && new Date(r.until + 'T23:59:59') < new Date() ? ['mut', 'Hết hạn'] : r.from && new Date(r.from + 'T00:00:00') > new Date() ? ['info', 'Chưa bắt đầu'] : r.paused ? ['warn', 'Tạm dừng'] : ['ok', 'Đang chạy'];
const vnDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
VIEW.promo = () => {
  const s = D.store || {}, t = s.topup || {}, { acc, M } = accCtx();
  const on = t.enabled === true, pct = t.pct || '5', min = t.min || '0', cap = t.cap || '';
  const ex = 100000, bonus = on && ex >= num(min) ? Math.min(Math.round(ex * (parseFloat(String(pct).replace(',', '.')) || 0) / 100), num(cap) || Infinity) : 0;
  const giftSub = r => M.subById[r.giveSubId] || M.subsOf('promo').find(x => x.title === r.giveSub);
  const rules = acc.rulesData.map(r => {
    const g = giftSub(r), [c, st] = ruleState(r);
    return `<tr><td>Mua <b>${esc(r.buy)}</b> acc ${esc(r.buySub)}</td><td>Tặng <b>${esc(r.give)}</b> acc ${esc(r.giveSub)}</td><td>${g ? (g.stock < num(r.give) ? pill('bad', g.stock + ' (thiếu)') : pill('ok', g.stock)) : pill('bad', 'Không thấy kho')}</td><td>${esc(vnDate(r.from) || '—')} → ${esc(vnDate(r.until) || 'không hết hạn')}</td><td>${pill(c, st)}</td><td style="text-align:right">${btn('rtog', r.id, r.paused ? 'Bật lại' : 'Tạm dừng')}${btn('rdel', r.id, 'Xóa', 'bad')}</td></tr>`;
  }).join('');
  const codes = codesOf(s).map(c => {
    const st = codeState(c), [pc, pt] = CODE_ST[st];
    const offer = c.kind === 'pct' ? 'Giảm ' + c.val + '%' + (c.cap > 0 ? ' (tối đa ' + fmt(c.cap) + ')' : '') : 'Giảm ' + fmt(c.val);
    return `<tr><td><code>${esc(c.code)}</code></td><td>${esc(offer)}</td><td>${c.min > 0 ? 'Đơn từ ' + fmt(c.min) : 'Mọi đơn'} · ${esc(c.scope)}</td><td>${esc(c.used || 0)}${c.limit > 0 ? '/' + esc(c.limit) : ''}</td><td>${esc(c.until)}</td><td>${pill(pc, pt)}</td><td style="text-align:right">${st === 'run' ? btn('kpause', c.code, 'Tạm dừng') : st === 'paused' ? btn('krun', c.code, 'Bật lại') : btn('kcopy', c.code, 'Nhân bản')}${btn('kdel', c.code, 'Xóa', 'bad')}</td></tr>`;
  }).join('');
  const g3 = 'style="max-width:none;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))"';
  return `<div class="hd"><h1>Khuyến mãi</h1></div>
<div class="card mb12"><h3>Khuyến mãi nạp ví</h3><label class="sw"><input type="checkbox" id="p_on" ${on ? 'checked' : ''}> Bật thưởng khi khách nạp chuyển khoản</label>
<div class="fr" ${g3}>${fld('p_pct', 'Thưởng thêm (%)', pct, 'number', 'min="0" max="100" step="0.5"')}${fld('p_min', 'Nạp tối thiểu (đ)', num(min), 'number', 'min="0"')}${fld('p_cap', 'Thưởng tối đa mỗi lần (đ, 0 = không giới hạn)', num(cap), 'number', 'min="0"')}</div>
<p class="mut" style="margin:8px 0">Theo cài đặt đang lưu: nạp ${fmt(ex)} nhận thêm ${fmt(bonus)}. Nạp thẻ cào luôn cộng 85% mệnh giá, không áp dụng thưởng.</p><button class="btn p" data-a="ptop">Lưu khuyến mãi nạp</button></div>
<div class="card mb12"><div class="hd" style="margin-bottom:8px"><h3 style="margin:0">Mua acc tặng acc</h3><span class="sp"></span><button class="btn p" data-a="radd">Thêm quy tắc</button></div>
<div class="tw"><table><thead><tr><th class="ns">Điều kiện</th><th class="ns">Quà</th><th class="ns">Kho quà còn</th><th class="ns">Thời gian</th><th class="ns">Trạng thái</th><th class="ns"></th></tr></thead><tbody>${rules}</tbody></table></div>${rules ? '' : none('Chưa có quy tắc nào.')}
<p class="mut small" style="margin:8px 0 0">Acc quà lấy từ danh mục <button class="lk" data-a="giftgo">Acc Khuyến Mãi</button> ở trang Tài khoản. Nếu kho quà không đủ, đơn của khách bị từ chối và không trừ tiền.</p></div>
<div class="card mb12"><div class="hd" style="margin-bottom:8px"><h3 style="margin:0">Mã giảm giá</h3><span class="sp"></span><button class="btn p" data-a="kadd">Tạo mã</button></div>
<div class="tw"><table><thead><tr><th class="ns">Mã</th><th class="ns">Ưu đãi</th><th class="ns">Điều kiện</th><th class="ns">Đã dùng</th><th class="ns">Hạn</th><th class="ns">Trạng thái</th><th class="ns"></th></tr></thead><tbody>${codes}</tbody></table></div>${codes ? '' : none('Chưa có mã nào.')}
${Array.isArray(s.codes) ? '' : '<p class="mut small" style="margin:8px 0 0">Đang dùng bộ mã mặc định của hệ thống. Thay đổi đầu tiên sẽ lưu danh sách này thành danh sách của bạn.</p>'}</div>
<div class="card"><h3>Cộng / trừ tiền thành viên</h3><div class="fr" ${g3}>${selBox('m_u', 'Thành viên', [['all', 'Tất cả khách đang hoạt động']].concat((D.users || []).filter(u => !u.isAdmin).map(u => [u.id, u.username + ' (' + fmt(u.wallet) + ')'])), 'all')}${selBox('m_t', 'Thao tác', [['1', 'Cộng tiền'], ['-1', 'Trừ tiền']], '1')}${fld('m_a', 'Số tiền (đ)', '10000', 'number', 'min="1"')}${fld('m_r', 'Lý do', 'Quà tặng thành viên', 'text', 'maxlength="200"')}</div><button class="btn p" data-a="mmoney" style="margin-top:12px">Áp dụng</button></div>`;
};
A.giftgo = async () => { await go('acc'); S.cat = 'promo'; render(); };
A.ptop = async () => {
  const pct = val('p_pct') || '0';
  if (!(parseFloat(pct) >= 0 && parseFloat(pct) <= 100)) return toast('Phần trăm thưởng từ 0 đến 100', true);
  await saveKey('topup', () => ({ enabled: chk('p_on'), pct, min: String(num(val('p_min'))), cap: num(val('p_cap')) ? String(num(val('p_cap'))) : '' }));
  log('Đã lưu khuyến mãi nạp'); render();
};
A.radd = () => {
  const { M } = accCtx();
  const buy = M.cats.filter(c => c.id !== 'promo').flatMap(c => M.subsOf(c.id).filter(s => s.title).map(s => [s.id, c.label + ' / ' + s.title]));
  const gift = M.subsOf('promo').filter(s => s.title).map(s => [s.id, s.title + ' (còn ' + s.stock + ')']);
  if (!buy.length || !gift.length) return toast('Cần có thư mục con acc bán và thư mục con trong Acc Khuyến Mãi trước', true);
  openM('Thêm quy tắc mua tặng', selBox('r_bs', 'Khi mua acc ở thư mục', buy, buy[0][0]) + fld('r_b', 'Số lượng mua tối thiểu', 1, 'number', 'min="1"') + selBox('r_gs', 'Tặng acc lấy từ kho quà', gift, gift[0][0]) + fld('r_g', 'Số acc tặng', 1, 'number', 'min="1"') + `<div class="fg">${fld('r_f', 'Từ ngày (tùy chọn)', '', 'date')}${fld('r_t', 'Đến ngày (tùy chọn)', '', 'date')}</div>`, async () => {
    const b = num(val('r_b')), g = num(val('r_g')), from = val('r_f'), until = val('r_t');
    if (!b || !g) { toast('Số lượng mua và tặng phải từ 1', true); return false; }
    if (from && until && until < from) { toast('Ngày kết thúc phải sau ngày bắt đầu', true); return false; }
    await mutateAcc((acc, c, M2) => {
      const bs = M2.subById[val('r_bs')], gs = M2.subById[val('r_gs')];
      if (!bs || !gs) throw new Error('Thư mục không còn tồn tại.');
      if (acc.rulesData.some(r => r.buySubId === bs.id && num(r.buy) === b && r.giveSubId === gs.id && num(r.give) === g)) throw new Error('Quy tắc này đã có.');
      acc.rulesData.push({ id: 'r' + Date.now(), buy: b, buySub: bs.title, buySubId: bs.id, give: g, giveSub: gs.title, giveSubId: gs.id, from, until, paused: false });
    });
    log('Đã thêm quy tắc mua ' + b + ' tặng ' + g); render();
  });
};
A.rtog = id => mutateAcc(acc => { const r = acc.rulesData.find(x => x.id === id); if (r) r.paused = !r.paused; }).then(() => { log('Đã cập nhật quy tắc'); render(); });
A.rdel = id => ask('Xóa quy tắc tặng acc này?', async () => { await mutateAcc(acc => { acc.rulesData = acc.rulesData.filter(x => x.id !== id); }); log('Đã xóa quy tắc'); render(); }, 'Xóa');
const editCodes = (fn, msg) => saveKey('codes', cur => fn(Array.isArray(cur) ? cur : clone(DEF_CODES))).then(r => { if (r !== false) { log(msg); render(); } });
A.kpause = c => editCodes(L => L.map(x => x.code === c ? { ...x, status: 'paused' } : x), 'Đã tạm dừng mã ' + c);
A.krun = c => editCodes(L => L.map(x => x.code === c ? { ...x, status: 'run' } : x), 'Đã bật lại mã ' + c);
A.kcopy = c => editCodes(L => { const x = L.find(y => y.code === c); let n = c + '_2', i = 2; while (L.some(y => y.code === n)) n = c + '_' + (++i); return L.concat({ ...x, code: n.slice(0, 20), status: 'paused', used: 0, until: 'Không hết hạn' }); }, 'Đã nhân bản mã ' + c);
A.kdel = c => ask('Xóa mã ' + esc(c) + '? Khách sẽ không dùng được mã này nữa.', () => editCodes(L => L.filter(x => x.code !== c), 'Đã xóa mã ' + c), 'Xóa');
A.kadd = () => {
  const { M } = accCtx();
  const scopes = SCOPES.concat(M.customCats.map(c => c.name));
  openM('Tạo mã giảm giá', `<div style="display:flex;gap:8px;align-items:end">${fld('k_c', 'Mã (4–20 ký tự: chữ hoa, số, _)', '')}<button type="button" class="btn" data-a="krand">Ngẫu nhiên</button></div>
<div class="fg">${selBox('k_k', 'Loại giảm', [['pct', 'Phần trăm (%)'], ['amt', 'Số tiền (đ)']], 'pct')}${fld('k_v', 'Giá trị', 10, 'number', 'min="1"')}</div>
<div class="fg">${fld('k_cap', 'Giảm tối đa (đ, cho loại %)', '', 'number', 'min="0"')}${fld('k_min', 'Đơn tối thiểu (đ)', 0, 'number', 'min="0"')}</div>
${selBox('k_s', 'Áp dụng cho', scopes.map(x => [x, x]), scopes[0])}
<div class="fg">${fld('k_l', 'Giới hạn lượt dùng (0 = không giới hạn)', 0, 'number', 'min="0"')}${fld('k_u', 'Hết hạn (để trống = không hết hạn)', '', 'date')}</div>
<label class="sw"><input type="checkbox" id="k_p"> Lưu ở trạng thái tạm dừng</label>`, async () => {
    const code = val('k_c').toUpperCase(), kind = val('k_k'), v = kind === 'pct' ? parseFloat(val('k_v')) || 0 : num(val('k_v'));
    if (!/^[A-Z0-9_]{4,20}$/.test(code)) { toast('Mã gồm 4–20 ký tự: chữ hoa, số hoặc _', true); return false; }
    if (!v || (kind === 'pct' && v > 100)) { toast('Giá trị giảm không hợp lệ', true); return false; }
    const item = { code, kind, val: v, min: num(val('k_min')), cap: kind === 'pct' ? num(val('k_cap')) : 0, scope: val('k_s'), used: 0, limit: num(val('k_l')), until: vnDate(val('k_u')) || 'Không hết hạn', status: chk('k_p') ? 'paused' : 'run' };
    let dup = false;
    await editCodes(L => { if (L.some(x => x.code === code)) { dup = true; return false; } return L.concat(item); }, 'Đã tạo mã ' + code);
    if (dup) { toast('Mã ' + code + ' đã tồn tại', true); return false; }
  }, 'Tạo mã');
};
A.krand = () => { $('#k_c').value = 'SN' + rpw().slice(0, 6).toUpperCase(); };
A.mmoney = () => {
  const a = num(val('m_a')), s = +val('m_t'), w = val('m_u'), why = val('m_r');
  if (!a || !why) return toast('Nhập số tiền và lý do', true);
  const list = (D.users || []).filter(u => !u.isAdmin && (w === 'all' ? !u.locked : String(u.id) === w));
  if (!list.length) return toast('Không có thành viên phù hợp', true);
  ask((s > 0 ? 'Cộng ' : 'Trừ ') + fmt(a) + (w === 'all' ? ' cho ' + list.length + ' thành viên' : ' cho ' + esc(list[0].username)) + '?' + (s < 0 ? ' Thành viên không đủ số dư sẽ được bỏ qua.' : ''), async () => {
    let ok = 0, skip = 0;
    for (const u of list) {
      if (s < 0 && u.wallet < a) { skip++; continue; }
      const r = await api('POST', '/api/admin/users/' + u.id + '/wallet', { delta: s * a, reason: why });
      r._status === 200 ? ok++ : skip++;
    }
    log((s > 0 ? 'Đã cộng ' : 'Đã trừ ') + fmt(a) + ' cho ' + ok + ' thành viên' + (skip ? ', bỏ qua ' + skip : ''));
    await loadUsers(); render();
  });
};

// ---------- Nội dung web ----------
LOAD.web = loadStore;
const DEF_BANNERS = [
  { id: 1, kind: 'main', title: 'ACC REROLL UY TÍN, GIAO TỰ ĐỘNG', link: '/acc-reroll', on: true, img: '', kicker: 'SONNA · ACC DRAGON BALL LEGENDS', sub: 'Thanh toán bằng ví, nhận TK|MK ngay sau khi trừ tiền.', bg: 'linear-gradient(120deg,#2D0A3F,#5B1F7A 60%,#8A3FB0)' },
  { id: 2, kind: 'main', title: 'NẠP VÍ THƯỞNG THÊM 5%', link: '/nap-tien', on: true, img: '', kicker: 'KHUYẾN MÃI NẠP', sub: 'Nạp 100.000₫ nhận 105.000₫. Nạp ngân hàng hoặc thẻ cào.', bg: 'linear-gradient(120deg,#102A56,#2F6FD6 70%,#58A0F0)' },
  { id: 3, kind: 'sub', title: 'Mua 1 tặng 1', link: '', on: true, img: '', kicker: '', sub: 'Một số gói reroll được tặng thêm 1 acc cùng loại, giao tự động ngay khi thanh toán. Mua nhiều acc vẫn chỉ tặng 1.', bg: '#fff' }
];
const DEF_MARQ = 'Nạp ví hôm nay nhận thêm 5% giá trị nạp\nAcc được admin đăng nhập kiểm tra trước khi đăng bán\nHỗ trợ qua Zalo trong giờ làm việc';
const CONTACT = [['phone', 'Hotline'], ['facebook', 'Facebook'], ['zalo', 'Zalo cá nhân'], ['fanpage', 'Fanpage'], ['zgroup', 'Nhóm Zalo'], ['email', 'Email hỗ trợ'], ['youtube', 'Kênh YouTube']];
const DEF_CONTACT = { phone: { v: '', on: true }, facebook: { v: '', on: true }, zalo: { v: '', on: true }, fanpage: { v: '', on: true }, zgroup: { v: '', on: true }, email: { v: '', on: false }, youtube: { v: '', on: false } };
// Giao diện cửa hàng. Nút mua dùng chữ tối nên accent phải là màu sáng; accentLight là chữ nổi bật trên nền primary.
const PRESETS = {
  royal: { name: 'Tím SONNA', desc: 'Giao diện mặc định: tím hoàng gia, điểm nhấn cam.', primary: '#2D0A3F', mid: '#3F1457', deep: '#220733', tint: '#F3E8F9', border: '#D9CFE6', footerMuted: '#B8A3CF', accent: '#FF8A1F', accentLight: '#FFC24B', text: '#FFFFFF', pageBg: '#F4F5FA', surface: '#FFFFFF', surfaceAlt: '#FCFBFE', bodyText: '#1B1530', mutedText: '#5A5470', borderColor: '#E3E1EC' },
  galaxy: { name: 'Thiên hà xanh ngọc', desc: 'Xanh đêm sâu với điểm nhấn ngọc neon, hiện đại kiểu esports.', primary: '#121A3A', mid: '#1D2A5C', deep: '#0B1128', tint: '#E8ECFF', border: '#CDD5F5', footerMuted: '#A9B4E0', accent: '#2FD3BF', accentLight: '#7CF0E1', text: '#FFFFFF', pageBg: '#F2F4FB', surface: '#FFFFFF', surfaceAlt: '#F8F9FF', bodyText: '#141A33', mutedText: '#566084', borderColor: '#DDE2F2' },
  gold: { name: 'Hắc kim', desc: 'Đen ấm phối vàng kim, sang trọng như cửa hàng cao cấp.', primary: '#18150F', mid: '#2B251B', deep: '#0F0D09', tint: '#FAF1DA', border: '#E8D9B0', footerMuted: '#BDAE86', accent: '#E8B84A', accentLight: '#F4D68C', text: '#FFFFFF', pageBg: '#F6F4EE', surface: '#FFFFFF', surfaceAlt: '#FCFAF5', bodyText: '#1E1A12', mutedText: '#6A6250', borderColor: '#E7E0CF' },
  dragon: { name: 'Rồng lửa', desc: 'Đỏ thẫm và hổ phách, mạnh mẽ đúng chất Dragon Ball.', primary: '#781222', mid: '#931D2E', deep: '#470913', tint: '#FCEBEE', border: '#F2C8CF', footerMuted: '#E2A6AF', accent: '#FFB21F', accentLight: '#FFD37A', text: '#FFFFFF', pageBg: '#FAF5F4', surface: '#FFFFFF', surfaceAlt: '#FFFAF9', bodyText: '#2A1216', mutedText: '#6D565A', borderColor: '#EEDDDF' }
};
function themeOf(id) {
  const { desc, ...colors } = PRESETS[id] || PRESETS.royal;
  return { id: PRESETS[id] ? id : 'royal', ...colors };
}
// Cửa hàng thu nhỏ để xem trước giao diện.
const themePreview = p => `<div class="tp" aria-hidden="true" style="background:${p.pageBg};color:${p.bodyText}">
<div style="background:${p.primary};color:${p.text};padding:8px 10px;display:flex;align-items:center;gap:8px;font-weight:700"><span style="width:16px;height:16px;border-radius:5px;background:${p.accent}"></span>SONNA<span style="flex:1"></span><span style="color:${p.accentLight};font-size:10px;letter-spacing:.08em">NẠP TIỀN</span><span style="font-size:10px;opacity:.85">LỊCH SỬ</span></div>
<div style="background:${p.mid};height:18px;padding:0 10px;display:flex;align-items:center;gap:6px;font-size:9px;color:${p.text};opacity:.95">Thông báo · Nạp ví nhận thêm ưu đãi</div>
<div style="padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">${['Reroll iOS', 'Character'].map((t, i) => `<div style="background:${p.surface};border:1px solid ${p.borderColor};border-radius:8px;padding:8px;display:grid;gap:5px"><b style="font-size:11px">${t}</b><span style="color:${p.mutedText};font-size:10px">Còn ${i ? 6 : 18} acc</span><span style="justify-self:start;padding:1px 7px;border-radius:99px;background:${p.tint};color:${p.primary};font-size:10px;font-weight:600">${i ? '320.000₫' : '18.000₫'}</span><span style="background:${p.accent};color:#1A1206;border-radius:6px;padding:4px;text-align:center;font-weight:700;font-size:10px">MUA NGAY</span></div>`).join('')}</div>
<div style="background:${p.deep};color:${p.footerMuted};padding:7px 10px;font-size:10px;display:flex;justify-content:space-between"><span>© SONNA</span><span>Hotline · Zalo</span></div></div>`;
// Danh mục và gói cho tab Thứ tự hiển thị (giống trang Nội dung cũ).
const ORDER_CATS = [{ id: 'ra', name: 'Reroll DBL Android' }, { id: 'ri', name: 'Reroll DBL iOS' }, { id: 'ca', name: 'Character + Chrono Android' }, { id: 'ci', name: 'Character + Chrono iOS' }, { id: 'tm', name: 'Team Meta' }];
function orderData(C) {
  const cats = ORDER_CATS.slice(), items = [];
  if (!C) return { cats, items };
  const map = { 'reroll-android': 'ra', 'reroll-ios': 'ri', 'char-android': 'ca', 'char-ios': 'ci', 'team-meta': 'tm' };
  (C.categories || []).forEach(c => { if (c && c.id && c.name) { map[c.id] = c.id; cats.push({ id: c.id, name: c.name }); } });
  (C.subs || []).forEach(x => { if (map[x.cat]) items.push({ id: x.id, cat: map[x.cat], title: x.title || '(chưa đặt tiêu đề)', price: x.price }); });
  (C.accts || []).forEach(a => { if (map[a.cat] && !a.sub && a.status === 'Đang bán') items.push({ id: a.id, cat: map[a.cat], title: a.title || 'Acc #' + a.id, price: a.price }); });
  return { cats, items };
}
const bannersOf = s => Array.isArray(s.banners) ? s.banners : clone(DEF_BANNERS);
VIEW.web = () => {
  const s = D.store || {}, t = S.wt;
  const T = [['banner', 'Banner trang chủ'], ['marq', 'Chữ chạy'], ['contact', 'Liên hệ'], ['theme', 'Màu giao diện'], ['sales', 'Acc đã bán'], ['order', 'Thứ tự hiển thị']];
  let body = '';
  if (t === 'banner') {
    const B = bannersOf(s);
    const group = (kind, title) => `<div class="card mb12"><div class="hd" style="margin-bottom:8px"><h3 style="margin:0">${title}</h3><span class="sp"></span><button class="btn p" data-a="wbadd" data-id="${kind}">Thêm banner</button></div>${B.filter(b => b.kind === kind).map((b, i, a) => `<div class="br">${b.img ? `<img class="thumb" src="${esc(b.img)}" alt="">` : `<div class="thumb" style="display:grid;place-items:center;font-size:11px;color:var(--mut)">Chưa có ảnh</div>`}<div class="grow"><b>${esc(b.title || '(không tiêu đề)')}</b><div class="mut small">${esc(b.link || 'Không có liên kết')}</div></div>${btn('wbtog', b.id, b.on ? 'Đang hiện' : 'Đang ẩn', b.on ? '' : 'bad')}${i > 0 ? btn('wbmv', b.id + '|-1', 'Lên') : ''}${i < a.length - 1 ? btn('wbmv', b.id + '|1', 'Xuống') : ''}${btn('wbedit', b.id, 'Sửa')}${btn('wbdel', b.id, 'Xóa', 'bad')}</div>`).join('') || '<span class="mut">Chưa có banner.</span>'}</div>`;
    body = (Array.isArray(s.banners) ? '' : '<p class="mut">Đang dùng banner mặc định. Thay đổi đầu tiên sẽ lưu danh sách này.</p>') + group('main', 'Banner lớn (chạy luân phiên, ảnh 1200×420)') + group('sub', 'Banner phụ bên phải (ảnh 600×300)');
  } else if (t === 'marq') {
    const m = s.marq || {};
    body = `<div class="card fr"><label class="sw"><input type="checkbox" id="q_on" ${m.on !== false ? 'checked' : ''}> Hiện thanh chữ chạy trên cửa hàng</label>${area('q_t', 'Nội dung (mỗi dòng là một thông báo)', m.text != null ? m.text : DEF_MARQ, 6)}<div class="fg">${selBox('q_s', 'Tốc độ', [['slow', 'Chậm'], ['mid', 'Vừa'], ['fast', 'Nhanh']], m.speed || 'mid')}${selBox('q_c', 'Màu', [['orange', 'Cam'], ['blue', 'Xanh'], ['dark', 'Tối']], m.tone || 'orange')}</div><div><button class="btn p" data-a="wmarq">Lưu và đăng</button></div></div>`;
  } else if (t === 'contact') {
    const c = Object.assign(clone(DEF_CONTACT), s.contact || {});
    body = `<div class="card fr"><p class="mut" style="margin:0">Hiện ở chân trang cửa hàng. Hotline dùng số điện thoại; các kênh khác dùng link https://.</p>${CONTACT.map(([k, l]) => `<div style="display:flex;gap:10px;align-items:end"><div style="flex:1">${fld('ct_' + k, l, (c[k] || {}).v || '')}</div><label class="sw" style="padding-bottom:10px"><input type="checkbox" id="cto_${k}" ${(c[k] || {}).on !== false ? 'checked' : ''}> Hiện</label></div>`).join('')}${fld('ct_hours', 'Giờ hỗ trợ', typeof s.hours === 'string' ? s.hours : '08:00 - 22:00 hằng ngày')}<div><button class="btn p" data-a="wcontact">Lưu và đăng</button></div></div>`;
  } else if (t === 'theme') {
    const curId = (s.brandTheme && s.brandTheme.id) || 'royal';
    const known = !!PRESETS[curId];
    body = `${known ? '' : `<div class="alert">Cửa hàng đang dùng bảng màu cũ “${esc((s.brandTheme && s.brandTheme.name) || curId)}” không còn trong danh sách. Chọn một giao diện bên dưới để thay.</div>`}
<p class="mut" style="margin:0 0 12px">Chọn giao diện cho cửa hàng phía khách. Bấm <b>Áp dụng</b> là cửa hàng đổi màu ngay; có thể đổi lại bất cứ lúc nào.</p>
<div class="gg" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">${Object.keys(PRESETS).map(id => { const p = PRESETS[id], on = curId === id; return `<div class="tcard ${on ? 'on' : ''}">${themePreview(p)}<div><b>${esc(p.name)}</b>${id === 'royal' ? ' ' + pill('mut', 'Mặc định') : ''}${on ? ' ' + pill('ok', 'Đang dùng') : ''}<div class="mut small">${esc(p.desc)}</div></div>${on ? '<button class="btn" disabled>Đang áp dụng</button>' : `<button class="btn p" data-a="wtheme" data-id="${id}">Áp dụng</button>`}</div>`; }).join('')}</div>`;
  } else if (t === 'sales') {
    const sd = s.salesDisplay || { enabled: true, limit: 6 };
    body = `<div class="card fr"><label class="sw"><input type="checkbox" id="sd_on" ${sd.enabled !== false ? 'checked' : ''}> Hiện mục “Acc bán gần đây” trên cửa hàng</label>${selBox('sd_l', 'Số acc hiển thị', [3, 6, 9, 12].map(n => [n, n + ' acc']), [3, 6, 9, 12].includes(Number(sd.limit)) ? Number(sd.limit) : 6)}<p class="mut small" style="margin:0">Chỉ công khai tên sản phẩm, danh mục, ảnh và thời điểm bán; không công khai TK|MK hay thông tin khách.</p><div><button class="btn p" data-a="wsales">Lưu và đăng</button></div></div>`;
  } else {
    const d = orderData(s.catalog), co = (Array.isArray(s.catOrder) ? s.catOrder : ['ra', 'ri', 'ca', 'ci', 'tm']).filter(id => d.cats.some(c => c.id === id)).concat(d.cats.map(c => c.id).filter(id => !(s.catOrder || []).includes(id)));
    const io = s.itemOrder || {};
    const row = (label, i, n, a, id, lv) => `<div class="br" style="padding-left:${lv * 24}px"><span class="grow" style="font-weight:${lv ? 500 : 700}">${label}</span>${i > 0 ? btn(a, id + '|-1', 'Lên') : ''}${i < n - 1 ? btn(a, id + '|1', 'Xuống') : ''}</div>`;
    body = `<div class="card"><p class="mut" style="margin:0 0 8px">Danh mục và gói ở trên hiển thị trước trên cửa hàng.</p>${[...new Set(co)].map((cid, i, arr) => {
      const cat = d.cats.find(c => c.id === cid), ids = (io[cid] || []).filter(id => d.items.some(x => x.id === id)).concat(d.items.filter(x => x.cat === cid && !(io[cid] || []).includes(x.id)).map(x => x.id));
      return row(esc(cat.name), i, arr.length, 'wcmv', cid, 0) + ids.map((id, j) => { const x = d.items.find(y => y.id === id); return row(esc(x.title) + ' <span class="mut small">' + fmt(x.price) + '</span>', j, ids.length, 'wimv', cid + '|' + id, 1); }).join('');
    }).join('')}</div>`;
  }
  return `<div class="hd"><h1>Nội dung web</h1></div>${tabsHTML(T, t, 'wtab')}${body}`;
};
A.wtab = id => { S.wt = id; render(); };
const saveWeb = (k, fn, msg) => saveKey(k, fn).then(() => { log(msg); render(); });
const editBanners = (fn, msg) => saveWeb('banners', cur => fn(Array.isArray(cur) ? cur : clone(DEF_BANNERS)), msg);
A.wbtog = id => editBanners(B => B.map(b => String(b.id) === id ? { ...b, on: !b.on } : b), 'Đã cập nhật banner');
A.wbmv = k => {
  const [id, d] = k.split('|');
  editBanners(B => {
    const i = B.findIndex(b => String(b.id) === id), kind = B[i].kind;
    let j = i + +d;
    while (j >= 0 && j < B.length && B[j].kind !== kind) j += +d;
    if (j >= 0 && j < B.length) [B[i], B[j]] = [B[j], B[i]];
    return B;
  }, 'Đã đổi thứ tự banner');
};
A.wbdel = id => ask('Xóa banner này?', () => editBanners(B => B.filter(b => String(b.id) !== id), 'Đã xóa banner'), 'Xóa');
let BI = '';
const bpv = () => BI ? `<img src="${esc(BI)}" alt="" style="width:100%;max-height:160px;object-fit:cover;border-radius:10px">` : '<div class="em" style="background:var(--bg);border-radius:10px;padding:20px">Chưa có ảnh</div>';
function bannerForm(b, kind) {
  const n = !b;
  b = b || { kind, title: '', link: '', on: true, img: '', kicker: '', sub: '' };
  BI = b.img || '';
  openM(n ? 'Thêm banner' : 'Sửa banner', `<div id="bp">${bpv()}</div><label>Tải ảnh từ máy (${b.kind === 'main' ? '1200×420' : '600×300'})<input type="file" id="b_file" accept="image/*"></label><div style="display:flex;gap:8px;align-items:end">${fld('b_url', 'Hoặc URL ảnh trực tiếp', BI.startsWith('data:') ? '' : BI, 'url')}<button type="button" class="btn d" data-a="bclr">Gỡ ảnh</button></div>${fld('b_t', 'Tiêu đề', b.title)}${fld('b_k', 'Dòng nhỏ phía trên (tùy chọn)', b.kicker || '')}${fld('b_s', 'Mô tả (tùy chọn)', b.sub || '')}${fld('b_l', 'Liên kết khi bấm vào banner', b.link)}`, async () => {
    const urlIn = val('b_url');
    const img = urlIn ? remoteUrl(urlIn) : BI;
    if (urlIn && !img) { toast('URL ảnh phải bắt đầu bằng http:// hoặc https://', true); return false; }
    const p = { img: img || '', title: val('b_t'), kicker: val('b_k'), sub: val('b_s'), link: val('b_l') };
    await editBanners(B => {
      if (n) return B.concat({ ...b, ...p, id: Math.max(100, ...B.map(x => Number(x.id) || 0)) + 1, on: true });
      return B.map(x => String(x.id) === String(b.id) ? { ...x, ...p } : x);
    }, n ? 'Đã thêm banner' : 'Đã sửa banner');
  }, n ? 'Thêm' : 'Lưu');
}
A.wbadd = kind => bannerForm(null, kind);
A.wbedit = id => bannerForm(bannersOf(D.store || {}).find(b => String(b.id) === id));
A.bclr = () => { BI = ''; $('#b_url').value = ''; $('#bp').innerHTML = bpv(); };
document.addEventListener('change', async e => {
  if (e.target.id !== 'b_file') return;
  const f = e.target.files[0];
  if (!f) return;
  toast('Đang tải ảnh...');
  const [r] = await uploadImages([f], 1600);
  if (r.url) BI = r.url;
  else if (r.dataUrl && /gif/i.test(f.type) && f.size < 3e6) BI = r.dataUrl; // GIF động: giữ dạng nhúng như trước
  else return toast(r.err, true);
  $('#b_url').value = '';
  $('#bp').innerHTML = bpv();
});
A.wmarq = () => saveWeb('marq', () => ({ on: chk('q_on'), speed: val('q_s'), tone: val('q_c'), text: $('#q_t').value }), 'Đã lưu chữ chạy');
A.wcontact = async () => {
  const c = {};
  for (const [k, l] of CONTACT) {
    const v = val('ct_' + k);
    if (v && k !== 'phone' && k !== 'email' && k !== 'zalo' && !remoteUrl(v)) return toast(l + ' cần là link http:// hoặc https://', true);
    c[k] = { v, on: chk('cto_' + k) };
  }
  await saveKey('contact', () => c);
  await saveWeb('hours', () => val('ct_hours'), 'Đã lưu thông tin liên hệ');
};
A.wtheme = id => saveWeb('brandTheme', () => themeOf(id), 'Cửa hàng đã chuyển sang giao diện ' + (PRESETS[id] || PRESETS.royal).name);
A.wsales = () => saveWeb('salesDisplay', () => ({ enabled: chk('sd_on'), limit: Number(val('sd_l')) || 6 }), 'Đã lưu mục acc đã bán');
const mvArr = (a, i, d) => { const j = i + d; if (i < 0 || j < 0 || j >= a.length) return a; a = a.slice(); [a[i], a[j]] = [a[j], a[i]]; return a; };
A.wcmv = k => {
  const [id, d] = k.split('|'), data = orderData((D.store || {}).catalog);
  saveWeb('catOrder', cur => { const co = (Array.isArray(cur) ? cur : ['ra', 'ri', 'ca', 'ci', 'tm']).filter(x => data.cats.some(c => c.id === x)); data.cats.forEach(c => { if (!co.includes(c.id)) co.push(c.id); }); return mvArr(co, co.indexOf(id), +d); }, 'Đã đổi thứ tự danh mục');
};
A.wimv = k => {
  const [cid, id, d] = k.split('|'), data = orderData((D.store || {}).catalog);
  saveWeb('itemOrder', cur => {
    cur = cur && typeof cur === 'object' ? cur : {};
    const ids = (cur[cid] || []).filter(x => data.items.some(y => y.id === x)).concat(data.items.filter(x => x.cat === cid && !(cur[cid] || []).includes(x.id)).map(x => x.id));
    return { ...cur, [cid]: mvArr(ids, ids.indexOf(id), +d) };
  }, 'Đã đổi thứ tự gói');
};
