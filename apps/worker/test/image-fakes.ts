/**
 * test/image-fakes.ts — an image double that produces REAL, DECODABLE PICTURES.
 *
 * `packages/providers`' `FakeImageAdapter` returns deterministic pseudo-bytes, which is
 * exactly right for testing orchestration: they are cheap and they hash stably. They are
 * not right for testing the QA gate, which decodes pixels — against opaque bytes every page
 * would "fail QA" for the boring reason that it is not an image.
 *
 * So this double renders actual PNGs with sharp, and — this is the point — it can render a
 * page WITH TEXT DRAWN INTO IT. That turns the integration test's failure case from a
 * mocked verdict into the real thing: a genuinely bad illustration, judged by the real
 * `runImageQaGate`, failing for the real reason, exhausting the real retry budget and
 * landing in `manual_review` while the other twelve pages ship.
 */

import { createHash } from 'node:crypto';

import sharp from 'sharp';
import type {
  AdapterResult,
  ImageAdapter,
  ImageGenerateInput,
  ImageGenerateOutput,
  ProviderCallContext,
  ProviderUsage,
} from '@kendihikayem/providers';
import { DEFAULT_PRICE_BOOK, priceImageCall, roundUsd, type ProviderError } from '@kendihikayem/providers';

export interface RenderingFakeOptions {
  model: string;
  /** Rendered edge, in pixels. 1024 keeps the suite fast and still exercises renditions. */
  edgePx?: number;
  /**
   * Decides whether THIS attempt draws text into the picture. Called with the prompt and
   * the running attempt count for that prompt's page marker.
   */
  drawText?: (promptEn: string, attempt: number) => boolean;
  /** Refuse outright, as the vendor's safety filter would. */
  blockWhen?: (promptEn: string) => string | undefined;
  /** Throw a transport error, to exercise the router rather than the QA loop. */
  throwWhen?: (promptEn: string) => ProviderError | undefined;
}

/** `PAGE-07` style marker the test plants in a page's scene text. */
export function pageMarker(pageNo: number | 'cover'): string {
  return typeof pageNo === 'number' ? `PAGE-${String(pageNo).padStart(2, '0')}` : 'PAGE-COVER';
}

function markerOf(promptEn: string): string {
  return /PAGE-(?:\d{2}|COVER)/u.exec(promptEn)?.[0] ?? 'PAGE-??';
}

export class RenderingFakeImageAdapter implements ImageAdapter {
  readonly provider = 'fake' as const;
  readonly kind = 'image' as const;

  /** Attempts seen per page marker — how "fail once, then succeed" is expressed. */
  readonly attemptsByMarker = new Map<string, number>();
  readonly calls: Array<{
    purpose: ImageGenerateInput['purpose'];
    promptEn: string;
    resolution: string;
    references: string[];
  }> = [];

  constructor(private readonly options: RenderingFakeOptions) {}

  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    return { ok: true, latencyMs: 1 };
  }

  async generate(
    input: ImageGenerateInput,
    _ctx: ProviderCallContext,
  ): Promise<AdapterResult<ImageGenerateOutput>> {
    const marker = markerOf(input.promptEn);
    const attempt = (this.attemptsByMarker.get(marker) ?? 0) + 1;
    this.attemptsByMarker.set(marker, attempt);
    this.calls.push({
      purpose: input.purpose,
      promptEn: input.promptEn,
      resolution: input.resolution,
      references: input.references.map((r) => r.kind),
    });

    const thrown = this.options.throwWhen?.(input.promptEn);
    if (thrown) throw thrown;

    const costUsd = roundUsd(priceImageCall(DEFAULT_PRICE_BOOK, input.resolution, 1, false));
    const usage = (billed: boolean): ProviderUsage[] => [
      {
        provider: this.provider,
        model: this.options.model,
        operation: 'image.generate',
        billingUnit: 'image',
        billedUnits: billed ? 1 : 0,
        unitPriceUsd: billed ? costUsd : 0,
        costUsd: billed ? costUsd : 0,
        cacheHit: false,
        latencyMs: 1,
      },
    ];

    const blocked = this.options.blockWhen?.(input.promptEn);
    if (blocked) {
      return {
        value: {
          image: { bytes: new Uint8Array(0), mimeType: 'application/octet-stream', width: 0, height: 0, sha256: '' },
          model: this.options.model,
          blockedReason: blocked,
        },
        usage: usage(false),
      };
    }

    const withText = this.options.drawText?.(input.promptEn, attempt) ?? false;
    const bytes = await this.paint(input.promptEn, withText);

    return {
      value: {
        image: {
          bytes,
          mimeType: 'image/png',
          width: this.edge,
          height: this.edge,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
        model: this.options.model,
      },
      usage: usage(true),
    };
  }

  private get edge(): number {
    return this.options.edgePx ?? 1024;
  }

  /**
   * Paints a deterministic scene from the prompt hash: a warm background, a few soft
   * shapes, and — when asked — two lines of Turkish text, which is precisely what SPEC §8.4
   * forbids and what the QA gate is built to catch.
   */
  private async paint(promptEn: string, withText: boolean): Promise<Uint8Array> {
    const edge = this.edge;
    const seed = Number.parseInt(createHash('sha256').update(promptEn).digest('hex').slice(0, 6), 16);
    const hue = 20 + (seed % 40);

    const shapes = Array.from({ length: 12 }, (_, i) => {
      const x = ((seed >> i) % edge) || edge / 3;
      const y = ((seed >> (i + 3)) % edge) || edge / 2;
      const r = 40 + ((seed >> i) % 90);
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="hsl(${hue + i * 4} 45% ${45 + (i % 20)}%)" opacity="0.75"/>`;
    }).join('');

    const text = withText
      ? `<text x="60" y="${edge - 260}" font-family="DejaVu Sans" font-size="${Math.round(edge / 16)}" fill="#241a12">Elif ve şirin kedisi</text>
         <text x="60" y="${edge - 170}" font-family="DejaVu Sans" font-size="${Math.round(edge / 16)}" fill="#241a12">bahçede oynuyorlardı</text>`
      : '';

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${edge}" height="${edge}">
      <defs><radialGradient id="bg"><stop offset="0%" stop-color="hsl(${hue} 45% 88%)"/><stop offset="100%" stop-color="hsl(${hue} 35% 62%)"/></radialGradient></defs>
      <rect width="${edge}" height="${edge}" fill="url(#bg)"/>
      ${shapes}
      ${text}
    </svg>`;

    return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
  }
}
