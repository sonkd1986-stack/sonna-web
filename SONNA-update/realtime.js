'use strict';

const https = require('https');

const STORE_TOPIC = 'sonna:store-updates';
const STORE_EVENT = 'store_changed';

function publicClientConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

function publishStoreChange(changedKeys) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Promise.reject(new Error('Supabase Realtime publisher is not configured.'));

  const projectUrl = new URL(url);
  if (projectUrl.protocol !== 'https:') {
    return Promise.reject(new Error('SUPABASE_URL must use HTTPS.'));
  }

  const body = Buffer.from(JSON.stringify({
    messages: [{
      topic: STORE_TOPIC,
      event: STORE_EVENT,
      payload: {
        changedAt: new Date().toISOString(),
        changedKeys: Array.isArray(changedKeys) ? changedKeys : []
      },
      private: false
    }]
  }));

  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: projectUrl.protocol,
      hostname: projectUrl.hostname,
      port: projectUrl.port || 443,
      method: 'POST',
      path: '/realtime/v1/api/broadcast',
      headers: {
        apikey: key,
        Authorization: ['Bearer ', key].join(''),
        'Content-Type': 'application/json',
        'Content-Length': body.length
      }
    }, response => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { responseBody += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error(`Supabase Realtime broadcast failed (${response.statusCode}): ${responseBody.slice(0, 500)}`));
        }
        resolve();
      });
    });

    request.setTimeout(5000, () => request.destroy(new Error('Supabase Realtime broadcast timed out.')));
    request.on('error', reject);
    request.end(body);
  });
}

module.exports = { publicClientConfig, publishStoreChange };
