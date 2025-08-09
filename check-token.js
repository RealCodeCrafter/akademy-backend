"use strict";
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", { value: true });
// check-token.ts
require("dotenv/config"); // dotenv avtomatik .env o'qiydi
var jwt = require("jsonwebtoken");
var raw = process.env.TOCHKA_JWT_TOKEN || '';
var token = raw.replace(/\s+/g, ''); // satr ichidagi bo'shliqlar/linebreaklarni olib tashlaydi
if (!token) {
    console.error('TOCHKA_JWT muhokama topilmadi. .env faylida TOCHKA_JWT ni qo\'ying.');
    process.exit(1);
}
var decoded = jwt.decode(token, { complete: true });
console.log('Decoded JWT (safe):\n', JSON.stringify(decoded, null, 2));
// Agar payload ichidagi scope'larni ko'rmoqchi bo'lsangiz:
if (decoded && typeof decoded === 'object') {
    // @ts-ignore
    var payload = decoded.payload || decoded; // kutulgan struktura
    console.log('\nPayload keys:', Object.keys(payload));
    // @ts-ignore
    console.log('exp (as date):', payload.exp ? new Date(payload.exp * 1000) : 'no exp');
    // @ts-ignore
    console.log('Possible scopes/permissions fields:', (_d = (_c = (_b = (_a = payload.scope) !== null && _a !== void 0 ? _a : payload.scp) !== null && _b !== void 0 ? _b : payload.permissions) !== null && _c !== void 0 ? _c : payload.consents) !== null && _d !== void 0 ? _d : 'none found');
}
