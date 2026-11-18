import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret } from '../pluggyCreds.js';

describe('pluggyCreds — cifra do secret', () => {
  beforeAll(() => { process.env.PLUGGY_CREDENTIALS_KEY = randomBytes(32).toString('base64'); });

  it('cifra e decifra de volta; cada cifra é diferente (IV aleatório)', () => {
    const a = encryptSecret('pluggy_sk_teste');
    const b = encryptSecret('pluggy_sk_teste');
    expect(a).not.toBe(b);
    expect(a).not.toContain('pluggy_sk_teste');
    expect(decryptSecret(a)).toBe('pluggy_sk_teste');
  });

  it('recusa cifra adulterada', () => {
    const [v, iv, tag, enc] = encryptSecret('segredo').split('.');
    const flipped = Buffer.from(enc, 'base64');
    flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString('base64')].join('.'))).toThrow();
  });
});
