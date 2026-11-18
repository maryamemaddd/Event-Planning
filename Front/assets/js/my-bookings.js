/* =========================================================
   EventOps · My Bookings
   GET /api/bookings/me
   ========================================================= */

const TABS = ["all", "pending_payment", "confirmed", "cancelled", "expired"];

const STATUS_META = {
  confirmed: { label: "Confirmed", badge: "badge-upcoming" },
  pending_payment: { label: "Pending payment", badge: "badge-pending" },
  cancelled: { label: "Cancelled", badge: "badge-cancelled" },
  expired: { label: "Expired", badge: "badge-completed" },
};

let bookings = [];
let activeStatus = "all";
let ticker = null;

const expiredSeen = new Set();

/* ---------- helpers ---------- */
const money = (v) => "EGP " + Number(v || 0).toLocaleString("en-US");
const priceText = (v) => (Number(v) === 0 ? "Free" : money(v));

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function formatDate(value) {
  const d = new Date(value);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTimeRange(start, end) {
  const fmt = (v) => {
    const d = new Date(v);
    return isNaN(d) ? "" : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };
  return `${fmt(start)} - ${fmt(end)}`;
}

function remainingText(expiresAt) {
  const t = new Date(expiresAt).getTime();
  if (!expiresAt || isNaN(t)) return "--:--";
  const ms = t - Date.now();
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/* ---------- toasts ---------- */
function toast(title, text = "", type = "error") {
  const stack = document.getElementById("toastStack");
  const el = document.createElement("div");
  const variant = type === "success" ? " toast-msg--success" : type === "info" ? " toast-msg--info" : "";
  const icon = type === "success" ? "bi-check-lg" : type === "info" ? "bi-info-lg" : "bi-exclamation-lg";
  el.className = "toast-msg" + variant;
  el.innerHTML = `
    <span class="toast-msg__icon"><i class="bi ${icon}"></i></span>
    <div class="toast-msg__body">
      <div class="toast-msg__title">${escapeHtml(title)}</div>
      ${text ? `<div class="toast-msg__text">${escapeHtml(text)}</div>` : ""}
    </div>
    <button class="toast-msg__close" aria-label="Dismiss">&times;</button>`;

  const remove = () => el.remove();
  el.querySelector(".toast-msg__close").addEventListener("click", remove);
  stack.appendChild(el);
  setTimeout(remove, 4200);
}

/* ===================== RENDER ===================== */
function renderCard(b) {
  const ev = b.event || {};
  const seat = b.seat || {};
  const meta = STATUS_META[b.status] || { label: b.status || "—", badge: "badge-draft" };
  const image = `https://picsum.photos/seed/${encodeURIComponent(b._id)}/300/220`;

  let action = "";
  if (b.status === "confirmed") {
    action = `
      <button class="btn-view" type="button" data-action="ticket" data-id="${b._id}">View ticket</button>
      <button class="btn-cancel" type="button" data-action="cancel" data-id="${b._id}">Cancel booking</button>`;
  } else if (b.status === "pending_payment") {
    action = `
      <div class="hold">
        <span class="hold__label"><i class="bi bi-clock"></i> Hold expires in</span>
        <span class="hold__timer" data-expires="${escapeHtml(b.expiresAt || "")}" data-id="${b._id}">--:--</span>
      </div>
      <button class="btn-brand booking-card__pay" type="button" data-action="pay" data-id="${b._id}">Pay now</button>
      <button class="btn-cancel" type="button" data-action="cancel" data-id="${b._id}">Cancel</button>`;
  }

  return `
    <article class="booking-card">
      <img class="booking-card__thumb" src="${image}" alt="${escapeHtml(ev.title || "Event")}" loading="lazy" />
      <div class="booking-card__body">
        <div class="booking-card__info">
          <h3 class="booking-card__title">${escapeHtml(ev.title || "Untitled event")}</h3>
          <div class="booking-card__meta">
            <span><i class="bi bi-calendar3"></i>${formatDate(ev.startsAt)} &nbsp; ${formatTimeRange(ev.startsAt, ev.endsAt)}</span>
            <span><i class="bi bi-geo-alt"></i>${escapeHtml(ev.venue || "—")}</span>
          </div>
          <div class="booking-card__tags">
            <span class="seat-chip"><i class="bi bi-armchair"></i>Seat ${escapeHtml(seat.label || "—")}</span>
            <span class="seat-chip seat-chip--amount">${priceText(ev.price)}</span>
          </div>
        </div>
        <div class="booking-card__side">
          <span class="badge-soft ${meta.badge}">${meta.label}</span>
          ${action}
        </div>
      </div>
    </article>`;
}

function renderList() {
  const el = document.getElementById("bookingList");
  const list = activeStatus === "all" ? bookings : bookings.filter((b) => b.status === activeStatus);

  if (!list.length) {
    el.innerHTML = `<div class="empty-note">No bookings to show here yet.</div>`;
    return;
  }

  el.innerHTML = list.map(renderCard).join("");
}

function renderTabs() {
  TABS.forEach((status) => {
    const el = document.querySelector(`[data-count="${status}"]`);
    if (!el) return;
    el.textContent = status === "all"
      ? bookings.length
      : bookings.filter((b) => b.status === status).length;
  });
}

/* ===================== TIMERS ===================== */
function updateTimers() {
  let needReload = false;

  document.querySelectorAll("[data-expires]").forEach((el) => {
    const text = remainingText(el.dataset.expires);
    el.textContent = text;
    if (text === "00:00" && !expiredSeen.has(el.dataset.id)) {
      expiredSeen.add(el.dataset.id);
      needReload = true;
    }
  });

  if (needReload) loadBookings();
}

/* ===================== DATA ===================== */
async function loadBookings() {
  try {
    bookings = await API.myBookings();
  } catch (err) {
    if (err.status === 401) return API.logout();
    bookings = [];
    toast("Unable to load bookings", err.message || "Please try again.");
  }
  renderTabs();
  renderList();
  updateTimers();
}

/* ===================== INTERACTIONS ===================== */
function onListClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  if (btn.dataset.action === "ticket") {
    window.location.href = `ticket.html?id=${encodeURIComponent(btn.dataset.id)}`;
  } else if (btn.dataset.action === "pay") {
    window.location.href = `checkout.html?booking=${encodeURIComponent(btn.dataset.id)}`;
  } else if (btn.dataset.action === "cancel") {
    // Prevent stacking multiple cancel modals
    if (document.querySelector(".modal-overlay")) return;
    const booking = bookings.find((x) => x._id === btn.dataset.id);
    if (booking) confirmCancel(booking);
  }
}

/* ===================== CANCEL ===================== */
function confirmCancel(b) {
  if (document.querySelector(".modal-overlay")) return;
  const ev = b.event || {};
  const seat = b.seat || {};
  const paid = Number(ev.price) > 0 && b.status === "confirmed";
  const isFree = Number(ev.price) === 0;
  const refundLine = paid
    ? `You'll be refunded <strong>${money(ev.price)}</strong>. Enter the card/account number where you'd like to receive it — the refund will be processed within 7 days.`
    : "No payment was taken, so there's nothing to refund.";

  const accountField = paid
    ? `<div class="modal__field">
         <label class="modal__label" for="refundAccountInput">
           <i class="bi bi-credit-card-2-front"></i> Card / account number
         </label>
         <input class="modal__input" id="refundAccountInput" type="text" placeholder="e.g. 4111 1111 1111 1111" autocomplete="off" />
         <p class="modal__field-error" id="refundAccountError" hidden></p>
       </div>`
    : "";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="cancelTitle">
      <div class="modal__icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
      <h3 class="modal__title" id="cancelTitle">Cancel this booking?</h3>

      <div class="modal__summary">
        <div class="modal__summary-row">
          <span class="modal__summary-label"><i class="bi bi-calendar-event"></i> Event</span>
          <span class="modal__summary-value">${escapeHtml(ev.title || "This event")}</span>
        </div>
        <div class="modal__summary-row">
          <span class="modal__summary-label"><i class="bi bi-armchair"></i> Seat</span>
          <span class="modal__summary-value">${escapeHtml(seat.label || "-")}</span>
        </div>
        <div class="modal__summary-row">
          <span class="modal__summary-label"><i class="bi bi-tag"></i> Price</span>
          <span class="modal__summary-value ${isFree ? "" : "is-paid"}">${priceText(ev.price)}</span>
        </div>
      </div>

      <p class="modal__refund">${refundLine}</p>
      <p class="modal__note"><i class="bi bi-info-circle"></i> The seat will be released. This can't be undone.</p>

      ${accountField}
      <p class="modal__error" id="cancelError" hidden></p>

      <div class="modal__actions">
        <button class="btn-view modal__keep" type="button" data-modal="close">
          <i class="bi bi-check-lg"></i> Keep booking
        </button>
        <button class="btn-danger modal__confirm" type="button" data-modal="confirm">
          <i class="bi bi-x-circle"></i> Yes, cancel
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  // Add the open class synchronously (rAF can be unreliable and leaves
  // the overlay invisible/unclickable, which looks like "nothing happens").
  overlay.classList.add("is-open");

  const accountInput = overlay.querySelector("#refundAccountInput");
  if (accountInput) {
    accountInput.addEventListener("input", () => {
      const aErr = overlay.querySelector("#refundAccountError");
      if (aErr) { aErr.textContent = ""; aErr.hidden = true; }
      const cErr = overlay.querySelector("#cancelError");
      if (cErr) { cErr.textContent = ""; cErr.hidden = true; }
    });
  }

  // Move focus into the modal.
  const moveFocus = () => {
    const input = overlay.querySelector("#refundAccountInput");
    const confirmBtn = overlay.querySelector('[data-modal="confirm"]');
    if (input) input.focus();
    else if (confirmBtn) confirmBtn.focus();
  };
  moveFocus();
  setTimeout(moveFocus, 0);
  setTimeout(moveFocus, 50);

  const close = () => {
    overlay.classList.remove("is-open");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => overlay.remove(), 180);
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);

  const closeBtn = overlay.querySelector('[data-modal="close"]');
  const confirmBtn = overlay.querySelector('[data-modal="confirm"]');
  if (closeBtn) closeBtn.addEventListener("click", close);

  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      const errEl = overlay.querySelector("#cancelError");
      const accountErrEl = overlay.querySelector("#refundAccountError");
      if (errEl) { errEl.textContent = ""; errEl.hidden = true; }
      if (accountErrEl) { accountErrEl.textContent = ""; accountErrEl.hidden = true; }

      let refundAccount = "";
      if (paid) {
        const input = overlay.querySelector("#refundAccountInput");
        refundAccount = (input ? input.value : "").trim();
        if (!refundAccount) {
          if (accountErrEl) { accountErrEl.textContent = "Please enter your card/account number for the refund."; accountErrEl.hidden = false; }
          if (input) input.focus();
          return;
        }
      }

      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Cancelling...';

      try {
        const res = await API.cancelMyBooking(b._id, paid ? { refundAccount } : {});
        close();
        const refundPending = res && res.refundPending;
        const amount = res && res.amount;
        toast(
          "Booking cancelled",
          refundPending
            ? `Refunded ${money(amount || ev.price)} — it will be sent to your account within 7 days.`
            : "The seat has been released.",
          "info",
        );
        await loadBookings();
      } catch (err) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = "Yes, cancel";
        if (err.status === 401) return API.logout();
        const msg = (err && err.message) || "Please try again.";
        if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
        toast("Couldn't cancel booking", msg);
      }
    });
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
}

/* ===================== INIT ===================== */
async function init() {
  if (!API.isLoggedIn()) {
    window.location.href = "login.html";
    return;
  }

  const user = API.getUser();
  const nameEl = document.querySelector(".profile__name");
  if (nameEl && user && user.name) nameEl.textContent = user.name;

  document.getElementById("statusTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".status-tab");
    if (!btn) return;
    activeStatus = btn.dataset.status;
    document.querySelectorAll(".status-tab").forEach((t) => t.classList.toggle("is-active", t === btn));
    renderList();
  });

  document.getElementById("bookingList").addEventListener("click", onListClick);

  await loadBookings();
  ticker = setInterval(updateTimers, 1000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
