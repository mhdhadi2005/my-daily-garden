const https = require('https');

const body = JSON.stringify({
  subscriber_id: 'sub_bd0a74cf-8995-4417-8cd3-18aa69a3d89e',
  email: 'harryheyworth+fixed.secondary@gmail.com'
});

const options = {
  hostname: 'my-daily-garden-production.up.railway.app',
  path: '/api/seed-subscriber',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Authorization': 'Bearer mdg-secret-2026'
  }
};


const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);

    // Now fetch Harry's garden
    const getReq = https.request({
      hostname: 'my-daily-garden-production.up.railway.app',
      path: '/api/tree/sub_bd0a74cf-8995-4417-8cd3-18aa69a3d89e',
      method: 'GET'
    }, (res2) => {
      let d2 = '';
      res2.on('data', c => d2 += c);
      res2.on('end', () => {
        console.log('\nHarry garden URL:');
        console.log('https://my-daily-garden-production.up.railway.app?subscriber=sub_bd0a74cf-8995-4417-8cd3-18aa69a3d89e');
        console.log('\nGarden data:', d2);
      });
    });
    getReq.end();
  });
});

req.on('error', console.error);
req.write(body);
req.end();
