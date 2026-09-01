// Uses B2 native API to set CORS rules on the bucket
const { B2_ACCESS_KEY_ID, B2_SECRET_ACCESS_KEY, NEXT_PUBLIC_APP_URL = 'https://piracy.cloud' } = process.env;
const BUCKET_ID = 'c1873991596016fba007031e';

if (!B2_ACCESS_KEY_ID || !B2_SECRET_ACCESS_KEY) {
  console.error('Run with: B2_ACCESS_KEY_ID=... B2_SECRET_ACCESS_KEY=... node scripts/setup-b2-cors.mjs');
  process.exit(1);
}

// Step 1: Authorize
const authResp = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
  headers: { Authorization: 'Basic ' + Buffer.from(`${B2_ACCESS_KEY_ID}:${B2_SECRET_ACCESS_KEY}`).toString('base64') },
});
if (!authResp.ok) { console.error('Auth failed:', await authResp.text()); process.exit(1); }
const { authorizationToken, apiInfo, accountId } = await authResp.json();
const apiUrl = apiInfo?.storageApi?.apiUrl ?? 'https://api003.backblazeb2.com';
console.log('Authorized. Account:', accountId);

// Step 2: Update bucket CORS rules
const corsResp = await fetch(`${apiUrl}/b2api/v3/b2_update_bucket`, {
  method: 'POST',
  headers: { Authorization: authorizationToken, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    accountId,
    bucketId: BUCKET_ID,
    corsRules: [{
      corsRuleName: 'uploadFromBrowser',
      allowedOrigins: [NEXT_PUBLIC_APP_URL, 'http://localhost:3000'],
      allowedHeaders: ['*'],
      allowedOperations: ['s3_put', 's3_get', 's3_head'],
      maxAgeSeconds: 86400,
    }],
  }),
});
const result = await corsResp.json();
if (!corsResp.ok) { console.error('Failed:', JSON.stringify(result)); process.exit(1); }
console.log('CORS configured successfully on bucket "themove"');
console.log('Allowed origins:', NEXT_PUBLIC_APP_URL, 'and http://localhost:3000');
