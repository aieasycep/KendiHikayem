/**
 * @kendihikayem/providers/google — what the three Google adapters share.
 *
 * Text (`llm/gemini.ts`), illustration (`image/gemini/`) and narration (`tts/google/`) all
 * speak to the same Generative Language API with the SAME API KEY, so they fail in the same
 * shapes and are throttled by the same free-tier limits. Error mapping, quota classification
 * and request pacing therefore live here rather than three times over.
 *
 * ⚠️ NOTHING IN THIS FOLDER HAS BEEN RUN AGAINST THE LIVE API. There is no key and no egress
 * in this environment. Every behaviour is proven against recorded response bodies written to
 * Google's published wire shapes — which is everything except the one thing only a key can
 * prove.
 */

export * from './quota';
export * from './errors';
export * from './pacing';
export * from './free-tier';
