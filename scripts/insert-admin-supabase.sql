-- Run in Supabase → SQL Editor (no local DB access required).
-- Login: username `admin`, password `rushmore` — change after verifying.
-- To regenerate the hash: npx tsx -e "import { hashPassword } from './server/auth/passport.ts'; (async()=>console.log(await hashPassword('rushmore')))();"

INSERT INTO users (username, password_hash, display_name, role)
VALUES (
  'admin',
  'b98b0268fa31681312d36c6c2b2b26f0bca324c85acd2d1faf0f643c6e930dd2042e1b2e5ff73df70eec3424d16dd446346eda3321611bb3669c9a90dc3c1d88.857d2686332402b62ec2b12886c9cbef',
  'admin',
  'host'
)
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  updated_at = now();
