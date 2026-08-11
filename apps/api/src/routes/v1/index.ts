/**
 * routes/v1/index.ts — the ts-rest router.
 *
 * Every contract route has an entry: mine are real, everyone else's answer 501 with the
 * owning agent named. That means the server BOOTS TODAY — A1 can develop against a live
 * `/health` and a working job-polling path instead of waiting for the whole surface, and
 * each agent replaces one placeholder without touching anyone else's code.
 *
 * ⚠️ 501 IS NOT IN THE CONTRACT. `commonErrorResponses` stops at 500 and `ErrorCode` has no
 * `NOT_IMPLEMENTED`, so a placeholder cannot return 501 through ts-rest's typed path. It is
 * written straight to the socket after `reply.hijack()`, which is honest on the wire (a
 * client sees a real 501) while the handler still returns a contract-legal value for the
 * type system. See docs/contract-rfc/001 for the requested `NOT_IMPLEMENTED` code.
 */

import { initServer } from '@ts-rest/fastify';
import type { ServerResponse } from 'node:http';

import type { AppRoute, ServerInferResponses } from '@ts-rest/core';
import {
  type ApiError,
  type EndpointKey,
  apiContract,
  endpoints,
} from '@kendihikayem/contract';

import type { ApiContext } from '../../context';
import { buildApiError } from '../../errors';
import { requireUser } from '../../middleware/auth';
import { ENDPOINT_STATUS } from './status';
import { cancelJobForUser, listJobs, readJob } from './jobs';
import { readEntitlements } from './entitlements';
import { buildEstimate } from './estimates';
import { withIdempotency } from '../../middleware/idempotency';
import { type SseReply, parseLastEventId } from '../../sse/hub';

const s = initServer();

/**
 * The narrow slice of `FastifyReply` this needs. Structural, because ts-rest and Fastify
 * order `FastifyReply`'s generics differently and the nominal type does not line up.
 */
interface HijackableReply {
  hijack(): void;
  raw: ServerResponse;
}

/**
 * Writes a genuine 501 to the socket, then returns a contract-legal 500 shape that ts-rest
 * will try (and harmlessly fail) to send — the reply is already hijacked.
 */
function sendNotImplemented(
  reply: HijackableReply,
  key: EndpointKey,
  traceId: string,
): { status: 500; body: ApiError } {
  const meta = ENDPOINT_STATUS[key];
  const body = buildApiError('INTERNAL', traceId, {
    detail: `NOT_IMPLEMENTED: ${key} (owner ${meta.owner})`,
  });

  reply.hijack();
  reply.raw.writeHead(501, {
    'content-type': 'application/json; charset=utf-8',
    'x-kh-not-implemented': key,
    'x-kh-owner': meta.owner,
  });
  reply.raw.end(JSON.stringify(body));

  return { status: 500, body };
}

/**
 * Builds a placeholder handler for one contract route.
 *
 * `s.route` is what gives per-route type inference — the route object is passed so the
 * handler is checked against THAT route's contract, not a widened one. Handing it the key
 * as well is deliberate: the 501 body names the endpoint and its owning agent, so a client
 * hitting an unfinished route learns who is building it.
 */
function stub<R extends AppRoute>(route: R, key: EndpointKey) {
  return s.route(route, async ({ reply, request }) => {
    const response = sendNotImplemented(reply as unknown as HijackableReply, key, request.traceId);
    // The single sanctioned cast in this file. `ServerInferResponses<R>` cannot be proven
    // for an unresolved generic `R`, and 501 is not expressible in the contract at all —
    // both go away once docs/contract-rfc/001 lands and this helper is deleted.
    return response as unknown as ServerInferResponses<R>;
  });
}

export function createRouter(ctx: ApiContext) {
  return s.router(apiContract, {
    auth: {
      guest: stub(apiContract.auth.guest, 'auth.guest'),
      otpStart: stub(apiContract.auth.otpStart, 'auth.otpStart'),
      otpVerify: stub(apiContract.auth.otpVerify, 'auth.otpVerify'),
      refresh: stub(apiContract.auth.refresh, 'auth.refresh'),
      logout: stub(apiContract.auth.logout, 'auth.logout'),
      me: stub(apiContract.auth.me, 'auth.me'),
      updateMe: stub(apiContract.auth.updateMe, 'auth.updateMe'),
      deleteMe: stub(apiContract.auth.deleteMe, 'auth.deleteMe'),
    },

    children: {
      list: stub(apiContract.children.list, 'children.list'),
      create: stub(apiContract.children.create, 'children.create'),
      update: stub(apiContract.children.update, 'children.update'),
      remove: stub(apiContract.children.remove, 'children.remove'),
    },

    catalog: {
      themes: stub(apiContract.catalog.themes, 'catalog.themes'),
      artStyles: stub(apiContract.catalog.artStyles, 'catalog.artStyles'),
      characterOptions: stub(apiContract.catalog.characterOptions, 'catalog.characterOptions'),
      systemVoices: stub(apiContract.catalog.systemVoices, 'catalog.systemVoices'),
      bookFormats: stub(apiContract.catalog.bookFormats, 'catalog.bookFormats'),
      interests: stub(apiContract.catalog.interests, 'catalog.interests'),
    },

    voice: {
      uploadsPresign: stub(apiContract.voice.uploadsPresign, 'voice.uploadsPresign'),
      listProfiles: stub(apiContract.voice.listProfiles, 'voice.listProfiles'),
      getProfile: stub(apiContract.voice.getProfile, 'voice.getProfile'),
      createProfile: stub(apiContract.voice.createProfile, 'voice.createProfile'),
      script: stub(apiContract.voice.script, 'voice.script'),
      submitTake: stub(apiContract.voice.submitTake, 'voice.submitTake'),
      submit: stub(apiContract.voice.submit, 'voice.submit'),
      accept: stub(apiContract.voice.accept, 'voice.accept'),
      redo: stub(apiContract.voice.redo, 'voice.redo'),
      remove: stub(apiContract.voice.remove, 'voice.remove'),
    },

    stories: {
      create: stub(apiContract.stories.create, 'stories.create'),
      list: stub(apiContract.stories.list, 'stories.list'),
      get: stub(apiContract.stories.get, 'stories.get'),
      selectCharacterVariant: stub(apiContract.stories.selectCharacterVariant, 'stories.selectCharacterVariant'),
      approveOutline: stub(apiContract.stories.approveOutline, 'stories.approveOutline'),
      rejectOutline: stub(apiContract.stories.rejectOutline, 'stories.rejectOutline'),
      updatePage: stub(apiContract.stories.updatePage, 'stories.updatePage'),
      rewritePage: stub(apiContract.stories.rewritePage, 'stories.rewritePage'),
      reillustratePage: stub(apiContract.stories.reillustratePage, 'stories.reillustratePage'),
      revertPage: stub(apiContract.stories.revertPage, 'stories.revertPage'),
      approve: stub(apiContract.stories.approve, 'stories.approve'),
      sequel: stub(apiContract.stories.sequel, 'stories.sequel'),
      favorite: stub(apiContract.stories.favorite, 'stories.favorite'),
      remove: stub(apiContract.stories.remove, 'stories.remove'),
    },

    audio: {
      create: stub(apiContract.audio.create, 'audio.create'),
      list: stub(apiContract.audio.list, 'audio.list'),
      player: stub(apiContract.audio.player, 'audio.player'),
      setDefault: stub(apiContract.audio.setDefault, 'audio.setDefault'),
      removeRendition: stub(apiContract.audio.removeRendition, 'audio.removeRendition'),
      progress: stub(apiContract.audio.progress, 'audio.progress'),
      readingPreferences: stub(apiContract.audio.readingPreferences, 'audio.readingPreferences'),
      updateReadingPreferences: stub(apiContract.audio.updateReadingPreferences, 'audio.updateReadingPreferences'),
      publicPage: stub(apiContract.audio.publicPage, 'audio.publicPage'),
    },

    /* ── İşler — A2, gerçek ───────────────────────────────────────────────── */

    jobs: {
      /**
       * THE POLLING PATH. Mobile has no EventSource and depends entirely on this.
       */
      get: async ({ params, request }) => {
        const user = requireUser(request);
        const job = await readJob(ctx.db, params.jobId, user.userId);
        return { status: 200, body: job };
      },

      list: async ({ query, request }) => {
        const user = requireUser(request);
        const page = await listJobs(ctx.db, user.userId, {
          ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
          ...(query.limit !== undefined ? { limit: query.limit } : {}),
          ...(query.storyId !== undefined ? { storyId: query.storyId } : {}),
          ...(query.status !== undefined ? { status: query.status } : {}),
          ...(query.kind !== undefined ? { kind: query.kind } : {}),
        });
        return {
          status: 200,
          body: {
            items: page.items,
            nextCursor: page.nextCursor as never,
          },
        };
      },

      cancel: async ({ params, request, reply }) => {
        const user = requireUser(request);
        const result = await withIdempotency(
          ctx.db,
          request,
          reply,
          'POST /v1/jobs/:jobId/cancel',
          async () => {
            const job = await cancelJobForUser(ctx.db, params.jobId, user.userId);
            return { status: 200 as const, body: job as unknown as Record<string, unknown> };
          },
        );
        return { status: 200, body: result.body as never };
      },
    },

    /* ── SSE — A2, gerçek (web için; mobil polling kullanır) ──────────────── */

    events: {
      jobEvents: async ({ params, headers, request, reply }) => {
        const user = requireUser(request);
        // Ownership is checked before the stream opens; an SSE 403 mid-stream is invisible.
        await readJob(ctx.db, params.jobId, user.userId);

        // `@ts-rest/fastify` 3.52 passes FastifyReply's generic parameters in a
        // different ORDER than fastify 5 declares them, so `reply.raw` is typed as
        // RouteGenericInterface even though it is a ServerResponse at runtime. Casting
        // here beats loosening SseReply into something that hides real mistakes.
        await ctx.sse.attachJobStream(reply as unknown as SseReply, {
          connectionId: `${request.traceId}:${params.jobId}`,
          userId: user.userId,
          jobId: params.jobId,
          ...(headers['last-event-id'] !== undefined
            ? { lastEventId: String(parseLastEventId(headers['last-event-id'])) }
            : {}),
        });

        // The socket is hijacked and streaming; this satisfies the type only.
        return { status: 200, body: '' as never };
      },

      stream: async ({ request, reply }) => {
        const user = requireUser(request);
        // TODO(A2): session-wide multiplexing. Job-scoped streams already cover every
        // screen that needs live updates, and mobile polls regardless.
        ctx.sse.open(reply as unknown as SseReply, {
          id: request.traceId,
          userId: user.userId,
        });
        return { status: 200, body: '' as never };
      },
    },

    /* ── Kredi — entitlements + estimate A2, gerisi A1 ───────────────────── */

    billing: {
      entitlements: async ({ request }) => {
        const user = requireUser(request);
        return { status: 200, body: await readEntitlements(ctx.db, user.userId) };
      },

      estimate: async ({ body, request }) => {
        requireUser(request);
        return {
          status: 200,
          body: buildEstimate(body.operation, body.params, ctx.priceBook),
        };
      },

      plans: stub(apiContract.billing.plans, 'billing.plans'),
      subscription: stub(apiContract.billing.subscription, 'billing.subscription'),
      credits: stub(apiContract.billing.credits, 'billing.credits'),
      checkout: stub(apiContract.billing.checkout, 'billing.checkout'),
      cancel: stub(apiContract.billing.cancel, 'billing.cancel'),
    },

    print: {
      createBookBuild: stub(apiContract.print.createBookBuild, 'print.createBookBuild'),
      getBookBuild: stub(apiContract.print.getBookBuild, 'print.getBookBuild'),
      quote: stub(apiContract.print.quote, 'print.quote'),
      createOrder: stub(apiContract.print.createOrder, 'print.createOrder'),
      listOrders: stub(apiContract.print.listOrders, 'print.listOrders'),
      getOrder: stub(apiContract.print.getOrder, 'print.getOrder'),
      cancelOrder: stub(apiContract.print.cancelOrder, 'print.cancelOrder'),
      createExport: stub(apiContract.print.createExport, 'print.createExport'),
      listExports: stub(apiContract.print.listExports, 'print.listExports'),
    },

    privacy: {
      legalCurrent: stub(apiContract.privacy.legalCurrent, 'privacy.legalCurrent'),
      consentsGet: stub(apiContract.privacy.consentsGet, 'privacy.consentsGet'),
      consentsRecord: stub(apiContract.privacy.consentsRecord, 'privacy.consentsRecord'),
      consentSideEffects: stub(apiContract.privacy.consentSideEffects, 'privacy.consentSideEffects'),
      consentRevoke: stub(apiContract.privacy.consentRevoke, 'privacy.consentRevoke'),
      privacyRequestCreate: stub(apiContract.privacy.privacyRequestCreate, 'privacy.privacyRequestCreate'),
      privacyRequestList: stub(apiContract.privacy.privacyRequestList, 'privacy.privacyRequestList'),
      privacyExport: stub(apiContract.privacy.privacyExport, 'privacy.privacyExport'),
      dataMap: stub(apiContract.privacy.dataMap, 'privacy.dataMap'),
      supportReport: stub(apiContract.privacy.supportReport, 'privacy.supportReport'),
    },
  });
}

/** Auth requirement per route, read from the contract manifest rather than re-declared. */
export function authRequirementFor(key: EndpointKey) {
  return endpoints[key].auth;
}
