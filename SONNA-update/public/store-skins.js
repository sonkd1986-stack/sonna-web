// Giao diện cửa hàng: bảng màu + "lớp áo" (nền, kiểu thẻ, font, hiệu ứng).
// Dùng chung cho cửa hàng (pages/Store.json, khung index.html) và trang quản trị (xem trước, áp dụng).
// Các khóa màu giữ đúng 15 trường mà cửa hàng đã đọc từ brandTheme; thêm `skin` để chọn lớp áo.
(function (root) {
  'use strict';
  var GF = 'https://fonts.googleapis.com/css2?family=';
  var THEMES = {
    royal: {
      name: 'Tím SONNA', desc: 'Giao diện mặc định: nền sáng, menu tím hoàng gia, điểm nhấn cam.', skin: '', mode: 'light',
      primary: '#2D0A3F', mid: '#3F1457', deep: '#220733', tint: '#F3E8F9', border: '#D9CFE6', footerMuted: '#B8A3CF', accent: '#FF8A1F', accentLight: '#FFC24B', text: '#FFFFFF',
      pageBg: '#F4F5FA', surface: '#FFFFFF', surfaceAlt: '#FCFBFE', bodyText: '#1B1530', mutedText: '#5A5470', borderColor: '#E3E1EC',
      preview: { bg: '#F4F5FA', card: 'border-radius:8px;border:1px solid #E3E1EC', head: 'inherit', nav: '#2D0A3F' }
    },
    neon: {
      name: 'Neon Arena', desc: 'Nền đêm có lưới và quầng sáng, thẻ kính mờ phát sáng khi rê chuột. Phong cách esports.', skin: 'neon', mode: 'dark',
      primary: '#1D2B6B', mid: '#26388A', deep: '#0A1030', tint: '#C9F7F2', border: '#2A3A6B', footerMuted: '#8E9BC4', accent: '#22D3EE', accentLight: '#7CF0E1', text: '#FFFFFF',
      pageBg: '#070B1A', surface: '#0F172E', surfaceAlt: '#131D3A', bodyText: '#E6ECFF', mutedText: '#93A0C4', borderColor: '#22305A',
      font: { url: GF + 'Chakra+Petch:wght@600;700&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap', head: "'Chakra Petch',sans-serif", body: "'Be Vietnam Pro',system-ui,sans-serif" },
      preview: { bg: 'radial-gradient(160px 90px at 10% 0,rgba(34,211,238,.35),transparent),radial-gradient(160px 90px at 100% 0,rgba(168,85,247,.35),transparent),#070B1A', card: 'border-radius:10px;border:1px solid rgba(124,240,225,.35);box-shadow:0 0 12px rgba(34,211,238,.25)', head: "'Chakra Petch',sans-serif", nav: 'linear-gradient(90deg,#141E52,#2A1B5E)' }
    },
    noir: {
      name: 'Hắc Kim', desc: 'Đen ấm, vân vàng mảnh, góc vuông sắc, tiêu đề chữ có chân. Sang trọng như cửa hàng cao cấp.', skin: 'noir', mode: 'dark',
      primary: '#1C1913', mid: '#2A251B', deep: '#0B0A08', tint: '#F4E3B5', border: '#3A3120', footerMuted: '#A99D80', accent: '#D9AE4E', accentLight: '#F0D58C', text: '#F7EFD9',
      pageBg: '#0B0A08', surface: '#14120E', surfaceAlt: '#1A1712', bodyText: '#F2EAD6', mutedText: '#A89C82', borderColor: '#2C261A',
      font: { url: GF + 'Playfair+Display:wght@600;700&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap', head: "'Playfair Display',Georgia,serif", body: "'Be Vietnam Pro',system-ui,sans-serif" },
      preview: { bg: 'repeating-linear-gradient(135deg,rgba(217,174,78,.08) 0 1px,transparent 1px 9px),#0B0A08', card: 'border-radius:2px;border:1px solid rgba(217,174,78,.35);border-top:2px solid #D9AE4E', head: "'Playfair Display',serif", nav: '#0B0A08' }
    },
    sakura: {
      name: 'Anh Đào', desc: 'Hồng phấn và tím mận, thẻ bo tròn nổi bóng mềm, nút viên thuốc. Nhẹ nhàng phong cách anime.', skin: 'sakura', mode: 'light',
      primary: '#4A2257', mid: '#6B2D6E', deep: '#2E1236', tint: '#FFE4EE', border: '#F5C6D8', footerMuted: '#E7B9D0', accent: '#FF8FB1', accentLight: '#FFC2D6', text: '#FFFFFF',
      pageBg: '#FFF7FA', surface: '#FFFFFF', surfaceAlt: '#FFF9FC', bodyText: '#3A2440', mutedText: '#7E6380', borderColor: '#F3DCE6',
      font: { url: GF + 'Nunito:wght@400;600;700;800;900&display=swap', head: "'Nunito',sans-serif", body: "'Nunito',system-ui,sans-serif" },
      preview: { bg: 'radial-gradient(rgba(226,85,122,.14) 1.4px,transparent 1.5px) 0 0/12px 12px,linear-gradient(135deg,#FFE9F1,#F3ECFF)', card: 'border-radius:14px;border:1px solid #F7D3E1;box-shadow:0 6px 14px rgba(226,85,122,.15)', head: "'Nunito',sans-serif", nav: 'linear-gradient(90deg,#4A2257,#C65B8F)' }
    },
    saiyan: {
      name: 'Siêu Saiyan', desc: 'Xanh – cam đậm chất Dragon Ball, nền chấm in truyện tranh, thẻ viền đen dày đổ bóng lệch.', skin: 'saiyan', mode: 'light',
      primary: '#0B2A6F', mid: '#123A94', deep: '#061A47', tint: '#FFE7C2', border: '#10131F', footerMuted: '#A9B9E3', accent: '#FF7A00', accentLight: '#FFC24B', text: '#FFFFFF',
      pageBg: '#FFF4DF', surface: '#FFFFFF', surfaceAlt: '#FFFAF0', bodyText: '#10131F', mutedText: '#4A4F63', borderColor: '#10131F',
      font: { url: GF + 'Anton&family=Barlow:wght@400;500;600;700&display=swap', head: "'Anton',Impact,sans-serif", body: "'Barlow',system-ui,sans-serif" },
      preview: { bg: 'radial-gradient(rgba(255,122,0,.25) 1.3px,transparent 1.4px) 0 0/9px 9px,#FFF4DF', card: 'border-radius:8px;border:2px solid #10131F;box-shadow:3px 3px 0 #10131F', head: "'Anton',Impact,sans-serif", nav: '#0B2A6F' }
    }
  };
  var HEX = /^#[0-9a-f]{6}$/i;
  // Gắn lớp áo theo màu đã kiểm tra (chỉ mã hex) để không chèn được CSS lạ từ dữ liệu.
  function css(theme, c) {
    var t = THEMES[theme && theme.skin] || null;
    if (!t || !t.skin) return '';
    var k = {};
    Object.keys(c).forEach(function (key) { if (HEX.test(c[key])) k[key] = c[key]; });
    var f = t.font, dark = t.mode === 'dark';
    var surf = '#root :is(section,aside)[style*="background:' + k.surface + '"]';
    var out = ["@import url('" + f.url + "');",
      'html,body{background-color:' + k.pageBg + '!important;color:' + k.bodyText + '}',
      '#root{font-family:' + f.body + '}',
      '#root [style*="font-family"]:not([style*="Condensed"]):not([style*="monospace"]){font-family:' + f.body + '!important}',
      '#root [style*="Condensed"],#root h1,#root h2,#root h3,.store-category-title h2{font-family:' + f.head + '!important}',
      'a{color:' + (dark ? k.accentLight : k.primary) + '}',
      '.card:hover{border-color:' + k.accent + '}'];
    if (dark) out.push(
      '.store-category-head{background:' + k.surface + '!important;border-color:' + k.borderColor + '!important;border-left-color:var(--category-color)!important}',
      '.store-category-title h2,.store-category-metric strong{color:' + k.bodyText + '!important}',
      '.store-category-platform,.store-category-metric,.store-category-total{background:' + k.surfaceAlt + '!important;border-color:' + k.borderColor + '!important;color:' + k.mutedText + '!important}',
      // Khối danh mục (kể cả khối viền lửa) nền tối; khối lửa giữ viền lửa riêng.
      '.store-category-section{background:color-mix(in srgb,var(--category-color) 8%,' + k.pageBg + ')!important}',
      '.store-category-section:not(.flame-category){border-color:color-mix(in srgb,var(--category-color) 35%,' + k.borderColor + ')!important}',
      // Nút "Hết hàng" và chữ màu chủ đạo (không có nền riêng) để dễ đọc trên nền tối.
      '#root [style*="background:#D6D2E2"]{background:' + k.surfaceAlt + '!important;color:' + k.mutedText + '!important;box-shadow:inset 0 0 0 1px ' + k.borderColor + '}',
      // Chữ màu chủ đạo không có nền riêng (hoặc nền trong suốt, như tab và nút viền) -> màu sáng để đọc được trên nền tối.
      '#root [style*="color:' + k.primary + '"]:not([style*="background"]),#root [style*="color:' + k.primary + '"]:is([style*="background:transparent"],[style*="background:' + k.surface + '"],[style*="background:' + k.surfaceAlt + '"]){color:' + k.accentLight + '!important}',
      '#root :is([style*="border:1px solid ' + k.primary + '"],[style*="border:2px solid ' + k.primary + '"]):is([style*="background:transparent"],[style*="background:' + k.surface + '"],[style*="background:' + k.surfaceAlt + '"]){border-color:' + k.accentLight + '!important}',
      '#root [style*="color:#C2273D"]{color:' + (t.skin === 'noir' ? k.accentLight : '#FF7A8C') + '!important}',
      '#sonna-brand-logo.sonna-logo-sticky img{padding:0;background:transparent}',
      // Khung nền nhạt (tint) như thông báo nạp thẻ/nạp tiền: chữ đậm cho dễ đọc. Đặt sau luật đổi màu chữ chủ đạo ở trên.
      '#root [style*="background:' + k.tint + '"],#root [style*="background:' + k.tint + '"] [style*="color:"]{color:' + k.primary + '!important}',
      '.card{background:color-mix(in srgb,var(--category-color,' + k.accent + ') 9%,' + k.surface + ')!important}',
      '#root [style*="color:#5A5470"]{color:' + k.mutedText + '!important}',
      '#root [style*="color:#1B1530"],#root [style*="color:#211735"]{color:' + k.bodyText + '!important}',
      '#root input,#root select,#root textarea{background:' + k.surfaceAlt + '!important;color:' + k.bodyText + '!important;border-color:' + k.borderColor + '!important}',
      '#root ::placeholder{color:' + k.mutedText + ';opacity:1}',
      '#sonna-brand-logo img{background:#FFFFFF;border-radius:12px;padding:6px 10px;box-sizing:border-box}',
      '#root button[style*="background:' + k.primary + '"]{box-shadow:inset 0 0 0 1px ' + k.accent + '}');
    if (t.skin === 'neon') out.push(
      'html,body{background:radial-gradient(1100px 560px at 8% -8%,rgba(34,211,238,.16),transparent 60%),radial-gradient(900px 520px at 100% 0,rgba(168,85,247,.16),transparent 60%),linear-gradient(rgba(255,255,255,.028) 1px,transparent 1px) 0 0/34px 34px,linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px) 0 0/34px 34px,' + k.pageBg + '!important;background-attachment:fixed!important}',
      'header{background:rgba(15,23,46,.86)!important;backdrop-filter:blur(10px);border-bottom:1px solid rgba(124,240,225,.18)!important}',
      'nav[aria-label="Menu chính"]{background:linear-gradient(90deg,#141E52,#2A1B5E 55%,#0F2A4F)!important;box-shadow:0 1px 0 rgba(34,211,238,.5),0 12px 32px rgba(34,211,238,.1)}',
      surf + '{background:rgba(15,23,46,.78)!important;backdrop-filter:blur(8px);border-color:rgba(124,240,225,.16)!important;box-shadow:0 10px 30px rgba(0,0,0,.35)}',
      '.card{border:1px solid rgba(124,240,225,.2)!important;border-radius:14px!important}',
      '.card:hover{box-shadow:0 0 0 1px ' + k.accent + ',0 14px 34px rgba(34,211,238,.28)!important}',
      '#root [style*="background:' + k.accent + '"]{box-shadow:0 0 18px rgba(34,211,238,.45);letter-spacing:.04em}',
      '.store-category-head{box-shadow:0 0 26px color-mix(in srgb,var(--category-color) 20%,transparent)!important}',
      '#root h1,#root h2,.store-category-title h2,#root [style*="Condensed"]{letter-spacing:.05em!important}',
      'footer{background:linear-gradient(180deg,#0B1230,#060918)!important;border-top:1px solid rgba(124,240,225,.22)}');
    if (t.skin === 'noir') out.push(
      'html,body{background:radial-gradient(1000px 500px at 50% -10%,rgba(217,174,78,.12),transparent 65%),repeating-linear-gradient(135deg,rgba(217,174,78,.035) 0 1px,transparent 1px 14px),' + k.pageBg + '!important;background-attachment:fixed!important}',
      '#root section,#root aside,#root article,.card,.store-category-head,.store-category-section{border-radius:3px!important}',
      '#root button:not([style*="999px"]),#root input{border-radius:2px!important}',
      'header{background:#0E0C09!important;border-bottom:1px solid rgba(217,174,78,.35)!important}',
      'nav[aria-label="Menu chính"]{background:#0B0A08!important;border-top:1px solid rgba(217,174,78,.4);border-bottom:1px solid rgba(217,174,78,.4)}',
      'nav[aria-label="Menu chính"] button,nav[aria-label="Menu chính"] a{letter-spacing:.14em!important}',
      surf + '{border-color:rgba(217,174,78,.22)!important;box-shadow:0 20px 40px rgba(0,0,0,.45)}',
      '.card{border:1px solid rgba(217,174,78,.25)!important;border-top:2px solid ' + k.accent + '!important}',
      '.card:hover{box-shadow:0 0 0 1px rgba(217,174,78,.6),0 18px 40px rgba(0,0,0,.6)!important}',
      '#root [style*="background:' + k.accent + '"]{background:linear-gradient(135deg,#F3D58A,#C8952F)!important;letter-spacing:.08em}',
      '#root h1,#root h2,.store-category-title h2{color:' + k.accentLight + '!important;font-weight:600!important;text-transform:none!important;letter-spacing:.02em!important}',
      'footer{background:#070605!important;border-top:1px solid rgba(217,174,78,.35)}');
    if (t.skin === 'sakura') out.push(
      'html,body{background:radial-gradient(rgba(226,85,122,.07) 1.5px,transparent 1.6px) 0 0/22px 22px,radial-gradient(900px 500px at 12% 0,#FFE3EE,transparent 60%),radial-gradient(900px 520px at 90% 10%,#EFE6FF,transparent 60%),' + k.pageBg + '!important;background-attachment:fixed!important}',
      'header{background:rgba(255,255,255,.88)!important;backdrop-filter:blur(10px);border-bottom:1px solid #F7D9E5!important}',
      'nav[aria-label="Menu chính"]{background:linear-gradient(90deg,#4A2257,#8C3B78 60%,#C65B8F)!important}',
      '#root section,#root aside,.store-category-head{border-radius:22px!important}',
      '.store-category-section{border-radius:28px!important}',
      surf + '{border-color:#F7D9E5!important;box-shadow:0 12px 34px rgba(160,70,120,.08)}',
      '.card{border-radius:18px!important;border:1px solid #F7D3E1!important;box-shadow:0 8px 22px rgba(226,85,122,.1)!important}',
      '.card:hover{box-shadow:0 16px 32px rgba(226,85,122,.22)!important}',
      // Nút bo tròn viên thuốc (chỉ nút bấm, không áp lên thanh chữ chạy hay khối lớn).
      '#root button[style*="background:"]:not([style*="transparent"]){border-radius:999px!important}',
      '#root h1,#root h2,.store-category-title h2,#root [style*="Condensed"]{font-weight:900!important;letter-spacing:0!important;text-transform:none!important}',
      '.store-category-title h2{color:' + k.primary + '!important}',
      'footer{background:linear-gradient(180deg,#4A2257,#2E1236)!important}');
    if (t.skin === 'saiyan') out.push(
      'html,body{background:radial-gradient(rgba(255,122,0,.16) 1.2px,transparent 1.3px) 0 0/14px 14px,linear-gradient(180deg,#FFF4DF,#FFE9C4)!important;background-attachment:fixed!important}',
      'header{border-bottom:3px solid #10131F!important}',
      'nav[aria-label="Menu chính"]{background:#0B2A6F!important;border-bottom:4px solid ' + k.accent + '!important}',
      surf + ',.store-category-head{border:2px solid #10131F!important;box-shadow:5px 5px 0 #10131F!important;border-radius:10px!important}',
      '.store-category-section{border:2px solid #10131F!important;box-shadow:6px 6px 0 #10131F!important}',
      '.card{border:2px solid #10131F!important;box-shadow:4px 4px 0 #10131F!important;border-radius:10px!important}',
      '.store-category-section .card:hover,.card:hover{transform:translate(-2px,-2px)!important;box-shadow:7px 7px 0 #10131F!important}',
      '#root [style*="background:' + k.accent + '"]{border:2px solid #10131F!important;box-shadow:3px 3px 0 #10131F}',
      '#root h1,#root h2,.store-category-title h2,#root [style*="Condensed"]{text-transform:uppercase;letter-spacing:.03em!important;font-weight:400!important}',
      'footer{background:#0B2A6F!important;border-top:4px solid ' + k.accent + '}');
    return out.join('\n');
  }
  // Gắn CSS vào <head> của trang đang chạy; chỉ cập nhật khi đổi giao diện.
  function apply(theme, colors, doc) {
    doc = doc || document;
    var text = css(theme, colors);
    var el = doc.getElementById('sonna-skin');
    if (!el) { el = doc.createElement('style'); el.id = 'sonna-skin'; doc.head.appendChild(el); }
    if (el.textContent !== text) el.textContent = text;
  }
  // Bản giao diện đầy đủ để lưu vào brandTheme (bỏ phần chỉ dùng cho xem trước).
  function themeValue(id) {
    var t = THEMES[id] || THEMES.royal, v = { id: THEMES[id] ? id : 'royal' };
    Object.keys(t).forEach(function (key) { if (['name', 'desc', 'preview', 'font'].indexOf(key) < 0) v[key] = t[key]; });
    v.name = t.name;
    return v;
  }
  root.SONNA_SKINS = { THEMES: THEMES, css: css, apply: apply, themeValue: themeValue };
})(window);
