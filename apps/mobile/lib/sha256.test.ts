import { describe, expect, it } from 'vitest';

import { sha256Hex } from './sha256';

const encoder = new TextEncoder();

/** NIST FIPS 180-4 reference vectors. */
describe('sha256Hex', () => {
  it('hashes the empty string', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('hashes "abc"', () => {
    expect(sha256Hex(encoder.encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes the two-block NIST message', () => {
    expect(sha256Hex(encoder.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('hashes a large buffer without recursion issues', () => {
    const big = new Uint8Array(1_000_000).fill(0x61); // one million 'a'
    expect(sha256Hex(big)).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });
});
