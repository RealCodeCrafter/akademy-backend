// check-token.ts
import 'dotenv/config'; // dotenv avtomatik .env o'qiydi
import * as jwt from 'jsonwebtoken';

const raw = process.env.TOCHKA_JWT_TOKEN || '';
const token = raw.replace(/\s+/g, ''); // satr ichidagi bo'shliqlar/linebreaklarni olib tashlaydi

if (!token) {
  console.error('TOCHKA_JWT muhokama topilmadi. .env faylida TOCHKA_JWT ni qo\'ying.');
  process.exit(1);
}

const decoded = jwt.decode(token, { complete: true });
console.log('Decoded JWT (safe):\n', JSON.stringify(decoded, null, 2));

// Agar payload ichidagi scope'larni ko'rmoqchi bo'lsangiz:
if (decoded && typeof decoded === 'object') {
  // @ts-ignore
  const payload = decoded.payload || decoded; // kutulgan struktura
  console.log('\nPayload keys:', Object.keys(payload));
  // @ts-ignore
  console.log('exp (as date):', payload.exp ? new Date(payload.exp * 1000) : 'no exp');
  // @ts-ignore
  console.log('Possible scopes/permissions fields:', payload.scope ?? payload.scp ?? payload.permissions ?? payload.consents ?? 'none found');
}
