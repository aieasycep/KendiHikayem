/**
 * @kendihikayem/providers/llm — the story model, real and mocked.
 *
 * ⚠️ The real adapters have NEVER been run against the live vendors: this environment has
 * no keys and no egress to them. What is tested is everything up to the socket — request
 * shape, response parsing, error mapping, token accounting, schema repair — against
 * recorded response bodies in the vendors' documented wire format.
 */

export * from './types';
export * from './schema';
export * from './http';
export * from './structured';
export * from './anthropic';
export * from './openai';
export * from './gemini';
export * from './mock-story';
export * from './factory';
