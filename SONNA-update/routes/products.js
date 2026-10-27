'use strict';

const path = require('path');
const express = require('express');
const { query, testConnection } = require('../db');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.json({ limit: '1mb' }));

function parseProduct(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Body phải là một đối tượng JSON.' };
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const price = typeof body.price === 'number' || typeof body.price === 'string'
    ? (typeof body.price === 'string' && !body.price.trim() ? NaN : Number(body.price))
    : NaN;
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';

  if (!title || title.length > 200) {
    return { error: 'title là bắt buộc và không được vượt quá 200 ký tự.' };
  }
  if (!Number.isFinite(price) || price < 0 || price > 9999999999.99) {
    return { error: 'price phải từ 0 đến 9.999.999.999,99.' };
  }

  try {
    const url = new URL(imageUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid image URL.');
  } catch {
    return { error: 'imageUrl phải là URL HTTPS trực tiếp hợp lệ.' };
  }

  return { product: { title, price, imageUrl } };
}

app.get('/api/db-test', async (req, res) => {
  try {
    const connection = await testConnection();
    return res.json({ ok: true, connection });
  } catch (error) {
    console.error('[SONNA] PostgreSQL connection test failed:', error);
    return res.status(503).json({ ok: false, error: 'Không thể kết nối PostgreSQL.' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, title, price, image_url AS "imageUrl", created_at AS "createdAt"
       FROM products
       ORDER BY created_at DESC`
    );
    return res.json({ ok: true, products: result.rows });
  } catch (error) {
    console.error('[SONNA] Product list query failed:', error);
    return res.status(503).json({ error: 'Không thể tải danh sách sản phẩm.' });
  }
});

app.post('/api/products', async (req, res) => {
  const parsed = parseProduct(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    const result = await query(
      `INSERT INTO products (title, price, image_url)
       VALUES ($1, $2, $3)
       RETURNING id, title, price, image_url AS "imageUrl", created_at AS "createdAt"`,
      [parsed.product.title, parsed.product.price, parsed.product.imageUrl]
    );
    return res.status(201).json({ ok: true, product: result.rows[0] });
  } catch (error) {
    console.error('[SONNA] Product insert failed:', error);
    return res.status(500).json({ error: 'Không thể lưu sản phẩm.' });
  }
});

app.get('/products', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, title, price, image_url AS "imageUrl"
       FROM products
       ORDER BY created_at DESC`
    );
    return res.render('products', { products: result.rows });
  } catch (error) {
    console.error('[SONNA] Product page query failed:', error);
    return res.status(503).json({ error: 'Không thể tải danh sách sản phẩm.' });
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON không hợp lệ.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Dung lượng JSON vượt quá giới hạn 1 MB.' });
  }

  console.error('[SONNA] Product API request failed:', error);
  return res.status(500).json({ error: 'Máy chủ không thể xử lý yêu cầu.' });
});

app.use((req, res) => res.status(404).json({ error: 'Không tìm thấy API sản phẩm.' }));

module.exports = app;
