/* =========================================================
   EventOps · Checkout (#6)
   POST /api/payments/initiate        { bookingId, amount, provider:'paymob'|'mock' }
   POST /api/payments/mock-confirm/:transactionId
   GET  /api/payments/booking/:bookingId   (recover a pending tx on 409)
   GET  /api/bookings/me  ·  GET /api/events/:id  ·  GET /api/events/:id/seats
   ========================================================= */

const state = { bookingId: Views.getParam("booking"), booking: null, event: null, seatLabel: null, timer: null };
let selectedProvider = "paymob"; // Default to Paymob for real payments

const els = {
  banner: document.getElementById("holdBanner"),
  timer: document.getElementById("holdTimer"),
  alert: document.getElementById("alertBox"),
  summary: document.getElementById("orderSummary"),
  pay: document.getElementById("payBtn"),
  name: document.getElementById("cardName"),
  number: document.getElementById("cardNumber"),
  expiry: document.getElementById("cardExpiry"),
  cvc: document.getElementById("cardCvc"),
  paymobSection: document.getElementById("paymobSection"),
  mockSection: document.getElementById("mockSection"),
  providerBadge: document.getElementById("currentProviderBadge"),
  providerPaymobOpt: document.getElementById("providerPaymobOpt"),
  providerMockOpt: document.getElementById("providerMockOpt"),
};

function showAlert(kind, text, actions = "") {
  els.alert.innerHTML = `<div class="banner banner--${kind}"><i class="bi ${kind === "red" ? "bi-x-octagon" : "bi-info-circle"}"></i><span>${text}</span>${actions}</div>`;
}

function updatePayButtonText() {
  if (!els.pay) return;
  if (selectedProvider === "paymob") {
    els.pay.innerHTML = '<i class="bi bi-credit-card-2-front-fill"></i> Pay with Paymob';
  } else {
    els.pay.innerHTML = '<i class="bi bi-lock-fill"></i> Pay now (Mock)';
  }
}

function renderSummary(amount, fee) {
  const net = amount - fee;
  els.summary.innerHTML = `
    <dl>
      <div class="summary-row"><dt>Event</dt><dd>${Views.escapeHtml(state.event?.title || "—")}</dd></div>
      <div class="summary-row"><dt>Seat</dt><dd>${state.seatLabel ? Views.escapeHtml(state.seatLabel) : "—"}</dd></div>
      <div class="summary-row"><dt>Amount</dt><dd>${Views.money(amount)}</dd></div>
      <div class="summary-row"><dt>Fee</dt><dd>${Views.money(fee)}</dd></div>
      <div class="summary-row summary-row--total"><dt>Total</dt><dd>${Views.money(net)}</dd></div>
    </dl>`;
  els.pay.disabled = false;
  updatePayButtonText();
}

function startCountdown() {
  const expires = state.booking?.expiresAt ? new Date(state.booking.expiresAt).getTime() : NaN;
  if (isNaN(expires)) return;
  els.banner.hidden = false;

  const tick = () => {
    const diff = expires - Date.now();
    if (diff <= 0) {
      clearInterval(state.timer);
      els.timer.textContent = "00:00";
      els.pay.disabled = true;
      showAlert("red", "Your seat hold has expired. Please book the seat again.",
        ` <a class="btn btn--sm" href="event-details.html?id=${state.booking.event}" style="margin-left:auto;">Back to event</a>`);
      return;
    }
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    els.timer.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };
  tick();
  state.timer = setInterval(tick, 1000);
}

async function loadOrder() {
  if (!state.bookingId) {
    showAlert("red", "No booking specified. Start again from an event.");
    return;
  }
  try {
    const bookings = await API.myBookings();
    state.booking = bookings.find((b) => b._id === state.bookingId);
    if (!state.booking) { showAlert("red", "We could not find that booking."); return; }

    if (state.booking.status === "confirmed") {
      showAlert("green", "This booking is already confirmed.",
        ` <a class="btn btn--sm" href="ticket.html?id=${state.bookingId}" style="margin-left:auto;">View ticket</a>`);
      els.summary.innerHTML = "";
      return;
    }
    if (state.booking.status !== "pending_payment") {
      showAlert("amber", `This booking is ${Views.titleCase(state.booking.status)} and can no longer be paid.`);
      return;
    }

    const eventId = state.booking.event?._id || state.booking.event;
    state.event = await API.getEvent(eventId);
    try {
      const seats = await API.getSeats(eventId);
      const seat = seats.find((s) => s._id === (state.booking.seat?._id || state.booking.seat));
      state.seatLabel = seat?.label || null;
    } catch { /* seat label optional */ }

    const amount = Number(state.event?.price ?? 0);
    renderSummary(amount, 0);
    startCountdown();
  } catch (err) {
    showAlert("red", "Could not load your booking.");
    Views.handleError(err);
  }
}

/* Turn Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) numerals into
   ASCII digits so an Arabic keyboard can't fail validation. */
function normalizeDigits(str) {
  return String(str || "")
    .replace(/[\u0660-\u0669]/g, (c) => c.charCodeAt(0) - 0x0660)
    .replace(/[\u06f0-\u06f9]/g, (c) => c.charCodeAt(0) - 0x06f0);
}

function digitsOnly(str) {
  return normalizeDigits(str).replace(/\D/g, "");
}

function cardValid() {
  const name = els.name.value.trim();
  const number = digitsOnly(els.number.value);
  const expiry = digitsOnly(els.expiry.value);
  const cvc = digitsOnly(els.cvc.value);
  return (
    name.length >= 2 &&
    number.length >= 12 &&
    (expiry.length === 4 || expiry.length === 6) &&
    cvc.length >= 3
  );
}

async function payNow() {
  if (!state.booking) return;

  if (selectedProvider === "mock") {
    if (!cardValid()) {
      showAlert("amber", "Please complete the card details (any test values will do).");
      return;
    }
  }

  els.pay.disabled = true;
  els.pay.innerHTML = selectedProvider === "paymob"
    ? '<i class="bi bi-hourglass-split"></i> Connecting to Paymob…'
    : '<i class="bi bi-hourglass-split"></i> Processing…';

  try {
    let tx;
    try {
      tx = await API.initiatePayment({
        bookingId: state.bookingId,
        amount: Number(state.event?.price ?? 0),
        provider: selectedProvider,
      });
    } catch (err) {
      if (err.status === 409) {
        tx = await API.paymentByBooking(state.bookingId); // recover the existing pending transaction
      } else {
        throw err;
      }
    }

    if (selectedProvider === "paymob") {
      const checkoutUrl = tx?.checkoutUrl || tx?.data?.checkoutUrl;
      if (checkoutUrl) {
        if (state.timer) clearInterval(state.timer);
        window.location.href = checkoutUrl;
        return;
      }
      throw new Error("Paymob checkout URL was not generated. Please try again.");
    }

    // Mock flow
    const txId = tx?._id || tx?.transaction?._id || tx?.data?._id;
    if (!txId) throw new Error("No transaction returned");

    const result = await API.confirmPayment(txId);
    if (state.timer) clearInterval(state.timer);

    const ok = result?.booking?.status === "confirmed";
    window.location.href = `payment-result.html?booking=${state.bookingId}&status=${ok ? "success" : "failed"}`;
  } catch (err) {
    Views.handleError(err);
    showAlert("red", (err && err.message) || "Payment failed. Please try again.");
    els.pay.disabled = false;
    updatePayButtonText();
  }
}

function bindFormatting() {
  // Provider selector toggling
  const radios = document.querySelectorAll('input[name="paymentProvider"]');
  radios.forEach((r) => {
    r.addEventListener("change", (e) => {
      selectedProvider = e.target.value;
      if (selectedProvider === "paymob") {
        if (els.providerPaymobOpt) els.providerPaymobOpt.classList.add("is-active");
        if (els.providerMockOpt) els.providerMockOpt.classList.remove("is-active");
        if (els.paymobSection) els.paymobSection.hidden = false;
        if (els.mockSection) els.mockSection.hidden = true;
        if (els.providerBadge) els.providerBadge.innerHTML = '<i class="bi bi-shield-lock-fill"></i> Paymob';
      } else {
        if (els.providerMockOpt) els.providerMockOpt.classList.add("is-active");
        if (els.providerPaymobOpt) els.providerPaymobOpt.classList.remove("is-active");
        if (els.paymobSection) els.paymobSection.hidden = true;
        if (els.mockSection) els.mockSection.hidden = false;
        if (els.providerBadge) els.providerBadge.innerHTML = '<i class="bi bi-shield-check"></i> Mock Payment';
      }
      updatePayButtonText();
      if (els.alert) els.alert.innerHTML = "";
    });
  });

  els.number.addEventListener("input", () => {
    const digits = digitsOnly(els.number.value).slice(0, 16);
    els.number.value = digits.replace(/(.{4})/g, "$1 ").trim();
  });
  els.expiry.addEventListener("input", () => {
    const d = digitsOnly(els.expiry.value).slice(0, 4);
    els.expiry.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  });
  els.cvc.addEventListener("input", () => {
    els.cvc.value = digitsOnly(els.cvc.value).slice(0, 4);
  });
  [els.name, els.number, els.expiry, els.cvc].forEach((el) => el.addEventListener("input", () => {
    if (cardValid()) els.alert.innerHTML = "";
  }));

  const demo = document.getElementById("demoFill");
  if (demo) demo.addEventListener("click", () => {
    const fill = (el, value) => { el.value = value; el.dispatchEvent(new Event("input")); };
    fill(els.name, "Demo User");
    fill(els.number, "4242424242424242");
    fill(els.expiry, "1225");
    fill(els.cvc, "123");
    els.alert.innerHTML = "";
    els.pay.focus();
  });

  els.pay.addEventListener("click", payNow);
}

async function init() {
  const user = await Views.requireUser();
  if (!user) return;
  bindFormatting();
  loadOrder();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
