// Popup "Chuyển ngay" của trang nạp tiền: chọn app ngân hàng (deeplink VietQR) hoặc MoMo (quét QR từ ảnh).
// Trang cửa hàng (iframe) gọi parent.SONNA_PAY.open(info, document) để hiện popup đè lên cửa hàng.
(function (root) {
  'use strict';
  var CACHE_KEY = 'sonna-bank-apps-v1';
  // Dự phòng khi không tải được danh sách VietQR: các app phổ biến nhất.
  var FALLBACK = [['bidv', 'BIDV SmartBanking'], ['vcb', 'Vietcombank'], ['icb', 'VietinBank iPay'], ['mb', 'MB Bank'], ['tcb', 'Techcombank'], ['acb', 'ACB ONE'], ['vba', 'Agribank'], ['tpb', 'TPBank'], ['vpb', 'VPBank NEO'], ['cake', 'Cake'], ['timo', 'Timo']]
    .map(function (a) { return { appId: a[0], appName: a[1], appLogo: '', deeplink: 'https://dl.vietqr.io/pay?app=' + a[0] }; });
  var platform = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop';
  var appsPromise = null;
  function loadApps() {
    if (appsPromise) return appsPromise;
    var os = platform === 'ios' ? 'ios' : 'android';
    try { var c = JSON.parse(sessionStorage.getItem(CACHE_KEY + os) || 'null'); if (c && c.length) return (appsPromise = Promise.resolve(c)); } catch (e) {}
    appsPromise = fetch('https://api.vietqr.io/v2/' + os + '-app-deeplinks').then(function (r) { return r.json(); }).then(function (j) {
      var apps = (j.apps || []).filter(function (a) { return a && a.appId && /^https:\/\/dl\.vietqr\.io\//.test(a.deeplink || ''); })
        .sort(function (a, b) { return (b.monthlyInstall || 0) - (a.monthlyInstall || 0); });
      if (!apps.length) return FALLBACK;
      try { sessionStorage.setItem(CACHE_KEY + os, JSON.stringify(apps)); } catch (e) {}
      return apps;
    }).catch(function () { return FALLBACK; });
    return appsPromise;
  }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var money = function (n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '₫'; };
  var HEX = /^#[0-9a-f]{6}$/i;
  function open(info, doc) {
    doc = doc || document;
    var win = doc.defaultView || window;
    var c = info.colors || {};
    var col = function (k, d) { return HEX.test(c[k] || '') ? c[k] : d; };
    var accent = col('accent', '#FF8A1F'), primary = col('primary', '#2D0A3F'), surface = col('surface', '#FFFFFF'), surfaceAlt = col('surfaceAlt', '#F7F7FA');
    var ink = col('bodyText', '#1B1530'), muted = col('mutedText', '#5A5470'), line = col('borderColor', '#E3E1EC');
    var old = doc.getElementById('sonna-pay'); if (old) old.remove();
    // Dùng đúng font chữ của cửa hàng (theo giao diện đang chọn).
    var rootEl = doc.querySelector('#root > *') || doc.getElementById('root');
    var font = (rootEl && win.getComputedStyle(rootEl).fontFamily) || "'Barlow',system-ui,-apple-system,'Segoe UI',sans-serif";
    var bank = String(info.bankShort || info.bankName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    var params = 'ba=' + encodeURIComponent(info.account + '@' + bank) + '&am=' + Math.round(info.amount) + '&tn=' + encodeURIComponent(info.note);
    var row = function (label, value, copy, strong) {
      return '<div class="sp-row"><span class="sp-k">' + label + '</span><span class="sp-v' + (strong ? ' sp-strong' : '') + '">' + esc(value) + '</span><button type="button" class="sp-copy" data-copy="' + esc(copy) + '">Sao chép</button></div>';
    };
    var el = doc.createElement('div');
    el.id = 'sonna-pay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Chọn cách chuyển tiền');
    el.innerHTML = '<style>' +
      '#sonna-pay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;background:rgba(10,8,20,.55);font-family:' + font.replace(/[<>{}]/g, '') + '}#sonna-pay button,#sonna-pay input{font-family:inherit}' +
      '@media(min-width:640px){#sonna-pay{align-items:center}}' +
      '#sonna-pay .sp-box{width:100%;max-width:520px;max-height:92vh;overflow:auto;background:' + surface + ';color:' + ink + ';border-radius:18px 18px 0 0;padding:18px 18px 22px;box-shadow:0 -10px 40px rgba(0,0,0,.3);box-sizing:border-box}' +
      '@media(min-width:640px){#sonna-pay .sp-box{border-radius:18px}}' +
      '#sonna-pay h2{margin:0;font-size:20px}#sonna-pay h3{margin:16px 0 8px;font-size:15px}' +
      '#sonna-pay .sp-head{display:flex;align-items:center;gap:10px}#sonna-pay .sp-head span{flex:1}' +
      '#sonna-pay .sp-x{width:40px;height:40px;border-radius:50%;border:1px solid ' + line + ';background:' + surfaceAlt + ';color:' + ink + ';font-size:20px;cursor:pointer}' +
      '#sonna-pay .sp-sum{margin-top:12px;border:1px solid ' + line + ';border-radius:12px;padding:4px 12px;background:' + surfaceAlt + '}' +
      '#sonna-pay .sp-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid ' + line + '}#sonna-pay .sp-row:last-child{border-bottom:0}' +
      '#sonna-pay .sp-k{color:' + muted + ';font-size:13px;min-width:86px}#sonna-pay .sp-v{flex:1;font-weight:600;word-break:break-all}' +
      '#sonna-pay .sp-strong{color:#C2273D;font-size:17px}' +
      '#sonna-pay .sp-copy{border:1px solid ' + line + ';background:' + surface + ';color:' + ink + ';border-radius:8px;padding:6px 10px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}' +
      '#sonna-pay .sp-warn{margin:8px 0 0;font-size:13px;color:' + muted + '}' +
      '#sonna-pay .sp-search{width:100%;box-sizing:border-box;min-height:42px;padding:0 12px;border:1px solid ' + line + ';border-radius:10px;font:inherit;font-size:15px;background:' + surface + ';color:' + ink + '}' +
      '#sonna-pay .sp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;margin-top:10px}' +
      '#sonna-pay .sp-app{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;border:1px solid ' + line + ';border-radius:12px;background:' + surface + ';color:' + ink + ';font:inherit;font-size:12px;font-weight:600;text-align:center;cursor:pointer;line-height:1.25}' +
      '#sonna-pay .sp-app:hover{border-color:' + accent + '}' +
      '#sonna-pay .sp-app img,#sonna-pay .sp-ini{width:44px;height:44px;border-radius:12px;object-fit:cover;background:' + surfaceAlt + ';display:grid;place-items:center;font-weight:800;color:' + primary + '}' +
      '#sonna-pay .sp-momo{display:flex;gap:12px;align-items:flex-start;border:1px solid ' + line + ';border-radius:12px;padding:12px;background:' + surfaceAlt + '}' +
      '#sonna-pay .sp-momo-logo{width:44px;height:44px;flex:none;border-radius:12px;background:#A50064;color:#fff;display:grid;place-items:center;font-weight:800;font-size:13px}' +
      '#sonna-pay ol{margin:6px 0 10px;padding-left:18px;font-size:14px;color:' + muted + '}' +
      '#sonna-pay .sp-btns{display:flex;gap:8px;flex-wrap:wrap}' +
      '#sonna-pay .sp-btn{min-height:42px;padding:0 14px;border-radius:10px;border:1px solid ' + line + ';background:' + surface + ';color:' + ink + ';font:inherit;font-weight:700;cursor:pointer}' +
      '#sonna-pay .sp-btn.p{background:' + accent + ';border-color:' + accent + ';color:#1A1206}' +
      '#sonna-pay .sp-note{padding:10px 12px;border-radius:10px;background:#FFF4E0;color:#8A4B00;font-size:13px;margin-top:10px}' +
      '#sonna-pay .sp-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#14202b;color:#fff;padding:8px 14px;border-radius:10px;font-size:14px;z-index:2147483001}' +
      '</style>' +
      '<div class="sp-box"><div class="sp-head"><span><h2>Chọn cách chuyển tiền</h2></span><button type="button" class="sp-x" data-close aria-label="Đóng">×</button></div>' +
      '<div class="sp-sum">' + row('Số tiền', money(info.amount), String(Math.round(info.amount))) + row('Số tài khoản', info.account + ' · ' + (info.bankName || ''), info.account) + row('Chủ tài khoản', info.holder || '', info.holder || '') + row('Nội dung', info.note, info.note, true) + '</div>' +
      '<p class="sp-warn">Ghi <b>đúng nội dung ' + esc(info.note) + '</b> để ví được cộng tự động. Nếu app ngân hàng chưa điền sẵn, hãy dán từ các nút Sao chép ở trên.</p>' +
      (platform === 'desktop' ? '<div class="sp-note">Bạn đang dùng máy tính: mở trang này trên điện thoại để bấm vào app ngân hàng, hoặc dùng app ngân hàng trên điện thoại quét mã QR trên màn hình.</div>' : '') +
      '<h3>Ứng dụng ngân hàng</h3><input class="sp-search" type="search" placeholder="Tìm ngân hàng, ví dụ BIDV, MB..." aria-label="Tìm ngân hàng"><div class="sp-grid" aria-live="polite"><span style="color:' + muted + ';font-size:14px">Đang tải danh sách ngân hàng…</span></div>' +
      '<h3>Ví MoMo</h3><div class="sp-momo"><div class="sp-momo-logo">MoMo</div><div style="flex:1"><ol><li>Bấm <b>Lưu ảnh QR</b>.</li><li>Mở MoMo → <b>Chuyển tiền</b> → <b>Quét mã</b> → chọn ảnh QR vừa lưu.</li><li>Kiểm tra số tiền và nội dung <b>' + esc(info.note) + '</b> rồi xác nhận.</li></ol>' +
      '<div class="sp-btns"><button type="button" class="sp-btn p" data-saveqr>Lưu ảnh QR</button><button type="button" class="sp-btn" data-momo>Mở MoMo</button></div></div></div>' +
      '</div>';
    doc.body.appendChild(el);
    var toast = function (m) { var t = doc.createElement('div'); t.className = 'sp-toast'; t.textContent = m; el.appendChild(t); win.setTimeout(function () { t.remove(); }, 2200); };
    var close = function () { el.remove(); doc.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    doc.addEventListener('keydown', onKey);
    el.addEventListener('click', function (e) {
      var t = e.target;
      if (t === el || t.closest('[data-close]')) return close();
      var cp = t.closest('[data-copy]');
      if (cp) { (win.navigator.clipboard ? win.navigator.clipboard.writeText(cp.getAttribute('data-copy')) : Promise.reject()).then(function () { toast('Đã sao chép'); }, function () { toast('Không sao chép được, hãy chép tay'); }); return; }
      var app = t.closest('[data-app]');
      if (app) {
        var url = app.getAttribute('data-app') + '&' + params;
        // Mở ở tab mới để khách quay lại cửa hàng dễ dàng; trình duyệt chặn thì chuyển thẳng.
        var w = root.open(url, '_blank');
        if (!w) root.location.href = url;
        return;
      }
      if (t.closest('[data-momo]')) { root.location.href = 'momo://'; return; }
      if (t.closest('[data-saveqr]')) {
        fetch(info.qrUrl).then(function (r) { return r.blob(); }).then(function (b) {
          var a = doc.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'QR-' + info.note + '.png';
          doc.body.appendChild(a); a.click(); a.remove(); toast('Đã lưu ảnh QR');
        }).catch(function () { root.open(info.qrUrl, '_blank'); toast('Nhấn giữ ảnh QR để lưu'); });
      }
    });
    var grid = el.querySelector('.sp-grid'), search = el.querySelector('.sp-search');
    loadApps().then(function (apps) {
      var draw = function () {
        var q = (search.value || '').toLowerCase().trim();
        var list = apps.filter(function (a) { return !q || (a.appName + ' ' + (a.bankName || '') + ' ' + a.appId).toLowerCase().indexOf(q) >= 0; });
        grid.innerHTML = list.map(function (a) {
          var logo = /^https:\/\/cdn\.vietqr\.io\//.test(a.appLogo || '') ? '<img src="' + esc(a.appLogo) + '" alt="" loading="lazy">' : '<span class="sp-ini">' + esc(String(a.appId).slice(0, 3).toUpperCase()) + '</span>';
          return '<button type="button" class="sp-app" data-app="' + esc(a.deeplink) + '">' + logo + '<span>' + esc(a.appName) + '</span></button>';
        }).join('') || '<span style="color:' + muted + ';font-size:14px">Không tìm thấy ngân hàng phù hợp.</span>';
      };
      search.addEventListener('input', draw);
      draw();
    });
    var x = el.querySelector('.sp-x'); if (x) x.focus();
  }
  root.SONNA_PAY = { open: open };
})(window);
