/**
 * @kendihikayem/providers/image — the illustration pipeline's provider half.
 *
 * Three concerns, deliberately separated:
 *
 *   prompt/   the five-layer consistency lock (SPEC §8.1) and the K5 audit gate. Pure
 *             string functions — no network, fully unit-tested, and the place the
 *             character-consistency claim actually lives.
 *   gemini/   the real vendor adapter: request shape, response parsing, error mapping,
 *             cost row. Tested against recorded fixtures; never against the live vendor.
 *   factory   the single `API_MODE` switch between the real adapter and the double.
 *
 * The QA gate that decides whether a rendered image is acceptable is NOT here: it needs
 * pixels, so it lives in `packages/media` (`imageQaGate`). This package produces images;
 * that one judges them.
 */

export * from './prompt/character-dna';
export * from './prompt/style-dna';
export * from './prompt/builder';
export * from './prompt/audit';
export * from './references';
export * from './gemini/protocol';
export * from './gemini/errors';
export * from './gemini/adapter';
export * from './factory';
