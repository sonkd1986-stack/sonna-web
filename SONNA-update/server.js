'use strict';
// SONNA - HTTP server with Supabase PostgreSQL state and Supabase Storage uploads.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const productApi = require('./routes/products');
const cloudState = require('./cloud-state');
const realtime = require('./realtime');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const CONFIG_DATA = path.join(ROOT, 'data');
const DATA = CONFIG_DATA;
const PAGES_DIR = path.join(ROOT, 'pages');
const PUBLIC = path.join(ROOT, 'public');
const STORE_FILE = path.join(DATA, 'store.json');
const ADMIN_FILE = path.join(DATA, 'admin.json');
const MAX_BODY = 25 * 1024 * 1024;
const STORAGE_BUCKET = 'sonna-uploads';
function supabaseStorageConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:') throw new Error('SUPABASE_URL must use HTTPS.');
  return { url: parsedUrl, key };
}
function publicStorageUrl(name) {
  const { url } = supabaseStorageConfig();
  return `${url.origin}/storage/v1/object/public/${STORAGE_BUCKET}/${encodeURIComponent(name)}`;
}
function uploadToSupabaseStorage(name, body, contentType) {
  const config = supabaseStorageConfig();
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: config.url.protocol,
      hostname: config.url.hostname,
      port: config.url.port || 443,
      method: 'POST',
      path: `/storage/v1/object/${STORAGE_BUCKET}/${encodeURIComponent(name)}`,
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': contentType,
        'Content-Length': body.length,
        'x-upsert': 'true'
      }
    }, response => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { responseBody += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error(`Supabase Storage upload failed (${response.statusCode}): ${responseBody.slice(0, 500)}`));
        }
        resolve(publicStorageUrl(name));
      });
    });
    request.setTimeout(30000, () => request.destroy(new Error('Supabase Storage upload timed out.')));
    request.on('error', reject);
    request.end(body);
  });
}
async function saveDataUrl(u, maxBytes = 8 * 1024 * 1024) {
  const m = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+\/=]+)$/.exec(u);
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > maxBytes) return null;
  const name = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20) + (m[1] === 'jpeg' ? '.jpg' : '.' + m[1]);
  return uploadToSupabaseStorage(name, buf, `image/${m[1]}`);
}
const USERS_FILE = path.join(DATA, 'users.json');
const ORDERS_FILE = path.join(DATA, 'orders.json');
const COMMUNITY_FILE = path.join(DATA, 'community.json');
const ACCOUNTS_FILE = path.join(DATA, 'accounts.json');
const SESSION_FILE = path.join(DATA, 'sessions.json');
const DEFAULTS = readJSONEarly(path.join(CONFIG_DATA, 'defaults.json'), { codes: {} });
const PAYMENT_FILE = path.join(DATA, 'payment.json');
const DEPOSITS_FILE = path.join(DATA, 'deposits.json');
function readJSONEarly(f, fallback) {
  if (!fs.existsSync(f)) return fallback;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

const NAV = readJSONEarly(path.join(CONFIG_DATA, 'nav.json'), [
  { k: 'Store', label: 'Cửa hàng', group: 'Khách' },
  { k: 'AdminDashboard', label: 'Tổng quan', group: 'Admin' },
  { k: 'AdminAccounts', label: 'Quản lý acc', group: 'Admin' },
  { k: 'AdminOrders', label: 'Đơn hàng', group: 'Admin' },
  { k: 'AdminPayments', label: 'Thanh toán', group: 'Admin' },
  { k: 'AdminUsers', label: 'Người dùng', group: 'Admin' },
  { k: 'AdminPromos', label: 'Khuyến mãi', group: 'Admin' },
  { k: 'AdminContent', label: 'Nội dung web', group: 'Admin' },
  { k: 'AdminRoles', label: 'Phân quyền & CTV', group: 'Admin' },
  { k: 'AdminFeatures', label: 'Sơ đồ tính năng', group: 'Admin' }
]);
const PAGE_KEYS = new Set(NAV.map(n => n.k));

// ---------- JSON file helpers ----------
function readJSON(file, fallback) {
  return cloudState.readJSON(file, fallback);
}
function writeJSON(file, obj) {
  cloudState.writeJSON(file, obj);
}
function commitState(updates) {
  cloudState.writeBatch(updates);
}
let store = readJSON(STORE_FILE, {});
const emptyAccounts = () => ({ listed: [], ov: {}, edits: {}, added: [], subPics: {}, accPics: {}, delSubs: {}, rulesData: null });
let accountsDb = readJSON(ACCOUNTS_FILE, null);
if (!accountsDb) accountsDb = store.acc && typeof store.acc === 'object' ? store.acc : emptyAccounts();
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// ---------- Admin account (scrypt) ----------
function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }
let admin = null;
const configuredAdminUser = typeof process.env.ADMIN_USER === 'string' ? process.env.ADMIN_USER.trim() : '';
const configuredAdminPassword = typeof process.env.ADMIN_PASSWORD === 'string' ? process.env.ADMIN_PASSWORD : '';
function initializeAdmin() {
  admin = readJSON(ADMIN_FILE, null);
  if (!admin) {
    const pw = configuredAdminPassword || crypto.randomBytes(6).toString('hex');
    const salt = crypto.randomBytes(16).toString('hex');
    admin = { username: configuredAdminUser || 'admin', salt, hash: hashPw(pw, salt) };
    writeJSON(ADMIN_FILE, admin);
    if (configuredAdminPassword) console.log(`\n[SONNA] Đã tạo tài khoản admin: ${admin.username} (mật khẩu lấy từ biến môi trường).\n`);
    else console.log(`\n[SONNA] Đã tạo tài khoản admin: ${admin.username} / ${pw}\n        (đặt ADMIN_USER, ADMIN_PASSWORD trong Render để cấu hình admin).\n`);
    return;
  }

  let changed = false;
  if (configuredAdminUser && configuredAdminUser !== admin.username) {
    admin.username = configuredAdminUser;
    changed = true;
  }
  if (configuredAdminPassword) {
    admin.salt = crypto.randomBytes(16).toString('hex');
    admin.hash = hashPw(configuredAdminPassword, admin.salt);
    changed = true;
  }
  if (changed) {
    writeJSON(ADMIN_FILE, admin);
    console.log(`[SONNA] Đã cập nhật tài khoản admin từ biến môi trường: ${admin.username}.`);
  }
}
function checkLogin(u, p) {
  if (typeof u !== 'string' || typeof p !== 'string') return false;
  const a = Buffer.from(hashPw(p, admin.salt), 'hex'), b = Buffer.from(admin.hash, 'hex');
  return u === admin.username && crypto.timingSafeEqual(a, b);
}

// ---------- Cấu hình nạp tiền tự động (SePay) ----------
const PAYMENT_TEMPLATE = {
  bankName: '',            // tên hiển thị, ví dụ: Vietcombank
  bankShortName: '',       // tên dùng tạo mã QR, ví dụ: Vietcombank (xem danh sách bank của SePay/VietQR)
  accountNumber: '',
  accountName: '',
  contentPrefix: 'SONNA',  // nội dung chuyển khoản = tiền tố + ID khách, ví dụ SONNA28
  qrTemplate: 'https://qr.sepay.vn/img?acc={acc}&bank={bank}&amount={amount}&des={des}',
  sepay: { apiKey: '', hmacSecret: '' }
};
function paymentSetting(name, fallback) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
const payCfg = () => {
  const saved = readJSON(PAYMENT_FILE, {});
  const savedSepay = saved.sepay && typeof saved.sepay === 'object' ? saved.sepay : {};
  return Object.assign({}, PAYMENT_TEMPLATE, saved, {
    bankName: paymentSetting('SONNA_BANK_NAME', saved.bankName || PAYMENT_TEMPLATE.bankName),
    bankShortName: paymentSetting('SONNA_BANK_SHORT_NAME', saved.bankShortName || PAYMENT_TEMPLATE.bankShortName),
    accountNumber: paymentSetting('SONNA_BANK_ACCOUNT_NUMBER', saved.accountNumber || PAYMENT_TEMPLATE.accountNumber),
    qrAccountNumber: paymentSetting('SONNA_BANK_VA_NUMBER', saved.qrAccountNumber || saved.accountNumber || PAYMENT_TEMPLATE.accountNumber),
    accountName: paymentSetting('SONNA_BANK_ACCOUNT_NAME', saved.accountName || PAYMENT_TEMPLATE.accountName),
    contentPrefix: paymentSetting('SONNA_PAYMENT_CONTENT_PREFIX', saved.contentPrefix || PAYMENT_TEMPLATE.contentPrefix),
    qrTemplate: paymentSetting('SONNA_PAYMENT_QR_TEMPLATE', saved.qrTemplate || PAYMENT_TEMPLATE.qrTemplate),
    sepay: Object.assign({}, PAYMENT_TEMPLATE.sepay, savedSepay, {
      apiKey: paymentSetting('SONNA_SEPAY_API_KEY', savedSepay.apiKey || PAYMENT_TEMPLATE.sepay.apiKey),
      hmacSecret: paymentSetting('SONNA_SEPAY_HMAC_SECRET', savedSepay.hmacSecret || PAYMENT_TEMPLATE.sepay.hmacSecret)
    })
  });
};
const payReady = () => { const c = payCfg(); return !!(c.accountNumber && c.bankShortName && (c.sepay && (c.sepay.apiKey || c.sepay.hmacSecret))); };
// Chỉ bật nạp giả lập khi được yêu cầu rõ ràng; mặc định an toàn cho triển khai thật.
const simTopup = () => process.env.SIM_TOPUP === '1' && !payReady();
function publicPayment() {
  const c = payCfg();
  return { ready: payReady(), bankName: c.bankName || c.bankShortName, bankShortName: c.bankShortName, accountNumber: c.accountNumber, qrAccountNumber: c.qrAccountNumber || c.accountNumber,
    accountName: c.accountName, contentPrefix: c.contentPrefix || 'SONNA', qrTemplate: c.qrTemplate };
}
function publicImages(images) {
  return Array.isArray(images)
    ? images.filter(image => {
      if (typeof image !== 'string') return false;
      if (/^\/uploads\/[a-f0-9]{20}\.(?:jpg|png|webp|gif)$/.test(image)) return true;
      try {
        const url = new URL(image);
        return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
      } catch (e) {
        return false;
      }
    }).slice(0, 5)
    : [];
}
function priceAmount(value) {
  return Number(String(value || '').replace(/\D/g, '')) || 0;
}
function activeGiftRules() {
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  return (Array.isArray(accountsDb.rulesData) ? accountsDb.rulesData : [])
    .filter(rule => rule && !rule.paused
      && Number.isSafeInteger(Number(rule.buy)) && Number(rule.buy) > 0
      && Number.isSafeInteger(Number(rule.give)) && Number(rule.give) > 0
      && (!rule.from || rule.from <= today)
      && (!rule.until || rule.until >= today));
}
function giftRulesForSub(sub) {
  return activeGiftRules()
    .filter(rule => (rule.buySubId && rule.buySubId === sub.id) || (!rule.buySubId && rule.buySub === sub.title))
    .sort((a, b) => Number(b.buy) - Number(a.buy) || Number(b.give) - Number(a.give));
}
function giftSubIdForRule(rule) {
  if (typeof rule.giveSubId === 'string' && rule.giveSubId) return rule.giveSubId;
  const giftSubs = store.catalog && Array.isArray(store.catalog.giftSubs) ? store.catalog.giftSubs : [];
  const catalogSub = giftSubs.find(sub => sub && sub.title === rule.giveSub && sub.id);
  if (catalogSub) return catalogSub.id;
  const editedSub = Object.keys(accountsDb.edits || {}).find(key =>
    key.endsWith(':t') && accountsDb.edits[key] === rule.giveSub);
  if (editedSub) return editedSub.slice(0, -2);
  const accountSubs = Array.from(new Set(accountRecords()
    .filter(account => account && account.cat === 'promo' && account.sub)
    .map(account => account.sub)));
  const matchingSub = accountSubs.filter(id => (accountsDb.edits || {})[id + ':t'] === rule.giveSub);
  return matchingSub.length === 1 ? matchingSub[0] : '';
}
function giftOfferForSub(sub) {
  const rule = giftRulesForSub(sub)[0];
  return rule ? { buy: Number(rule.buy), give: Number(rule.give) } : null;
}
function publicSales(limit) {
  const byId = new Map(accountRecords().filter(a => a && a.id).map(a => [a.id, a]));
  const seen = new Set();
  const recent = [];
  const catNames = {
    'reroll-android': 'Reroll Android', 'reroll-ios': 'Reroll iOS',
    'char-android': 'Character + Chrono Android', 'char-ios': 'Character + Chrono iOS',
    'team-meta': 'Team Meta'
  };
  (store.catalog && Array.isArray(store.catalog.categories) ? store.catalog.categories : []).forEach(category => {
    if (category && category.id && category.name) catNames[category.id] = category.name;
  });
  orders.forEach(order => {
    if (!order || !Array.isArray(order.inventoryIds) || ['Đã hoàn tiền', 'Đã hủy', 'Đã huỷ'].includes(order.status)) return;
    order.inventoryIds.forEach(id => {
      if (seen.has(id)) return;
      const account = byId.get(id);
      if (!account || account.del || account.status !== 'Đã bán') return;
      seen.add(id);
      const orderTitle = String(order.title || '').replace(/\s*[×x]\s*\d+\s*$/, '').trim();
      recent.push({
        title: String(account.title || '').trim() || orderTitle || 'Acc đã bán',
        category: catNames[account.cat] || 'Acc Dragon Ball Legends',
        soldAt: account.soldAt || order.createdAt || order.time || '',
        image: publicImages((accountsDb.accPics || {})[id])[0] || ''
      });
    });
  });
  recent.sort((a, b) => (Date.parse(b.soldAt) || 0) - (Date.parse(a.soldAt) || 0));
  return { count: seen.size, recent: recent.slice(0, limit) };
}
function publicStore() {
  const data = { ...store };
  delete data.acc;
  const display = data.salesDisplay && typeof data.salesDisplay === 'object' ? data.salesDisplay : {};
  const requestedSalesLimit = Math.floor(Number(display.limit) || 6);
  const salesLimit = [3, 6, 9, 12].includes(requestedSalesLimit) ? requestedSalesLimit : 6;
  const sales = publicSales(salesLimit);
  data.salesDisplay = { enabled: display.enabled !== false, limit: salesLimit };
  data.soldAccountCount = sales.count;
  data.recentSales = data.salesDisplay.enabled ? sales.recent : [];
  if (data.catalog && Array.isArray(data.catalog.subs)) {
    data.catalog = { ...data.catalog };
    delete data.catalog.giftSubs;
    const available = eligibleAccounts();
    data.catalog.subs = data.catalog.subs.map(sb => {
      const giftOffer = giftOfferForSub(sb);
      const configuredImages = publicImages((accountsDb.subPics || {})[sb.id]);
      const accountImages = available.filter(a => a.sub === sb.id)
        .flatMap(a => publicImages((accountsDb.accPics || {})[a.id]));
      return { ...sb, gift: !!giftOffer, giftOffer, pics: configuredImages.length ? configuredImages : accountImages.slice(0, 5) };
    });
    data.catalog.accts = available.map(a => {
      const price = priceAmount(a.price);
      const originalPrice = priceAmount(a.cost);
      const discountPercent = originalPrice > price && price > 0
        ? Math.round((originalPrice - price) * 100 / originalPrice) : 0;
      return {
        id: a.id, cat: a.cat, sub: a.sub, status: a.status, price,
        originalPrice: discountPercent ? originalPrice : 0, discountPercent,
        level: a.level, chrono: a.chrono, chars: a.chars,
        title: String(a.title || '').trim().slice(0, 100),
        info: String(a.info || '').trim().slice(0, 300),
        pics: publicImages((accountsDb.accPics || {})[a.id])
      };
    });
  }
  return data;
}
let deposits = readJSON(DEPOSITS_FILE, []);
const depositIds = new Set(deposits.map(d => String(d.txId)));
function verifySepay(req, raw) {
  const c = payCfg().sepay || {};
  let ok = false;
  const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  if (c.apiKey) { const h = String(req.headers['authorization'] || ''); if (h.startsWith('Apikey ') && eq(h.slice(7), c.apiKey)) ok = true; }
  if (!ok && c.hmacSecret) {
    const ts = String(req.headers['x-sepay-timestamp'] || ''), sig = String(req.headers['x-sepay-signature'] || '');
    if (ts && Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) <= 300) {
      const exp = 'sha256=' + crypto.createHmac('sha256', c.hmacSecret).update(ts + '.' + raw).digest('hex');
      if (eq(exp, sig)) ok = true;
    }
  }
  return ok;
}
function handleSepay(payload) {
  const cfg = payCfg();
  if (String(payload.transferType || '').trim().toLowerCase() !== 'in') return { result: 'ignored', reason: 'not_incoming' };
  const txId = String(payload.id);
  if (!payload.id) return { result: 'ignored', reason: 'missing_transaction_id' };
  const previousIndex = deposits.findIndex(deposit => String(deposit.txId) === txId);
  const previous = previousIndex >= 0 ? deposits[previousIndex] : null;
  const retryingAccountMismatch = !!(previous && previous.status === 'ignored' && previous.reason === 'account_mismatch');
  if (previous && !retryingAccountMismatch) {
    return { result: 'duplicate', previousStatus: previous.status || 'processed', reason: previous.reason || undefined };
  }
  const rec = { txId, amount: Math.floor(Number(payload.transferAmount)) || 0, content: String(payload.content || ''), bank: payload.gateway || '', time: new Date().toISOString(), bankTime: payload.transactionDate || '' };
  const ignore = reason => {
    Object.assign(rec, { status: 'ignored', reason });
    const nextDeposits = deposits.slice();
    if (retryingAccountMismatch) nextDeposits[previousIndex] = rec;
    else nextDeposits.push(rec);
    commitState({ [DEPOSITS_FILE]: nextDeposits });
    deposits = nextDeposits;
    depositIds.add(txId);
    return { result: 'ignored', reason };
  };
  if (cfg.accountNumber && payload.accountNumber && String(payload.accountNumber).replace(/\s/g, '') !== String(cfg.accountNumber).replace(/\s/g, '')) return ignore('account_mismatch');
  const amount = Math.floor(Number(payload.transferAmount));
  if (!Number.isFinite(amount) || amount < 1) return ignore('invalid_amount');
  const prefix = String(cfg.contentPrefix || 'SONNA').replace(/[^A-Za-z0-9]/g, '');
  const m = new RegExp(prefix + '[\\s_-]*(\\d{1,9})', 'i').exec(rec.content);
  const u = m ? usersDb.users.find(x => x.id === Number(m[1])) : null;
  const nextDeposits = deposits.slice();
  if (retryingAccountMismatch) nextDeposits[previousIndex] = rec;
  else nextDeposits.push(rec);
  if (u) {
    const bonus = topupBonus(amount);
    Object.assign(rec, { status: 'credited', userId: u.id, username: u.username, bonus });
    const nextUsers = JSON.parse(JSON.stringify(usersDb));
    const nextUser = nextUsers.users.find(x => x.id === u.id);
    nextUser.wallet += amount + bonus;
    commitState({ [USERS_FILE]: nextUsers, [DEPOSITS_FILE]: nextDeposits });
    usersDb = nextUsers;
  } else {
    Object.assign(rec, { status: 'unmatched' }); // không tìm thấy khách: admin xử lý tay
    commitState({ [DEPOSITS_FILE]: nextDeposits });
  }
  deposits = nextDeposits;
  depositIds.add(txId);
  return u ? { result: 'credited' } : { result: 'unmatched', reason: m ? 'member_not_found' : 'payment_reference_not_found' };
}

// ---------- Khách hàng: users.json, orders.json ----------
let usersDb = readJSON(USERS_FILE, { nextId: 28, users: [] });
let orders = readJSON(ORDERS_FILE, []);
let communityDb = readJSON(COMMUNITY_FILE, { nextPostId: 1, posts: [] });
if (!communityDb || !Array.isArray(communityDb.posts)) communityDb = { nextPostId: 1, posts: [] };
if (!Array.isArray(communityDb.messages)) communityDb.messages = [];
if (!Array.isArray(communityDb.notifications)) communityDb.notifications = [];
if (!Array.isArray(communityDb.reports)) communityDb.reports = [];
communityDb.nextPostId = Math.max(Number(communityDb.nextPostId) || 1, ...communityDb.posts.map(post => Number(post.id) + 1 || 1));
communityDb.nextNotificationId = Math.max(Number(communityDb.nextNotificationId) || 1, ...communityDb.notifications.map(notification => Number(notification.id) + 1 || 1));
communityDb.nextReportId = Math.max(Number(communityDb.nextReportId) || 1, ...communityDb.reports.map(report => Number(report.id) + 1 || 1));
function publicCommunityPost(post) {
  const author = usersDb.users.find(user => user.id === post.userId);
  return {
    id: post.id, category: post.category, title: post.title, body: post.body,
    status: post.status === 'pending' || post.status === 'rejected' ? post.status : 'approved',
    locked: !!post.locked,
    images: Array.isArray(post.images) ? post.images : [], likes: Array.isArray(post.likes) ? post.likes.length : 0,
    comments: Array.isArray(post.comments) ? post.comments.map(comment => {
      const commenter = usersDb.users.find(user => user.id === comment.userId);
      return [commenter ? commenter.username : 'Thành viên', comment.text];
    }) : [],
    author: post.isAdmin ? 'SONNA Admin' : author ? author.username : 'Tài khoản đã khóa',
    initial: post.isAdmin ? 'S' : author ? author.username.slice(0, 1).toUpperCase() : '?',
    isAdmin: !!post.isAdmin, verified: !!author, pinned: !!post.pinned, time: fmtTime(new Date(post.createdAt))
  };
}
function communityNotification(userId, type, post, actor, text) {
  if (!userId || userId === actor.id) return;
  communityDb.notifications.push({
    id: communityDb.nextNotificationId++, userId, type, postId: post.id,
    actorId: actor.id, text, createdAt: new Date().toISOString(), readAt: ''
  });
}
function communityConversationId(userId, otherUserId) {
  const ids = [Number(userId), Number(otherUserId)].sort((a, b) => a - b);
  return 'dm-' + ids[0] + '-' + ids[1];
}
function communityAdminConversationId(userId) {
  return 'dm-admin-' + Number(userId);
}
const cSessions = new Map(); // token -> {id, exp}
function getCookie(req, name) {
  const m = new RegExp('(?:^|;\\s*)' + name + '=([a-f0-9]{48})').exec(req.headers.cookie || '');
  return m ? m[1] : null;
}
function getUser(req) {
  const t = getCookie(req, 'cid'); if (!t) return null;
  const s = cSessions.get(t);
  if (!s || s.exp < Date.now()) { cSessions.delete(t); return null; }
  const user = usersDb.users.find(u => u.id === s.id) || null;
  return user && !user.locked ? user : null;
}
function accountRecords() {
  const base = (accountsDb.listed || []).concat(accountsDb.added || []);
  const overrides = accountsDb.ov || {};
  return base.map(a => ({ ...a, ...(overrides[a.id] || {}) }));
}
function renameAccountId(oldId, newId) {
  const base = (accountsDb.listed || []).concat(accountsDb.added || []);
  const matches = base.filter(a => a && a.id === oldId);
  if (!matches.length) return { status: 404, error: 'Không tìm thấy acc cần đổi mã.' };
  if (matches.length > 1) return { status: 409, error: 'Mã acc đang bị trùng trong kho; chưa thể đổi.' };
  const account = accountRecords().find(a => a && a.id === oldId);
  if (!account) return { status: 404, error: 'Không tìm thấy acc cần đổi mã.' };
  if (['Đã bán', 'Đã đặt giữ', 'Đã tặng'].includes(account.status)) {
    return { status: 409, error: 'Acc đã bán, đặt giữ hoặc đã tặng không thể đổi mã.' };
  }
  if (base.some(a => a && a.id !== oldId && String(a.id).toLowerCase() === newId.toLowerCase())) {
    return { status: 409, error: 'Mã acc mới đã tồn tại.' };
  }

  const nextAccounts = JSON.parse(JSON.stringify(accountsDb));
  ['listed', 'added'].forEach(key => {
    if (Array.isArray(nextAccounts[key])) {
      nextAccounts[key] = nextAccounts[key].map(a => a && a.id === oldId ? { ...a, id: newId } : a);
    }
  });
  ['ov', 'edits', 'accPics'].forEach(key => {
    const map = nextAccounts[key];
    if (map && Object.prototype.hasOwnProperty.call(map, oldId)) {
      nextAccounts[key] = { ...map, [newId]: map[oldId] };
      delete nextAccounts[key][oldId];
    }
  });

  const nextStore = JSON.parse(JSON.stringify(store));
  if (nextStore.sold && Object.prototype.hasOwnProperty.call(nextStore.sold, oldId)) {
    nextStore.sold[newId] = (Number(nextStore.sold[newId]) || 0) + (Number(nextStore.sold[oldId]) || 0);
    delete nextStore.sold[oldId];
  }
  if (nextStore.itemOrder && typeof nextStore.itemOrder === 'object') {
    Object.keys(nextStore.itemOrder).forEach(key => {
      const ids = nextStore.itemOrder[key];
      if (Array.isArray(ids)) nextStore.itemOrder[key] = Array.from(new Set(ids.map(id => id === oldId ? newId : id)));
    });
  }
  if (nextStore.catalog && Array.isArray(nextStore.catalog.accts)) {
    nextStore.catalog.accts = nextStore.catalog.accts.map(a => a && a.id === oldId ? { ...a, id: newId } : a);
  }
  const nextOrders = orders.map(order => ({
    ...order,
    itemId: order.itemId === oldId ? newId : order.itemId,
    inventoryIds: Array.isArray(order.inventoryIds) ? order.inventoryIds.map(id => id === oldId ? newId : id) : order.inventoryIds
  }));
  commitState({ [ACCOUNTS_FILE]: nextAccounts, [STORE_FILE]: nextStore, [ORDERS_FILE]: nextOrders });
  accountsDb = nextAccounts;
  store = nextStore;
  orders = nextOrders;
  return { status: 200, store: nextStore };
}
function eligibleAccounts() {
  return accountRecords().filter(a => a && a.cat !== 'promo' && !a.del && a.status === 'Đang bán' && String(a.tk || '').trim() && String(a.mk || '').trim());
}
function publicUser(u) { return u ? { id: u.id, username: u.username, wallet: u.wallet, usedCodes: u.usedCodes, communityPostAutoApprove: !!u.communityPostAutoApprove } : null; }
function userOrders(u) { return orders.filter(o => o.userId === u.id).reverse().map(({ userId, ...o }) => o); }
function fmtTime(d) {
  const t = new Date(d.getTime() + 7 * 3600 * 1000); // giờ Việt Nam
  const p = n => String(n).padStart(2, '0');
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)}/${t.getUTCFullYear()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

// Danh mục sản phẩm do máy chủ quyết định (giá, kho) - giống logic cửa hàng
function resolveItems() {
  const cat = store.catalog;
  if (!cat || !Array.isArray(cat.subs)) return [];
  const MAPC = { 'reroll-android': 'ra', 'reroll-ios': 'ri', 'char-android': 'ca', 'char-ios': 'ci', 'team-meta': 'tm' };
  const customCategoryIds = new Set();
  (Array.isArray(cat.categories) ? cat.categories : []).forEach(category => {
    if (category && typeof category.id === 'string' && typeof category.name === 'string') {
      MAPC[category.id] = category.id;
      customCategoryIds.add(category.id);
    }
  });
  const eligible = eligibleAccounts();
  const packs = cat.subs.filter(sb => MAPC[sb.cat] && sb.title).map(sb => ({
    id: sb.id, cat: MAPC[sb.cat], title: sb.title, isPack: true, gift: !!sb.gift,
    price: Number(sb.price) || 0, stock: eligible.filter(a => a.sub === sb.id).length
  }));
  const singles = eligible.filter(a => ['char-android', 'char-ios', 'team-meta'].indexOf(a.cat) >= 0 || customCategoryIds.has(a.cat))
    .filter(a => !a.sub)
    .map(a => ({
      id: a.id, cat: MAPC[a.cat], isPack: false, title: String(a.title || '').trim() || 'Acc #' + a.id,
      stock: 1, price: priceAmount(a.price), originalPrice: priceAmount(a.cost),
      discountPercent: priceAmount(a.cost) > priceAmount(a.price) && priceAmount(a.price) > 0
        ? Math.round((priceAmount(a.cost) - priceAmount(a.price)) * 100 / priceAmount(a.cost)) : 0
    }));
  return packs.concat(singles);
}
const SC = { 'Tất cả danh mục': 'all', 'Acc Reroll iOS': 'ri', 'Acc Reroll Android': 'ra', 'Acc Character + Chrono iOS': 'ci', 'Acc Character + Chrono Android': 'ca', 'Team Meta': 'tm' };
if (store.catalog && Array.isArray(store.catalog.categories)) {
  store.catalog.categories.forEach(category => {
    if (category && category.name && category.id) SC[category.name] = category.id;
  });
}
function parseD(x) { const m = /^(\d+)\/(\d+)\/(\d+)$/.exec(x || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1], 23, 59, 59) : null; }
function couponTable() {
  if (Array.isArray(store.codes)) {
    const out = {};
    store.codes.forEach(c => { const dd = parseD(c.until); out[String(c.code).toUpperCase()] = { kind: c.kind, val: Number(c.val) || 0, min: Number(c.min) || 0, cap: Number(c.cap) || 0, scope: SC[c.scope] || 'all', scopeLabel: c.scope, until: c.until, expired: c.status === 'expired' || !!(dd && dd < new Date()), paused: c.status === 'paused', full: c.limit > 0 && c.used >= c.limit, _shared: true }; });
    return out;
  }
  return JSON.parse(JSON.stringify(DEFAULTS.codes));
}
const money = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '₫';
function evalCoupon(raw, user, item, price) {
  const code = String(raw || '').trim().toUpperCase();
  if (!code) return null;
  const c = couponTable()[code];
  if (!c) return { error: 'Mã ' + code + ' không tồn tại.' };
  if (c.expired) return { error: 'Mã ' + code + ' đã hết hạn.' };
  if (c.paused) return { error: 'Mã ' + code + ' đang tạm dừng.' };
  if (c.full) return { error: 'Mã ' + code + ' đã hết lượt dùng.' };
  if ((user.usedCodes || []).includes(code)) return { error: 'Bạn đã dùng mã ' + code + ' rồi.' };
  if (c.scope !== 'all' && c.scope !== item.cat) return { error: 'Mã ' + code + ' không áp dụng cho đơn này.' };
  if (price < c.min) return { error: 'Đơn cần từ ' + money(c.min) + ' để dùng mã ' + code + '.' };
  let d = c.kind === 'pct' ? Math.round(price * c.val / 100) : c.val;
  if (c.kind === 'pct' && c.cap > 0 && d > c.cap) d = c.cap;
  if (d > price) d = price;
  return { code, discount: d, shared: !!c._shared };
}
function createOrder(user, body) {
  const qtyIn = Math.floor(Number(body.qty) || 1);
  const item = resolveItems().find(i => i.id === body.itemId);
  if (!item) return { status: 404, error: 'Không tìm thấy sản phẩm.' };
  const qty = item.isPack ? qtyIn : 1;
  if (qty < 1 || !Number.isSafeInteger(qty)) return { status: 400, error: 'Số lượng không hợp lệ.' };
  if (qty > item.stock) return { status: 409, error: item.stock > 0 ? 'Chỉ còn ' + item.stock + ' acc.' : 'Sản phẩm đã hết hàng hoặc chưa có TK|MK thật.' };
  const price = item.price * qty;
  if (!Number.isSafeInteger(price) || price < 1) return { status: 409, error: 'Sản phẩm chưa có giá bán hợp lệ.' };
  const cp = evalCoupon(body.code, user, item, price);
  if (cp && cp.error) return { status: 400, error: cp.error };
  const discount = cp ? cp.discount : 0;
  const total = price - discount;
  if (user.wallet < total) return { status: 402, error: 'Số dư ví không đủ.' };
  const candidates = eligibleAccounts().filter(a => item.isPack ? a.sub === item.id : a.id === item.id);
  if (candidates.length < qty) return { status: 409, error: 'Kho vừa thay đổi. Vui lòng tải lại trang và thử lại.' };

  const productSub = (store.catalog && store.catalog.subs || []).find(sub => sub.id === item.id);
  const giftRule = productSub && giftRulesForSub(productSub).find(rule => qty >= Number(rule.buy));
  let gifted = [];
  if (giftRule) {
    const giftSubId = giftSubIdForRule(giftRule);
    if (!giftSubId) return { status: 409, error: 'Chưa xác định được thư mục acc quà tặng. Vui lòng báo admin kiểm tra quy tắc khuyến mãi.' };
    const giftQty = Math.floor(qty / Number(giftRule.buy)) * Number(giftRule.give);
    const giftCandidates = accountRecords().filter(a => a && a.cat === 'promo' && a.sub === giftSubId && !a.del
      && a.status === 'Trong kho' && String(a.tk || '').trim() && String(a.mk || '').trim());
    if (giftCandidates.length < giftQty) {
      return { status: 409, error: 'Kho quà tặng hiện không đủ để áp dụng khuyến mãi. Giao dịch chưa bị trừ tiền.' };
    }
    gifted = giftCandidates.slice(0, giftQty);
  }

  const seq = orders.length;
  const orderId = 'DH-' + (20853 + seq);
  const assigned = candidates.slice(0, qty);
  const allAssigned = assigned.concat(gifted);
  const order = {
    code: orderId, userId: user.id, title: item.title + (item.isPack ? ' × ' + qty : ''),
    itemId: item.id, qty, coupon: cp ? cp.code : '', discount, total, time: fmtTime(new Date()),
    createdAt: new Date().toISOString(), status: 'Đã thanh toán', inventoryIds: allAssigned.map(a => a.id),
    accs: assigned.map(a => ({ line: a.tk + '|' + a.mk, tag: 'Acc mua', col: '#14744E' }))
      .concat(gifted.map(a => ({ line: a.tk + '|' + a.mk, tag: 'Quà tặng', col: '#8A4B00' })))
  };
  const nextUsers = JSON.parse(JSON.stringify(usersDb));
  const nextUser = nextUsers.users.find(x => x.id === user.id);
  const nextOrders = orders.concat(order);
  const nextAccounts = JSON.parse(JSON.stringify(accountsDb));
  const nextStore = JSON.parse(JSON.stringify(store));
  nextUser.wallet -= total;
  if (cp) {
    nextUser.usedCodes = nextUser.usedCodes || [];
    nextUser.usedCodes.push(cp.code);
    if (cp.shared) { const row = nextStore.codes.find(c => String(c.code).toUpperCase() === cp.code); if (row) row.used = (Number(row.used) || 0) + 1; }
  }
  assigned.forEach(a => {
    nextAccounts.ov = nextAccounts.ov || {};
    nextAccounts.ov[a.id] = { ...(nextAccounts.ov[a.id] || {}), status: 'Đã bán', orderId, soldAt: new Date().toISOString(), soldTo: user.id };
  });
  gifted.forEach(a => {
    nextAccounts.ov = nextAccounts.ov || {};
    nextAccounts.ov[a.id] = { ...(nextAccounts.ov[a.id] || {}), status: 'Đã tặng', orderId, giftedAt: new Date().toISOString(), giftedTo: user.id };
  });
  nextStore.sold = Object.assign({}, nextStore.sold, { [item.id]: ((nextStore.sold || {})[item.id] || 0) + qty });
  commitState({ [USERS_FILE]: nextUsers, [ORDERS_FILE]: nextOrders, [ACCOUNTS_FILE]: nextAccounts, [STORE_FILE]: nextStore });
  usersDb = nextUsers; orders = nextOrders; accountsDb = nextAccounts; store = nextStore;
  const { userId, ...pub } = order;
  const sales = publicStore();
  return { status: 200, order: pub, user: publicUser(nextUser), sold: store.sold,
    recentSales: sales.recentSales, soldAccountCount: sales.soldAccountCount, salesDisplay: sales.salesDisplay,
    catalog: sales.catalog };
}
function topupBonus(amount) {
  const TP = Object.assign({ enabled: false, pct: '5', min: '0', cap: '' }, store.topup || {});
  const pct = parseFloat(String(TP.pct).replace(',', '.')) || 0;
  const min = parseInt(String(TP.min).replace(/\D/g, ''), 10) || 0;
  const cap = parseInt(String(TP.cap).replace(/\D/g, ''), 10) || 0;
  let bonus = (TP.enabled !== false && amount >= min) ? Math.round(amount * pct / 100) : 0;
  if (cap > 0 && bonus > cap) bonus = cap;
  return bonus;
}

// ---------- Sessions ----------
const sessions = new Map(); // token -> expiry
const SESSION_MS = 8 * 3600 * 1000;
let savedSessions = readJSON(SESSION_FILE, { admin: [], customer: [] });
const now = Date.now();
((savedSessions && Array.isArray(savedSessions.admin)) ? savedSessions.admin : []).forEach(([token, expires]) => { if (/^[a-f0-9]{48}$/.test(token) && Number(expires) > now) sessions.set(token, Number(expires)); });
((savedSessions && Array.isArray(savedSessions.customer)) ? savedSessions.customer : []).forEach(([token, entry]) => { if (/^[a-f0-9]{48}$/.test(token) && entry && Number(entry.exp) > now) cSessions.set(token, { id: Number(entry.id), exp: Number(entry.exp) }); });
function saveSessions() {
  writeJSON(SESSION_FILE, {
    admin: Array.from(sessions.entries()).filter(([, exp]) => exp > Date.now()),
    customer: Array.from(cSessions.entries()).filter(([, entry]) => entry.exp > Date.now())
  });
}
function getToken(req) {
  const m = /(?:^|;\s*)sid=([a-f0-9]{48})/.exec(req.headers.cookie || '');
  return m ? m[1] : null;
}
function isAuthed(req) {
  const t = getToken(req); if (!t) return false;
  const exp = sessions.get(t);
  if (!exp || exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
const fails = new Map(); // ip -> {n, until}
function limited(ip) { const f = fails.get(ip); return f && f.n >= 5 && f.until > Date.now(); }
const registrationAttempts = new Map();
function registrationLimited(ip) {
  const now = Date.now();
  let entry = registrationAttempts.get(ip);
  if (!entry || entry.until <= now) entry = { count: 0, until: now + 15 * 60 * 1000 };
  if (entry.count >= 5) return true;
  entry.count++;
  registrationAttempts.set(ip, entry);
  if (registrationAttempts.size > 1000) {
    registrationAttempts.forEach((value, key) => { if (value.until <= now) registrationAttempts.delete(key); });
  }
  return false;
}

// ---------- HTTP helpers ----------
function send(res, status, obj, headers) {
  return cloudState.flush().then(() => {
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
    res.end(JSON.stringify(obj));
  }).catch(error => {
    console.error('[SONNA] Supabase state persistence failed:', error);
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Không thể lưu dữ liệu lên Supabase. Yêu cầu chưa được xác nhận.' }));
    }
  });
}
function readRaw(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function readBody(req) { return readRaw(req).then(t => (t ? JSON.parse(t) : {})); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const SUPABASE_BROWSER_SDK = path.join(ROOT, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');

// ---------- Router ----------
async function handle(req, res) {
  let url;
  try { url = new URL(req.url, 'http://x'); }
  catch (e) { res.writeHead(400); return res.end('Bad request'); }
  const p = url.pathname;
  const ip = req.socket.remoteAddress;

  if (p.startsWith('/api/')) {
    try {
      if (p === '/api/session' && req.method === 'GET') {
        const cu = getUser(req);
        return send(res, 200, { authed: isAuthed(req), nav: NAV, store: publicStore(), user: publicUser(cu), orders: cu ? userOrders(cu) : [], payment: publicPayment(), simTopup: simTopup(), realtime: realtime.publicClientConfig() });
      }
      if (p === '/api/login' && req.method === 'POST') {
        if (limited(ip)) return send(res, 429, { error: 'Thử sai quá nhiều lần, vui lòng đợi vài phút.' });
        const b = await readBody(req);
        if (!checkLogin(b.username, b.password)) {
          const f = fails.get(ip) || { n: 0 }; f.n++; f.until = Date.now() + 5 * 60000; fails.set(ip, f);
          return send(res, 401, { error: 'Sai tên đăng nhập hoặc mật khẩu.' });
        }
        fails.delete(ip);
        const t = crypto.randomBytes(24).toString('hex');
        sessions.set(t, Date.now() + SESSION_MS);
        saveSessions();
        const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
        return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}` });
      }
      if (p === '/api/logout' && req.method === 'POST') {
        const t = getToken(req); if (t) sessions.delete(t);
        saveSessions();
        const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
        return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}` });
      }
      // ----- webhook SePay (tiền vào tài khoản -> cộng ví) -----
      if (p === '/api/webhook/sepay' && req.method === 'POST') {
        const raw = await readRaw(req);
        if (!verifySepay(req, raw)) return send(res, 401, { success: false });
        let payload; try { payload = JSON.parse(raw); } catch (e) { return send(res, 400, { success: false }); }
        const result = handleSepay(payload);
        return send(res, 200, Object.assign({ success: true }, result));
      }
      if (p === '/api/admin/deposits' && req.method === 'GET') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập.' });
        return send(res, 200, { deposits: deposits.slice().reverse() });
      }
      // ----- khách hàng -----
      if (p === '/api/user/me' && req.method === 'GET') {
        const u = getUser(req);
        return send(res, 200, { user: publicUser(u), orders: u ? userOrders(u) : [] });
      }
      if (p === '/api/community/posts' && req.method === 'GET') {
        const viewer = getUser(req);
        return send(res, 200, { posts: communityDb.posts.filter(post => !post.deletedAt && post.status !== 'pending' && post.status !== 'rejected').slice().reverse().map(post => ({
          ...publicCommunityPost(post), likedByMe: !!(viewer && Array.isArray(post.likes) && post.likes.includes(viewer.id))
        })) });
      }
      if (p === '/api/community/members' && req.method === 'GET') {
        const members = usersDb.users.filter(user => !user.locked).map(user => ({
          id: user.id, username: user.username,
          postCount: communityDb.posts.filter(post => post.userId === user.id && !post.deletedAt && post.status !== 'pending' && post.status !== 'rejected').length
        }));
        return send(res, 200, { members });
      }
      if (p === '/api/community/posts' && req.method === 'POST') {
        const user = getUser(req);
        if (!user) return send(res, 401, { error: 'Đăng nhập thành viên để đăng bài.' });
        const body = await readBody(req);
        const category = String(body.category || '').trim();
        const title = String(body.title || '').trim();
        const text = String(body.body || '').trim();
        const allowedCategories = ['Thảo luận chung', 'Hướng dẫn / Build đội hình', 'Sự kiện', 'Khoe acc', 'Tìm bang hội', 'Góp ý'];
        const images = Array.isArray(body.images) ? body.images : [];
        if (!allowedCategories.includes(category) || !title || title.length > 100 || !text || text.length > 1200) return send(res, 400, { error: 'Chuyên mục, tiêu đề hoặc nội dung không hợp lệ.' });
        if (images.length > 8 || images.some(image => typeof image !== 'string' || !/^\/uploads\/[a-f0-9]{20}\.(?:jpg|png|webp|gif)$/.test(image))) return send(res, 400, { error: 'Ảnh đính kèm không hợp lệ (tối đa 8 ảnh).' });
        const post = { id: communityDb.nextPostId++, userId: user.id, category, title, body: text, images, likes: [], comments: [], status: user.communityPostAutoApprove ? 'approved' : 'pending', locked: false, pinned: false, createdAt: new Date().toISOString() };
        communityDb.posts.push(post);
        writeJSON(COMMUNITY_FILE, communityDb);
        return send(res, 201, { post: publicCommunityPost(post) });
      }
      const communityActionMatch = /^\/api\/community\/posts\/(\d+)\/(comments|likes|reports)$/.exec(p);
      if (communityActionMatch && req.method === 'POST') {
        const user = getUser(req);
        if (!user) return send(res, 401, { error: 'Đăng nhập thành viên để tương tác.' });
        const post = communityDb.posts.find(entry => entry.id === Number(communityActionMatch[1]) && !entry.deletedAt);
        if (!post) return send(res, 404, { error: 'Không tìm thấy bài viết.' });
        if (post.status === 'pending' || post.status === 'rejected') return send(res, 404, { error: 'Bài viết chưa được duyệt.' });
        if (post.locked && communityActionMatch[2] !== 'reports') return send(res, 423, { error: 'Bài viết đã khóa tương tác.' });
        if (communityActionMatch[2] === 'comments') {
          const text = String((await readBody(req)).text || '').trim();
          if (!text || text.length > 240) return send(res, 400, { error: 'Bình luận cần từ 1 đến 240 ký tự.' });
          post.comments = Array.isArray(post.comments) ? post.comments : [];
          post.comments.push({ userId: user.id, text, createdAt: new Date().toISOString() });
          communityNotification(post.userId, 'reply', post, user, user.username + ' đã trả lời bài viết "' + post.title + '".');
          const mentions = new Set((text.match(/@[A-Za-z0-9_.-]{3,30}/g) || []).map(name => name.slice(1).toLowerCase()));
          usersDb.users.filter(member => mentions.has(member.username.toLowerCase())).forEach(member => {
            communityNotification(member.id, 'mention', post, user, user.username + ' đã nhắc đến bạn trong một bình luận.');
          });
        } else if (communityActionMatch[2] === 'likes') {
          post.likes = Array.isArray(post.likes) ? post.likes : [];
          if (post.likes.includes(user.id)) post.likes = post.likes.filter(id => id !== user.id);
          else post.likes.push(user.id);
        } else {
          const reason = String((await readBody(req)).reason || '').trim();
          if (!reason || reason.length > 300) return send(res, 400, { error: 'Vui lòng nhập lý do báo cáo (tối đa 300 ký tự).' });
          if (communityDb.reports.some(report => report.postId === post.id && report.userId === user.id && report.status === 'open')) return send(res, 409, { error: 'Bạn đã báo cáo bài viết này; admin sẽ xem xét.' });
          communityDb.reports.push({ id: communityDb.nextReportId++, postId: post.id, userId: user.id, reason, status: 'open', createdAt: new Date().toISOString() });
        }
        writeJSON(COMMUNITY_FILE, communityDb);
        return send(res, 200, { post: publicCommunityPost(post) });
      }
      if (p === '/api/community/notifications' && req.method === 'GET') {
        const user = getUser(req);
        if (!user) return send(res, 401, { error: 'Đăng nhập thành viên để xem thông báo.' });
        const memberNotifications = communityDb.notifications.filter(item => item.userId === user.id);
        const notifications = memberNotifications.slice().reverse().slice(0, 50);
        return send(res, 200, { notifications, unreadCount: memberNotifications.filter(item => !item.readAt).length });
      }
      if (p === '/api/community/notifications/read-all' && req.method === 'POST') {
        const user = getUser(req);
        if (!user) return send(res, 401, { error: 'Đăng nhập thành viên để cập nhật thông báo.' });
        const readAt = new Date().toISOString();
        communityDb.notifications.forEach(item => { if (item.userId === user.id && !item.readAt) item.readAt = readAt; });
        writeJSON(COMMUNITY_FILE, communityDb);
        return send(res, 200, { ok: true });
      }
      const communityNotificationMatch = /^\/api\/community\/notifications\/(\d+)\/read$/.exec(p);
      if (communityNotificationMatch && req.method === 'POST') {
        const user = getUser(req);
        if (!user) return send(res, 401, { error: 'Đăng nhập thành viên để cập nhật thông báo.' });
        const notification = communityDb.notifications.find(item => item.id === Number(communityNotificationMatch[1]) && item.userId === user.id);
        if (!notification) return send(res, 404, { error: 'Không tìm thấy thông báo.' });
        notification.readAt = notification.readAt || new Date().toISOString();
        writeJSON(COMMUNITY_FILE, communityDb);
        return send(res, 200, { ok: true });
      }
      const communityMemberMatch = /^\/api\/community\/members\/([A-Za-z0-9_.-]{3,30})$/.exec(p);
      if (communityMemberMatch && req.method === 'GET') {
        const username = decodeURIComponent(communityMemberMatch[1]);
        const adminViewer = isAuthed(req);
        const user = usersDb.users.find(entry => entry.username.toLowerCase() === username.toLowerCase() && (!entry.locked || adminViewer));
        if (!user) return send(res, 404, { error: 'Không tìm thấy thành viên.' });
        const memberPosts = communityDb.posts.filter(post => post.userId === user.id && !post.deletedAt && post.status !== 'pending' && post.status !== 'rejected').slice().reverse().map(publicCommunityPost);
        const memberOrders = orders.filter(order => order.userId === user.id);
        const reputation = memberPosts.reduce((total, post) => total + (Number(post.likes) || 0), 0);
        const rank = memberPosts.length >= 50 ? 'Thành viên nòng cốt' : memberPosts.length >= 10 ? 'Thành viên tích cực' : 'Thành viên mới';
        return send(res, 200, { profile: { id: user.id, username: user.username, createdAt: user.createdAt, postCount: memberPosts.length, reputation, rank, orderCount: memberOrders.length, locked: !!user.locked }, posts: memberPosts });
      }
      if (p === '/api/community/images' && req.method === 'POST') {
        if (!getUser(req)) return send(res, 401, { error: 'Đăng nhập thành viên để tải ảnh.' });
        const body = await readBody(req);
        const imageUrl = await saveDataUrl(String(body.dataUrl || ''));
        if (!imageUrl) return send(res, 400, { error: 'Ảnh không hợp lệ hoặc vượt quá 8 MB (JPG, PNG, WebP, GIF).' });
        return send(res, 201, { url: imageUrl });
      }
      if (p === '/api/community/chat' && (req.method === 'GET' || req.method === 'POST')) {
        const user = getUser(req);
        if (!user) return send(res, 401, { error: 'Đăng nhập thành viên để sử dụng chat.' });
        let conversationId = 'group';
        let otherUser = null;
        const withName = String(url.searchParams.get('with') || '').trim();
        if (req.method === 'POST') {
          const body = await readBody(req);
          const requestedRecipient = String(body.with || '').trim();
          if (requestedRecipient) {
            if (requestedRecipient.toLowerCase() === 'sonna admin' || requestedRecipient.toLowerCase() === 'admin') {
              conversationId = communityAdminConversationId(user.id);
            } else {
              otherUser = usersDb.users.find(entry => entry.username.toLowerCase() === requestedRecipient.toLowerCase() && !entry.locked);
              if (!otherUser || otherUser.id === user.id) return send(res, 404, { error: 'Không tìm thấy thành viên để nhắn riêng.' });
              conversationId = communityConversationId(user.id, otherUser.id);
            }
          }
          const text = String(body.text || '').trim();
          if (!text || text.length > 500) return send(res, 400, { error: 'Tin nhắn cần từ 1 đến 500 ký tự.' });
          communityDb.messages.push({ conversationId, senderId: user.id, senderRole: 'member', text, createdAt: new Date().toISOString() });
          writeJSON(COMMUNITY_FILE, communityDb);
        } else if (withName) {
          if (withName.toLowerCase() === 'sonna admin' || withName.toLowerCase() === 'admin') {
            conversationId = communityAdminConversationId(user.id);
          } else {
            otherUser = usersDb.users.find(entry => entry.username.toLowerCase() === withName.toLowerCase() && !entry.locked);
            if (!otherUser || otherUser.id === user.id) return send(res, 404, { error: 'Không tìm thấy thành viên để nhắn riêng.' });
            conversationId = communityConversationId(user.id, otherUser.id);
          }
        }
        const messages = communityDb.messages.filter(message => message.conversationId === conversationId).slice(-200).map(message => {
          const sender = usersDb.users.find(entry => entry.id === message.senderId);
          const isAdmin = message.senderRole === 'admin' || message.senderId === 0;
          return { author: isAdmin ? 'SONNA Admin' : sender ? sender.username : 'Thành viên', isAdmin, text: message.text, time: fmtTime(new Date(message.createdAt)) };
        });
        return send(res, req.method === 'POST' ? 201 : 200, { conversationId, messages });
      }
      if (p === '/api/admin/community/chat' && (req.method === 'GET' || req.method === 'POST')) {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập admin.' });
        let requestedRecipient = String(url.searchParams.get('with') || '').trim();
        let text = '';
        if (req.method === 'POST') {
          const body = await readBody(req);
          requestedRecipient = String(body.with || '').trim();
          text = String(body.text || '').trim();
          if (!text || text.length > 500) return send(res, 400, { error: 'Tin nhắn cần từ 1 đến 500 ký tự.' });
        }
        let conversationId = 'group';
        if (requestedRecipient) {
          const recipient = usersDb.users.find(entry => entry.username.toLowerCase() === requestedRecipient.toLowerCase() && !entry.locked);
          if (!recipient) return send(res, 404, { error: 'Không tìm thấy thành viên để nhắn riêng.' });
          conversationId = communityAdminConversationId(recipient.id);
        }
        if (req.method === 'POST') {
          communityDb.messages.push({ conversationId, senderId: 0, senderRole: 'admin', text, createdAt: new Date().toISOString() });
          writeJSON(COMMUNITY_FILE, communityDb);
        }
        const messages = communityDb.messages.filter(message => message.conversationId === conversationId).slice(-200).map(message => {
          const sender = usersDb.users.find(entry => entry.id === message.senderId);
          const isAdmin = message.senderRole === 'admin' || message.senderId === 0;
          return { author: isAdmin ? 'SONNA Admin' : sender ? sender.username : 'Thành viên', isAdmin, text: message.text, time: fmtTime(new Date(message.createdAt)) };
        });
        return send(res, req.method === 'POST' ? 201 : 200, { conversationId, messages });
      }
      if (p === '/api/admin/community/posts' && req.method === 'GET') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập admin.' });
        return send(res, 200, {
          posts: communityDb.posts.filter(post => !post.deletedAt).slice().reverse().map(publicCommunityPost),
          reports: communityDb.reports.filter(report => report.status === 'open').slice().reverse().map(report => {
            const post = communityDb.posts.find(entry => entry.id === report.postId);
            const reporter = usersDb.users.find(entry => entry.id === report.userId);
            return { ...report, postTitle: post ? post.title : 'Bài viết đã xóa', reporter: reporter ? reporter.username : 'Thành viên' };
          }),
          members: usersDb.users.map(user => ({ id: user.id, username: user.username, postCount: communityDb.posts.filter(post => post.userId === user.id && !post.deletedAt && post.status !== 'pending' && post.status !== 'rejected').length, locked: !!user.locked, postWithoutApproval: !!user.communityPostAutoApprove }))
        });
      }
      const communityMemberPermissionMatch = /^\/api\/admin\/community\/members\/(\d+)\/post-approval$/.exec(p);
      if (communityMemberPermissionMatch && req.method === 'POST') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập admin.' });
        const user = usersDb.users.find(entry => entry.id === Number(communityMemberPermissionMatch[1]));
        if (!user) return send(res, 404, { error: 'Không tìm thấy thành viên.' });
        const enabled = (await readBody(req)).enabled;
        if (typeof enabled !== 'boolean') return send(res, 400, { error: 'Trạng thái quyền đăng trực tiếp không hợp lệ.' });
        const nextUsers = JSON.parse(JSON.stringify(usersDb));
        const nextUser = nextUsers.users.find(entry => entry.id === user.id);
        nextUser.communityPostAutoApprove = enabled;
        commitState({ [USERS_FILE]: nextUsers });
        usersDb = nextUsers;
        return send(res, 200, { ok: true, enabled });
      }
      if (p === '/api/admin/community/posts' && req.method === 'POST') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập admin.' });
        const body = await readBody(req);
        const category = String(body.category || '').trim();
        const title = String(body.title || '').trim();
        const text = String(body.body || '').trim();
        const allowedCategories = ['Thảo luận chung', 'Hướng dẫn / Build đội hình', 'Sự kiện', 'Khoe acc', 'Tìm bang hội', 'Góp ý'];
        const images = Array.isArray(body.images) ? body.images : [];
        if (!allowedCategories.includes(category) || !title || title.length > 100 || !text || text.length > 1200) return send(res, 400, { error: 'Chuyên mục, tiêu đề hoặc nội dung không hợp lệ.' });
        if (images.length > 8 || images.some(image => typeof image !== 'string' || !/^\/uploads\/[a-f0-9]{20}\.(?:jpg|png|webp|gif)$/.test(image))) return send(res, 400, { error: 'Ảnh đính kèm không hợp lệ (tối đa 8 ảnh).' });
        const post = { id: communityDb.nextPostId++, userId: 0, isAdmin: true, category, title, body: text, images, likes: [], comments: [], status: 'approved', locked: false, pinned: false, createdAt: new Date().toISOString() };
        communityDb.posts.push(post);
        writeJSON(COMMUNITY_FILE, communityDb);
        return send(res, 201, { post: publicCommunityPost(post) });
      }
      const adminModeratePostMatch = /^\/api\/admin\/community\/posts\/(\d+)\/moderate$/.exec(p);
      if (adminModeratePostMatch && req.method === 'POST') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập admin.' });
        const post = communityDb.posts.find(entry => entry.id === Number(adminModeratePostMatch[1]) && !entry.deletedAt);
        if (!post) return send(res, 404, { error: 'Không tìm thấy bài viết.' });
        const action = String((await readBody(req)).action || '');
        if (action === 'approve') {
          post.status = 'approved';
          communityNotification(post.userId, 'approved', post, { id: 0 }, 'Bài viết "' + post.title + '" đã được duyệt và đăng công khai.');
        } else if (action === 'reject') {
          post.status = 'rejected';
          communityNotification(post.userId, 'rejected', post, { id: 0 }, 'Bài viết "' + post.title + '" chưa được duyệt. Vui lòng xem lại nội quy cộng đồng.');
        } else if (action === 'pin') post.pinned = !post.pinned;
        else if (action === 'lock') post.locked = !post.locked;
        else return send(res, 400, { error: 'Thao tác kiểm duyệt không hợp lệ.' });
        writeJSON(COMMUNITY_FILE, communityDb);
        return send(res, 200, { ok: true, post: publicCommunityPost(post) });
      }
      const adminResolveReportMatch = /^\/api\/admin\/community\/reports\/(\d+)\/resolve$/.exec(p);
      if (adminResolveReportMatch && req.method === 'POST') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập admin.' });
        const report = communityDb.reports.find(entry => entry.id === Number(adminResolveReportMatch[1]) && entry.status === 'open');
        if (!report) return send(res, 404, { error: 'Không tìm thấy báo cáo đang mở.' });
        report.status = 'resolved';
        report.resolvedAt = new Date().toISOString();
        writeJSON(COMMUNITY_FILE, communityDb);
        return send(res, 200, { ok: true });
      }
      const adminCommunityPostMatch = /^\/api\/admin\/community\/posts\/(\d+)$/.exec(p);
      if (adminCommunityPostMatch && req.method === 'DELETE') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập admin.' });
        const post = communityDb.posts.find(entry => entry.id === Number(adminCommunityPostMatch[1]) && !entry.deletedAt);
        if (!post) return send(res, 404, { error: 'Không tìm thấy bài viết.' });
        post.deletedAt = new Date().toISOString();
        post.deletedByAdmin = true;
        writeJSON(COMMUNITY_FILE, communityDb);
        return send(res, 200, { ok: true });
      }
      if ((p === '/api/user/register' || p === '/api/user/login') && req.method === 'POST') {
        if (limited(ip)) return send(res, 429, { error: 'Thử sai quá nhiều lần, vui lòng đợi vài phút.' });
        if (p.endsWith('/register') && registrationLimited(ip)) return send(res, 429, { error: 'Đăng ký quá nhiều lần, vui lòng thử lại sau 15 phút.' });
        const b = await readBody(req);
        const username = String(b.username || '').trim(), password = String(b.password || '');
        let u;
        if (p.endsWith('register')) {
          if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) return send(res, 400, { error: 'Tên đăng nhập 3-30 ký tự: chữ, số, _ . -' });
          if (password.length < 6 || password.length > 100) return send(res, 400, { error: 'Mật khẩu cần từ 6 ký tự.' });
          if (usersDb.users.some(x => x.username.toLowerCase() === username.toLowerCase())) return send(res, 409, { error: 'Tên đăng nhập đã được dùng.' });
          const salt = crypto.randomBytes(16).toString('hex');
          const nextUsers = JSON.parse(JSON.stringify(usersDb));
          u = { id: nextUsers.nextId++, username, salt, hash: hashPw(password, salt), wallet: 0, usedCodes: [], createdAt: new Date().toISOString() };
          nextUsers.users.push(u);
          commitState({ [USERS_FILE]: nextUsers });
          usersDb = nextUsers;
        } else {
          u = usersDb.users.find(x => x.username.toLowerCase() === username.toLowerCase());
          if (u && u.locked) return send(res, 403, { error: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.' });
          const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(password, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
          if (!ok) {
            const f = fails.get(ip) || { n: 0 }; f.n++; f.until = Date.now() + 5 * 60000; fails.set(ip, f);
            return send(res, 401, { error: 'Sai tên đăng nhập hoặc mật khẩu.' });
          }
          fails.delete(ip);
        }
        const t = crypto.randomBytes(24).toString('hex');
        cSessions.set(t, { id: u.id, exp: Date.now() + SESSION_MS * 3 });
        saveSessions();
        const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
        return send(res, 200, { ok: true, user: publicUser(u), orders: userOrders(u) }, { 'Set-Cookie': `cid=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS * 3 / 1000}${secure}` });
      }
      if (p === '/api/user/logout' && req.method === 'POST') {
        const t = getCookie(req, 'cid'); if (t) cSessions.delete(t);
        saveSessions();
        const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
        return send(res, 200, { ok: true, user: null }, { 'Set-Cookie': `cid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}` });
      }
      if (p === '/api/orders' && req.method === 'POST') {
        const u = getUser(req);
        if (!u) return send(res, 401, { error: 'Cần đăng nhập.' });
        const r = createOrder(u, await readBody(req));
        const { status, ...rest } = r;
        return send(res, status, rest);
      }
      if (p === '/api/wallet/topup' && req.method === 'POST') {
        const u = getUser(req);
        if (!u) return send(res, 401, { error: 'Cần đăng nhập.' });
        if (!simTopup()) return send(res, 403, { error: 'Chưa mở nạp tiền tự động. Vui lòng chuyển khoản và chờ admin xác nhận.' });
        const b = await readBody(req);
        const amount = Math.floor(Number(b.amount));
        if (!Number.isFinite(amount) || amount < 1 || amount > 100000000) return send(res, 400, { error: 'Số tiền không hợp lệ.' });
        const bonus = topupBonus(amount);
        const nextUsers = JSON.parse(JSON.stringify(usersDb));
        const nextUser = nextUsers.users.find(x => x.id === u.id);
        nextUser.wallet += amount + bonus;
        commitState({ [USERS_FILE]: nextUsers });
        usersDb = nextUsers;
        return send(res, 200, { ok: true, credited: amount + bonus, bonus, user: publicUser(nextUser) });
      }
      // ----- admin: người dùng -----
      if (p === '/api/admin/users' && req.method === 'GET') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập.' });
        const list = usersDb.users.map(u => {
          const userOrdersList = orders.filter(o => o.userId === u.id);
          const depositsList = deposits.filter(d => d.userId === u.id && d.status === 'credited');
          const walletHistory = Array.isArray(u.walletHistory) ? u.walletHistory : [];
          const recent = userOrdersList.map(o => ({ text: 'Mua hàng: ' + o.code, time: o.time, amount: '-' + money(Number(o.total) || 0), col: '#FF6B7A', createdAt: o.createdAt || '' }))
            .concat(depositsList.map(d => ({ text: 'Nạp ví qua chuyển khoản', time: d.time, amount: '+' + money((Number(d.amount) || 0) + (Number(d.bonus) || 0)), col: '#43D9A0', createdAt: d.time || '' })))
            .concat(walletHistory.map(entry => ({ text: 'Điều chỉnh ví: ' + entry.reason, time: fmtTime(new Date(entry.createdAt || 0)), amount: (Number(entry.amount) < 0 ? '-' : '+') + money(Math.abs(Number(entry.amount) || 0)), col: Number(entry.amount) < 0 ? '#FF6B7A' : '#43D9A0', createdAt: entry.createdAt || '' })))
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 10)
            .map(({ createdAt, ...entry }) => entry);
          const transactions = userOrdersList.map(o => ({
            id: o.code, type: 'order', time: o.time || fmtTime(new Date(o.createdAt || 0)), sortAt: o.createdAt || '',
            title: 'Mua hàng · ' + o.title, amount: -Math.abs(Number(o.total) || 0),
            status: o.status || 'Đã thanh toán',
            accounts: Array.isArray(o.accs) ? o.accs.map(a => ({ tag: a.tag || 'Acc', line: String(a.line || '') })).filter(a => a.line) : []
          }))
            .concat(depositsList.map(d => ({
              id: String(d.id || d.reference || d.time || 'deposit'),
              type: 'deposit', time: d.time || '', sortAt: d.time || '', title: 'Nạp ví qua chuyển khoản',
              amount: (Number(d.amount) || 0) + (Number(d.bonus) || 0),
              status: 'Đã cộng ví', accounts: []
            })))
            .concat(walletHistory.map((entry, index) => ({
              id: String(entry.id || 'wallet-' + index), type: 'wallet',
              time: fmtTime(new Date(entry.createdAt || 0)), sortAt: entry.createdAt || '',
              title: 'Điều chỉnh ví · ' + String(entry.reason || 'Không có lý do'),
              amount: Number(entry.amount) || 0, status: 'Đã cập nhật', accounts: []
            })))
            .sort((a, b) => String(b.sortAt).localeCompare(String(a.sortAt)))
            .map(({ sortAt, ...transaction }) => transaction);
          return { id: u.id, username: u.username, wallet: u.wallet, createdAt: u.createdAt,
            orderCount: userOrdersList.length, spent: userOrdersList.filter(o => o.status !== 'Đã hoàn tiền').reduce((sum, o) => sum + (Number(o.total) || 0), 0),
            toppedUp: depositsList.reduce((sum, d) => sum + (Number(d.amount) + (Number(d.bonus) || 0)), 0),
            locked: !!u.locked, usedCodes: u.usedCodes || [], recent, transactions };
        });
        return send(res, 200, { users: list });
      }
      let m;
      if (p === '/api/admin/orders' && req.method === 'GET') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập.' });
        return send(res, 200, { orders: orders.slice().reverse().map(o => {
          const u = usersDb.users.find(x => x.id === o.userId);
          return { ...o, username: u ? u.username : 'Không rõ', status: o.status || 'Đã thanh toán', time: o.time || fmtTime(new Date(o.createdAt || 0)) };
        }) });
      }
      if (p === '/api/admin/dashboard' && req.method === 'GET') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập.' });
        const today = new Date().toISOString().slice(0, 10);
        const month = today.slice(0, 7);
        const paidOrders = orders.filter(o => o.status !== 'Đã hoàn tiền');
        const byPeriod = list => ({ revenue: list.reduce((sum, o) => sum + (Number(o.total) || 0), 0), count: list.length });
        const dateOf = o => String(o.createdAt || '').slice(0, 10) || (() => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(o.time || ''); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; })();
        const stock = eligibleAccounts().length;
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(); d.setDate(d.getDate() - (6 - i));
          const key = d.toISOString().slice(0, 10);
          const value = byPeriod(paidOrders.filter(o => dateOf(o) === key)).revenue;
          return { date: key, value, label: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()] };
        });
        const maxDay = Math.max(1, ...days.map(d => d.value));
        return send(res, 200, {
          users: usersDb.users.length, orders: orders.length, stock,
          today: byPeriod(paidOrders.filter(o => dateOf(o) === today)),
          month: byPeriod(paidOrders.filter(o => dateOf(o).startsWith(month))),
          unmatchedDeposits: deposits.filter(d => d.status === 'unmatched').length,
          days: days.map(d => ({ ...d, height: Math.max(4, Math.round(d.value / maxDay * 150)) })),
          recentOrders: orders.slice(-8).reverse().map(o => ({ ...o, username: (usersDb.users.find(u => u.id === o.userId) || {}).username || 'Không rõ', time: o.time || fmtTime(new Date(o.createdAt || 0)) }))
        });
      }
      if ((m = /^\/api\/admin\/users\/(\d+)\/lock$/.exec(p)) && req.method === 'POST') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập.' });
        const user = usersDb.users.find(u => u.id === Number(m[1]));
        if (!user) return send(res, 404, { error: 'Không tìm thấy khách hàng.' });
        const body = await readBody(req);
        if (typeof body.locked !== 'boolean') return send(res, 400, { error: 'Trạng thái khóa không hợp lệ.' });
        const nextUsers = JSON.parse(JSON.stringify(usersDb));
        const nextUser = nextUsers.users.find(u => u.id === user.id);
        nextUser.locked = body.locked;
        commitState({ [USERS_FILE]: nextUsers });
        usersDb = nextUsers;
        if (nextUser.locked) {
          cSessions.forEach((entry, token) => { if (entry.id === nextUser.id) cSessions.delete(token); });
          saveSessions();
        }
        return send(res, 200, { ok: true, locked: nextUser.locked });
      }
      if ((m = /^\/api\/admin\/users\/(\d+)\/password$/.exec(p)) && req.method === 'POST') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập.' });
        const user = usersDb.users.find(u => u.id === Number(m[1]));
        if (!user) return send(res, 404, { error: 'Không tìm thấy khách hàng.' });
        const password = String((await readBody(req)).password || '');
        if (password.length < 6 || password.length > 100) return send(res, 400, { error: 'Mật khẩu mới cần từ 6 đến 100 ký tự.' });
        const nextUsers = JSON.parse(JSON.stringify(usersDb));
        const nextUser = nextUsers.users.find(u => u.id === user.id);
        const salt = crypto.randomBytes(16).toString('hex');
        nextUser.salt = salt;
        nextUser.hash = hashPw(password, salt);
        nextUser.passwordChangedAt = new Date().toISOString();
        commitState({ [USERS_FILE]: nextUsers });
        usersDb = nextUsers;
        cSessions.forEach((entry, token) => { if (entry.id === nextUser.id) cSessions.delete(token); });
        saveSessions();
        return send(res, 200, { ok: true });
      }
      if ((m = /^\/api\/admin\/orders\/([A-Za-z0-9-]+)$/.exec(p)) && req.method === 'POST') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập.' });
        const order = orders.find(o => o.code === m[1]);
        if (!order) return send(res, 404, { error: 'Không tìm thấy đơn hàng.' });
        const body = await readBody(req);
        if (body.status === 'Hoàn tất') {
          if (order.status === 'Đã hoàn tiền') return send(res, 409, { error: 'Đơn đã hoàn tiền.' });
          const nextOrders = JSON.parse(JSON.stringify(orders));
          const nextOrder = nextOrders.find(o => o.code === order.code);
          nextOrder.status = 'Hoàn tất';
          nextOrder.updatedAt = new Date().toISOString();
          commitState({ [ORDERS_FILE]: nextOrders });
          orders = nextOrders;
          return send(res, 200, { ok: true, order: nextOrder });
        } else if (body.status === 'Đã hoàn tiền') {
          if (order.status === 'Đã hoàn tiền') return send(res, 409, { error: 'Đơn đã được hoàn tiền.' });
          const nextUsers = JSON.parse(JSON.stringify(usersDb));
          const user = nextUsers.users.find(u => u.id === order.userId);
          if (!user) return send(res, 409, { error: 'Không tìm thấy khách hàng để hoàn tiền.' });
          user.wallet += Number(order.total) || 0;
          const nextOrders = JSON.parse(JSON.stringify(orders));
          const nextOrder = nextOrders.find(o => o.code === order.code);
          nextOrder.status = 'Đã hoàn tiền';
          nextOrder.refundedAt = new Date().toISOString();
          commitState({ [USERS_FILE]: nextUsers, [ORDERS_FILE]: nextOrders });
          usersDb = nextUsers; orders = nextOrders;
          return send(res, 200, { ok: true, order: nextOrder, wallet: user.wallet });
        } else return send(res, 400, { error: 'Trạng thái đơn hàng không hợp lệ.' });
      }
      if ((m = /^\/api\/admin\/users\/(\d+)\/wallet$/.exec(p)) && req.method === 'POST') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập.' });
        const u = usersDb.users.find(x => x.id === Number(m[1]));
        const body = await readBody(req);
        const d = Math.trunc(Number(body.delta));
        const reason = String(body.reason || '').trim();
        if (!u || !Number.isFinite(d) || !d || u.wallet + d < 0 || !reason || reason.length > 200) return send(res, 400, { error: 'Yêu cầu không hợp lệ hoặc thiếu lý do.' });
        const nextUsers = JSON.parse(JSON.stringify(usersDb));
        const nextUser = nextUsers.users.find(x => x.id === u.id);
        nextUser.wallet += d;
        nextUser.walletHistory = (Array.isArray(nextUser.walletHistory) ? nextUser.walletHistory : []).concat({
          id: crypto.randomBytes(8).toString('hex'), amount: d, reason, createdAt: new Date().toISOString()
        });
        commitState({ [USERS_FILE]: nextUsers });
        usersDb = nextUsers;
        return send(res, 200, { ok: true, wallet: nextUser.wallet });
      }
      if ((m = /^\/api\/pages\/([A-Za-z0-9_]+)$/.exec(p)) && req.method === 'GET') {
        const k = m[1];
        if (!PAGE_KEYS.has(k)) return send(res, 404, { error: 'Không có trang.' });
        if (k.startsWith('Admin') && !isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập.' });
        return send(res, 200, readJSON(path.join(PAGES_DIR, k + '.json'), {}));
      }
      if (p === '/api/admin/upload' && req.method === 'POST') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập.' });
        const b = await readBody(req);
        const url2 = await saveDataUrl(String(b.dataUrl || ''), 4 * 1024 * 1024);
        if (!url2) return send(res, 400, { error: 'Ảnh không hợp lệ (chỉ nhận JPG/PNG/WEBP, tối đa 4MB).' });
        return send(res, 200, { ok: true, url: url2 });
      }
      if (p === '/api/store' && req.method === 'GET') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập.' });
        return send(res, 200, { data: { ...store, acc: accountsDb } });
      }
      if (p === '/api/store' && req.method === 'DELETE') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập.' });
        const nextStore = {};
        commitState({ [STORE_FILE]: nextStore });
        store = nextStore; return send(res, 200, { ok: true });
      }
      if (p === '/api/admin/account-id' && req.method === 'POST') {
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập.' });
        const b = await readBody(req);
        const oldId = b && typeof b.oldId === 'string' ? b.oldId.trim() : '';
        const newId = b && typeof b.newId === 'string' ? b.newId.trim() : '';
        if (!oldId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(newId) || Object.prototype[newId] !== undefined) {
          return send(res, 400, { error: 'Mã acc cần dài 1–40 ký tự, chỉ gồm chữ, số, gạch ngang hoặc gạch dưới.' });
        }
        if (oldId === newId) return send(res, 200, { ok: true, store });
        const result = renameAccountId(oldId, newId);
        if (result.status !== 200) return send(res, result.status, { error: result.error });
        return send(res, 200, { ok: true, store: result.store });
      }
      if ((m = /^\/api\/store\/([A-Za-z0-9_.-]{1,64})$/.exec(p)) && req.method === 'PUT') {
        const k = m[1];
        if (k === '__proto__' || k === 'constructor') return send(res, 400, { error: 'Khóa không hợp lệ.' });
        if (!isAuthed(req)) return send(res, 401, { error: 'Cần đăng nhập.' });
        const b = await readBody(req);
        if (!('value' in b)) return send(res, 400, { error: 'Thiếu value.' });
        if (k === 'acc') {
          if (!b.value || typeof b.value !== 'object' || Array.isArray(b.value) || !Array.isArray(b.value.listed)) return send(res, 400, { error: 'Dữ liệu kho tài khoản không hợp lệ.' });
          commitState({ [ACCOUNTS_FILE]: b.value });
          accountsDb = b.value;
          return send(res, 200, { ok: true });
        }
        const nextStore = { ...store, [k]: b.value };
        commitState({ [STORE_FILE]: nextStore });
        store = nextStore;
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'Không tìm thấy.' });
    } catch (e) {
      if (e instanceof SyntaxError) return send(res, 400, { error: 'Dữ liệu yêu cầu không hợp lệ.' });
      console.error('[SONNA] API request failed:', e);
      return send(res, 500, { error: 'Máy chủ không thể xử lý yêu cầu.' });
    }
  }

  // ảnh đã tải lên
  if (p.startsWith('/uploads/')) {
    let decoded;
    try { decoded = decodeURIComponent(p); }
    catch (e) { res.writeHead(400); return res.end('Bad request'); }
    const nm = path.basename(decoded);
    if (!/^[a-f0-9]{20}\.(?:jpg|png|webp|gif)$/.test(nm)) { res.writeHead(404); return res.end('Not found'); }
    const imageUrl = publicStorageUrl(nm);
    res.writeHead(302, { Location: imageUrl, 'Cache-Control': 'public, max-age=31536000, immutable' });
    return res.end();
  }

  // static
  let decoded;
  try { decoded = decodeURIComponent(p); }
  catch (e) { res.writeHead(400); return res.end('Bad request'); }
  let rel = decoded === '/' ? '/index.html' : decoded;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

async function startServer() {
  supabaseStorageConfig();
  await cloudState.initialize();
  cloudState.setStoreChangeNotifier(realtime.publishStoreChange);
  store = readJSON(STORE_FILE, {});
  accountsDb = readJSON(ACCOUNTS_FILE, emptyAccounts());
  usersDb = readJSON(USERS_FILE, { nextId: 28, users: [] });
  orders = readJSON(ORDERS_FILE, []);
  communityDb = readJSON(COMMUNITY_FILE, { nextPostId: 1, posts: [] });
  if (!communityDb || !Array.isArray(communityDb.posts)) communityDb = { nextPostId: 1, posts: [] };
  if (!Array.isArray(communityDb.messages)) communityDb.messages = [];
  if (!Array.isArray(communityDb.notifications)) communityDb.notifications = [];
  if (!Array.isArray(communityDb.reports)) communityDb.reports = [];
  communityDb.nextPostId = Math.max(Number(communityDb.nextPostId) || 1, ...communityDb.posts.map(post => Number(post.id) + 1 || 1));
  communityDb.nextNotificationId = Math.max(Number(communityDb.nextNotificationId) || 1, ...communityDb.notifications.map(notification => Number(notification.id) + 1 || 1));
  communityDb.nextReportId = Math.max(Number(communityDb.nextReportId) || 1, ...communityDb.reports.map(report => Number(report.id) + 1 || 1));
  deposits = readJSON(DEPOSITS_FILE, []);
  depositIds.clear();
  deposits.forEach(deposit => depositIds.add(String(deposit.txId)));
  savedSessions = readJSON(SESSION_FILE, { admin: [], customer: [] });
  sessions.clear();
  cSessions.clear();
  const sessionNow = Date.now();
  (Array.isArray(savedSessions.admin) ? savedSessions.admin : []).forEach(([token, expires]) => {
    if (/^[a-f0-9]{48}$/.test(token) && Number(expires) > sessionNow) sessions.set(token, Number(expires));
  });
  (Array.isArray(savedSessions.customer) ? savedSessions.customer : []).forEach(([token, entry]) => {
    if (/^[a-f0-9]{48}$/.test(token) && entry && Number(entry.exp) > sessionNow) cSessions.set(token, { id: Number(entry.id), exp: Number(entry.exp) });
  });
  initializeAdmin();
  if (!cloudState.has('payment.json')) writeJSON(PAYMENT_FILE, PAYMENT_TEMPLATE);
  [
    [STORE_FILE, store],
    [ACCOUNTS_FILE, accountsDb],
    [USERS_FILE, usersDb],
    [ORDERS_FILE, orders],
    [COMMUNITY_FILE, communityDb],
    [DEPOSITS_FILE, deposits],
    [SESSION_FILE, savedSessions]
  ].forEach(([file, value]) => {
    if (!cloudState.has(path.basename(file))) writeJSON(file, value);
  });
  await cloudState.flush();

  const server = http.createServer((req, res) => {
  const requestPath = new URL(req.url, 'http://localhost').pathname;
  if (requestPath === '/vendor/supabase.js' && req.method === 'GET') {
    return fs.readFile(SUPABASE_BROWSER_SDK, (error, contents) => {
      if (error) {
        console.error('[SONNA] Could not load Supabase browser SDK:', error);
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Supabase Realtime client is unavailable.');
      }
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      });
      res.end(contents);
    });
  }
  if (requestPath === '/api/products' || requestPath === '/api/db-test' || requestPath === '/products') {
    if ((requestPath === '/api/db-test' || (requestPath === '/api/products' && req.method === 'POST')) && !isAuthed(req)) {
      return send(res, 401, { error: 'Cần đăng nhập admin.' });
    }
    return productApi(req, res);
  }
  return handle(req, res);
  });
  server.listen(PORT, () => { console.log(`[SONNA] http://localhost:${PORT}`); console.log('[SONNA] Dữ liệu bền vững lưu trên Supabase PostgreSQL và Storage.'); if (simTopup()) console.log('[SONNA] CẢNH BÁO: nút "Giả lập: đã nhận tiền" đang BẬT, khách tự cộng ví được. Cấu hình ngân hàng/SePay trong Admin > Thanh toán hoặc biến môi trường; hoặc chạy SIM_TOPUP=0 khi bán thật.');
  if (!payReady()) console.log('[SONNA] Nạp tự động chưa cấu hình: xem Admin > Thanh toán và README.'); });
}

startServer().catch(error => {
  console.error('[SONNA] Không thể khởi động với Supabase:', error);
  process.exitCode = 1;
});
