import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'), API_PORT: z.coerce.number().default(4000), DATABASE_URL: z.string().url(), REDIS_URL: z.string().url(), SESSION_SECRET: z.string().min(32),
  B2_ENDPOINT: z.string().url(), B2_REGION: z.string().min(1), B2_BUCKET: z.string().min(1), B2_ACCESS_KEY_ID: z.string().min(1), B2_SECRET_ACCESS_KEY: z.string().min(1), B2_PUBLIC_BASE_URL: z.string().url().optional(), MAX_UPLOAD_BYTES: z.coerce.number().positive().default(21_474_836_480), TMDB_API_KEY: z.string().min(1).optional(), TMDB_BASE_URL: z.string().url().default('https://api.themoviedb.org/3'), POPADS_SCRIPT_URL: z.string().url().optional(), VAST_TAG_URL: z.string().url().optional(),
});
export const env = schema.parse(process.env);
