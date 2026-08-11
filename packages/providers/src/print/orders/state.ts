/**
 * print/orders/state.ts — ⭐ WHEN AN ORDER MAY STILL BE STOPPED.
 *
 * The product promises: "baskıya girmeden önce iptal edebilirsiniz, sonra edemezsiniz."
 * That sentence is only honest if the code enforces it, so the boundary lives here as data
 * (`ORDER_TRANSITIONS`, `evaluateCancellation`) and every caller — API, worker, ops panel —
 * asks this module instead of re-deriving the rule.
 *
 * Two clocks decide, not one:
 *   1. `orders.status`  — where the commercial record is.
 *   2. `print_jobs.status` — where the PAPER is. Once the partner has accepted the job the
 *      sheets are being imposed; there is nothing left to cancel even though our own status
 *      may still say `paid`.
 *
 * `orders.status` (Postgres, English) and the contract's Turkish status enum are two
 * different vocabularies on purpose: the database keeps the state machine, the API shows the
 * parent a sentence. `toContractStatus` is the ONLY translation.
 */

export type OrderStatus =
  | 'created'
  | 'awaiting_payment'
  | 'paid'
  | 'in_production'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'failed';

export type PrintJobStatus =
  | 'queued'
  | 'submitted'
  | 'accepted'
  | 'printing'
  | 'shipped'
  | 'error'
  | 'cancelled';

/** Contract enum (`packages/contract/src/print.ts`) — what the parent's app renders. */
export type ContractOrderStatus =
  | 'odeme_bekliyor'
  | 'odendi'
  | 'uretimde'
  | 'baskida'
  | 'kargoya_verildi'
  | 'teslim_edildi'
  | 'iptal_edildi'
  | 'iade_edildi';

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  created: ['awaiting_payment', 'cancelled', 'failed'],
  awaiting_payment: ['paid', 'cancelled', 'failed'],
  paid: ['in_production', 'cancelled', 'refunded', 'failed'],
  in_production: ['shipped', 'cancelled', 'refunded', 'failed'],
  shipped: ['delivered', 'refunded'],
  // Terminal.
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
  failed: ['cancelled', 'refunded'],
};

export class OrderTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly messageTr: string,
  ) {
    super(`illegal order transition ${from} → ${to}`);
    this.name = 'OrderTransitionError';
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (canTransition(from, to)) return;
  throw new OrderTransitionError(
    from,
    to,
    'Siparişiniz bu adımda bu işleme uygun değil. Siparişlerim ekranını yenileyip tekrar deneyin.',
  );
}

/** Print-job states after which paper exists and money has been spent at the partner. */
const IRREVERSIBLE_PRINT_STATES: ReadonlySet<PrintJobStatus> = new Set<PrintJobStatus>([
  'accepted',
  'printing',
  'shipped',
]);

export interface CancellationInput {
  status: OrderStatus;
  printJobStatus?: PrintJobStatus;
}

export interface CancellationVerdict {
  allowed: boolean;
  /** What the parent is told — before they tap, and again if they tap anyway. */
  reasonTr: string;
  /** What happens to the money when the cancellation goes through. */
  refund: 'full' | 'none';
}

/**
 * The single source of truth for "can this still be cancelled".
 *
 * Deliberately conservative in one direction only: while the job is merely `queued` or
 * `submitted` (we have generated the work order, a human may not have sent it yet) the
 * parent still wins. After the partner accepts it, they do not — and they were told so
 * before they paid.
 */
export function evaluateCancellation(input: CancellationInput): CancellationVerdict {
  const printed = input.printJobStatus !== undefined && IRREVERSIBLE_PRINT_STATES.has(input.printJobStatus);

  switch (input.status) {
    case 'created':
    case 'awaiting_payment':
      return {
        allowed: true,
        reasonTr: 'Siparişiniz henüz ödenmedi; iptal edebilirsiniz.',
        refund: 'none',
      };
    case 'paid':
      if (printed) {
        return {
          allowed: false,
          reasonTr:
            'Kitabınız baskıya girdiği için sipariş iptal edilemiyor. Kişiye özel üretim olduğu için cayma hakkı bulunmuyor; kitap kusurlu gelirse ücretsiz yeniliyoruz.',
          refund: 'none',
        };
      }
      return {
        allowed: true,
        reasonTr: 'Kitabınız henüz baskıya girmedi; iptal ederseniz ödemeniz iade edilir.',
        refund: 'full',
      };
    case 'in_production':
      if (printed) {
        return {
          allowed: false,
          reasonTr:
            'Kitabınız matbaada basılıyor; bu aşamadan sonra iptal mümkün değil. Kişiye özel üretim olduğu için cayma hakkı bulunmuyor.',
          refund: 'none',
        };
      }
      return {
        allowed: true,
        reasonTr:
          'Kitabınız hazırlanıyor ama henüz baskıya girmedi; şimdi iptal ederseniz ödemeniz iade edilir.',
        refund: 'full',
      };
    case 'shipped':
      return {
        allowed: false,
        reasonTr: 'Kitabınız kargoya verildi; sipariş iptal edilemiyor.',
        refund: 'none',
      };
    case 'delivered':
      return {
        allowed: false,
        reasonTr:
          'Kitabınız teslim edildi. Kusurlu ya da hatalı geldiyse 30 gün içinde Siparişlerim ekranından bildirin, ücretsiz yeniliyoruz.',
        refund: 'none',
      };
    case 'cancelled':
      return { allowed: false, reasonTr: 'Bu sipariş zaten iptal edilmiş.', refund: 'none' };
    case 'refunded':
      return { allowed: false, reasonTr: 'Bu siparişin bedeli zaten iade edilmiş.', refund: 'none' };
    case 'failed':
      return {
        allowed: true,
        reasonTr: 'Siparişte bir sorun oluştu; iptal edip ödemenizi iade ediyoruz.',
        refund: 'full',
      };
    default:
      return { allowed: false, reasonTr: 'Sipariş durumu okunamadı.', refund: 'none' };
  }
}

/**
 * DB status (+ where the paper is) → the contract's Turkish enum.
 *
 * `in_production` splits in two because the parent cares about the difference: "hazırlanıyor"
 * still feels stoppable, "baskıda" is the point of no return the app warned about.
 */
export function toContractStatus(
  status: OrderStatus,
  printJobStatus?: PrintJobStatus,
): ContractOrderStatus {
  switch (status) {
    case 'created':
    case 'awaiting_payment':
      return 'odeme_bekliyor';
    case 'paid':
      return 'odendi';
    case 'in_production':
      return printJobStatus !== undefined && IRREVERSIBLE_PRINT_STATES.has(printJobStatus)
        ? 'baskida'
        : 'uretimde';
    case 'shipped':
      return 'kargoya_verildi';
    case 'delivered':
      return 'teslim_edildi';
    case 'cancelled':
    case 'failed':
      return 'iptal_edildi';
    case 'refunded':
      return 'iade_edildi';
    default:
      return 'odeme_bekliyor';
  }
}

/** One timeline line per status, in the parent's language (contract `Order.timeline`). */
export const ORDER_TIMELINE_TR: Record<ContractOrderStatus, string> = {
  odeme_bekliyor: 'Siparişiniz alındı, ödeme bekleniyor',
  odendi: 'Ödemeniz onaylandı',
  uretimde: 'Baskı dosyanız hazırlandı',
  baskida: 'Kitabınız baskıya girdi',
  kargoya_verildi: 'Kitabınız kargoya verildi',
  teslim_edildi: 'Kitabınız teslim edildi',
  iptal_edildi: 'Siparişiniz iptal edildi',
  iade_edildi: 'Ödemeniz iade edildi',
};

/** Print-job status → order status, for the worker's status poller / webhook handler. */
export function orderStatusForPrintJob(printJobStatus: PrintJobStatus): OrderStatus | undefined {
  switch (printJobStatus) {
    case 'submitted':
    case 'accepted':
    case 'printing':
      return 'in_production';
    case 'shipped':
      return 'shipped';
    case 'cancelled':
      return 'cancelled';
    case 'error':
      return 'failed';
    default:
      return undefined;
  }
}
