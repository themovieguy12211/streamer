import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';

const {
  B2_ACCESS_KEY_ID,
  B2_SECRET_ACCESS_KEY,
  NEXT_PUBLIC_APP_URL = 'https://piracy.cloud',
} = process.env;

const BUCKET = 'themove';
const ENDPOINT = 'https://s3.eu-central-003.backblazeb2.com';
const REGION = 'eu-central-003';

if (!B2_ACCESS_KEY_ID || !B2_SECRET_ACCESS_KEY) {
  console.error('Run: B2_ACCESS_KEY_ID=xxx B2_SECRET_ACCESS_KEY=xxx node scripts/setup-b2-cors.mjs');
  process.exit(1);
}

const client = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: B2_ACCESS_KEY_ID, secretAccessKey: B2_SECRET_ACCESS_KEY },
});

const corsConfig = {
  CORSRules: [
    {
      AllowedOrigins: ['*'],
      AllowedMethods: ['PUT', 'GET', 'HEAD', 'POST'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 86400,
    },
  ],
};

console.log('Setting CORS on bucket', BUCKET, '...');
try {
  await client.send(new PutBucketCorsCommand({ Bucket: BUCKET, CORSConfiguration: corsConfig }));
  console.log('✓ CORS set via S3 API');
} catch (err) {
  console.error('✗ PutBucketCors failed:', err.message);
  console.error('Code:', err.Code || err.code);
}

console.log('\nVerifying CORS rules...');
try {
  const result = await client.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
  console.log('✓ CORS rules active:', JSON.stringify(result.CORSRules, null, 2));
} catch (err) {
  console.error('✗ GetBucketCors failed:', err.message);
  console.error('This means CORS was NOT successfully applied.');
}

// Also try via B2 native API
console.log('\nAlso setting via B2 native API...');
try {
  const authResp = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
    headers: { Authorization: 'Basic ' + Buffer.from(`${B2_ACCESS_KEY_ID}:${B2_SECRET_ACCESS_KEY}`).toString('base64') },
  });
  const { authorizationToken, apiInfo, accountId } = await authResp.json();
  if (!authorizationToken) throw new Error('Auth failed');
  const apiUrl = apiInfo?.storageApi?.apiUrl ?? 'https://api003.backblazeb2.com';
  const corsResp = await fetch(`${apiUrl}/b2api/v3/b2_update_bucket`, {
    method: 'POST',
    headers: { Authorization: authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId,
      bucketId: 'c1873991596016fba007031e',
      corsRules: [{
        corsRuleName: 'uploadFromBrowser',
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
        allowedOperations: ['s3_put', 's3_get', 's3_head', 'b2_upload'],
        maxAgeSeconds: 86400,
      }],
    }),
  });
  const data = await corsResp.json();
  if (!corsResp.ok) throw new Error(JSON.stringify(data));
  console.log('✓ CORS set via B2 native API');
} catch (err) {
  console.error('✗ B2 native API failed:', err.message);
}

console.log('\nDone. Try uploading again — if still 403, the bucket may need CORS set via the Backblaze web console.');
