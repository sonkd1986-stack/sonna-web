// Nút "Tải QR về máy" ở trang nạp tiền: lưu ảnh QR chuyển khoản để khách quét bằng app ngân hàng hoặc MoMo.
// Trang cửa hàng (iframe) gọi parent.SONNA_PAY.saveQr(url, tên file, document).
(function (root) {
  'use strict';
  var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  function toast(doc, msg) {
    var t = doc.createElement('div');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483000;max-width:calc(100vw - 32px);padding:10px 16px;border-radius:10px;background:#14202b;color:#fff;font:600 14px/1.4 system-ui,sans-serif;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.3)';
    doc.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4000);
  }
  function saveQr(url, name, doc) {
    doc = doc || document;
    if (!/^https:\/\//.test(url || '')) return;
    var file = String(name || 'QR-nap-tien').replace(/[^\w.-]+/g, '-') + '.png';
    // Ảnh QR (SePay/VietQR) cho phép tải chéo nguồn nên lưu thẳng thành file PNG.
    fetch(url).then(function (r) { if (!r.ok) throw new Error('QR ' + r.status); return r.blob(); }).then(function (blob) {
      var a = root.document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file;
      root.document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      toast(doc, isIOS ? 'Đã tải QR vào app Tệp. Muốn lưu vào Ảnh: nhấn giữ vào mã QR → Lưu vào Ảnh.' : 'Đã tải mã QR về máy. Mở app ngân hàng hoặc MoMo → Quét mã → chọn ảnh này.');
    }).catch(function () {
      root.open(url, '_blank');
      toast(doc, 'Nhấn giữ vào ảnh QR để lưu về máy.');
    });
  }
  root.SONNA_PAY = { saveQr: saveQr };
})(window);
