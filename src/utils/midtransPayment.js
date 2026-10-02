import ApiService from "@/store/api.service";
import config from "@/ConfigProvider";
import { removePendingPayment } from "@/utils/pendingPayments";
import { isNotStartedPaymentSession } from "@/utils/paymentSessionState";

// Pembayaran online dinonaktifkan sementara selama Midtrans masih sandbox.
// Default MATI; nyalakan dengan VUE_APP_MIDTRANS_ENABLED=true saat build.
// api-NG punya saklar sendiri (MIDTRANS_ENABLED) yang menolak snap-token.
export const isMidtransEnabled = () =>
  String(config.value("MIDTRANS_ENABLED") || "").toLowerCase() === "true";

const TERMINAL_PAYMENT_STATUSES = new Set(["settlement", "failed", "expired", "refunded"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeResponse = (response) => response?.data || response || {};

export const isTerminalPaymentStatus = (paymentStatus) => TERMINAL_PAYMENT_STATUSES.has(paymentStatus);

export const syncPaymentStatus = async (orderId, options = {}) => {
  const { attempts = 3, delayMs = 1200, removeWhenTerminal = true } = options;
  if (!orderId) return null;

  let lastResult = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await ApiService.postJson("/payments/verify", { orderId });
      lastResult = normalizeResponse(response);

      if (isTerminalPaymentStatus(lastResult.paymentStatus)) {
        if (removeWhenTerminal) {
          removePendingPayment(orderId);
          window.dispatchEvent(new Event("iom:pending-updated"));
        }
        return lastResult;
      }
    } catch (error) {
      lastResult = { message: error?.message || "Failed to verify payment status" };
    }

    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return lastResult;
};

export const cancelPayment = async (orderId, options = {}) => {
  if (!orderId) return null;

  const publicToken = options.publicToken || options.orderStatusToken || options.trackingToken || null;
  const response = await ApiService.postJson("/payments/cancel", { orderId, publicToken });
  const result = normalizeResponse(response);

  if (isTerminalPaymentStatus(result.paymentStatus) || isNotStartedPaymentSession(result.paymentSessionState)) {
    removePendingPayment(orderId);
    window.dispatchEvent(new Event("iom:pending-updated"));
  }

  return result;
};
