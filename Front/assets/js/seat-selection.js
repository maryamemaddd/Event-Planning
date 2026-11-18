/* =========================================================
   EventOps · Seat Selection
   GET  /api/events/:id/seats
   POST /api/events/:id/bookings
   ========================================================= */

const COLS = 12;

const params = new URLSearchParams(location.search);
const EVENT_ID = params.get("id") || location.pathname.split("/").pop();

const grid = document.getElementById("seatGrid");
const confirmBtn = document.getElementById("confirmBtn");

let event = null;
let seats = [];            // [{ _id, label, status }]
let selectedSeat = null;   // { id, label }
let userBookings = [];     // user's active bookings for this event

/* ---------- helpers ---------- */
const money = (v) => "EGP " + Number(v || 0).toLocaleString("en-US");
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- toasts ---------- */
function toast(title, text = "", type = "error") {
  const stack = document.getElementById("toastStack");
  const el = document.createElement("div");
  el.className = "toast-msg" + (type === "success" ? " toast-msg--success" : type === "info" ? " toast-msg--info" : "");
  el.innerHTML = `
    <span class="toast-msg__icon"><i class="bi ${type === "success" ? "bi-check-lg" : type === "info" ? "bi-info-lg" : "bi-exclamation-lg"}"></i></span>
    <div class="toast-msg__body">
      <div class="toast-msg__title">${escapeHtml(title)}</div>
      ${text ? `<div class="toast-msg__text">${text}</div>` : ""}
    </div>
    <button class="toast-msg__close" aria-label="Dismiss">&times;</button>`;

  const remove = () => el.remove();
  el.querySelector(".toast-msg__close").addEventListener("click", remove);
  stack.appendChild(el);
  setTimeout(remove, 4500);
}

/* ---------- data ---------- */
async function loadEvent() {
  try {
    return await API.getEvent(EVENT_ID);
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      return { _unauthorized: true, status: err.status, message: err.message };
    }
    return null;
  }
}

async function loadSeats() {
  try {
    return await API.getSeats(EVENT_ID);
  } catch {
    return [];
  }
}

/* ===================== RENDER ===================== */
function seatClass(status) {
  return status === "held" ? "seat--held"
    : status === "booked" ? "seat--booked"
    : "seat--available";
}

function renderSeatMap() {
  const mySeatIds = new Set(userBookings.map((b) => String(b.seat?._id || b.seat)));
  const rows = [];
  for (let i = 0; i < seats.length; i += COLS) rows.push(seats.slice(i, i + COLS));

  grid.innerHTML = rows
    .map((rowSeats, r) => {
      const rowLabel = String.fromCharCode(65 + r);
      const cells = rowSeats
        .map((seat) => {
          const label = seat.label || String(seat._id).slice(-4);
          const face = String(label).replace(/^\D+/, "") || label;
          const isMine = mySeatIds.has(String(seat._id));
          const selected = selectedSeat && selectedSeat.id === seat._id;
          let cls = selected ? "seat--selected" : seatClass(seat.status);
          if (isMine) cls += " seat--mine";
          const disabled = seat.status !== "available" ? "disabled" : "";
          const title = isMine
            ? `${escapeHtml(label)} · Your booked seat`
            : `${escapeHtml(label)} · ${seat.status}`;
          return `<button class="seat ${cls}" type="button"
                    data-seat-id="${seat._id}" data-label="${escapeHtml(label)}"
                    ${disabled} title="${title}">${escapeHtml(face)}</button>`;
        })
        .join("");
      return `<div class="seat-row"><span class="seat-row__label">${rowLabel}</span><div class="seat-row__seats">${cells}</div></div>`;
    })
    .join("");
}

function updateSummary() {
  const isPrivate = event && event.visibility === "private";
  const hasPrivateBooking = isPrivate && userBookings.length > 0;

  document.getElementById("eventName").textContent = event ? event.title : "—";
  document.getElementById("summaryEvent").textContent = event ? event.title : "—";

  const priceText = event ? (Number(event.price) === 0 ? "Free" : money(event.price)) : "—";
  document.getElementById("summaryPrice").textContent = priceText;
  document.getElementById("summarySeat").textContent = selectedSeat ? selectedSeat.label : (hasPrivateBooking ? "1 seat (already booked)" : "—");
  document.getElementById("summaryTotal").textContent =
    event && selectedSeat ? (Number(event.price) === 0 ? "Free" : money(event.price)) : money(0);

  // Update footnote
  const foot = document.getElementById("seatMapFoot");
  if (foot) {
    if (isPrivate) {
      foot.innerHTML = hasPrivateBooking
        ? '<i class="bi bi-lock-fill"></i> Private event — 1 seat limit per attendee (you already have a booking).'
        : '<i class="bi bi-lock-fill"></i> Private event: Choose your seat (strictly 1 seat per attendee).';
    } else {
      foot.innerHTML = '<i class="bi bi-globe2"></i> Public event: You can book multiple seats!';
    }
  }

  // Handle private event with existing booking
  if (hasPrivateBooking) {
    const existing = userBookings[0];
    confirmBtn.disabled = false;
    if (existing.status === "confirmed") {
      confirmBtn.innerHTML = '<i class="bi bi-ticket-perforated"></i> View your ticket';
      confirmBtn.onclick = () => {
        window.location.href = `ticket.html?id=${existing._id}`;
      };
    } else {
      confirmBtn.innerHTML = '<i class="bi bi-clock-history"></i> Complete payment';
      confirmBtn.onclick = () => {
        window.location.href = `checkout.html?booking=${existing._id}`;
      };
    }
    return;
  }

  confirmBtn.onclick = confirmBooking;
  confirmBtn.disabled = !selectedSeat;
  confirmBtn.innerHTML = event && Number(event.price) > 0
    ? '<i class="bi bi-clock-history"></i> Hold seat'
    : '<i class="bi bi-check-lg"></i> Confirm booking';
}

/* ===================== SELECTION ===================== */
grid.addEventListener("click", (e) => {
  const btn = e.target.closest(".seat");
  if (!btn || btn.disabled) return;

  if (event && event.visibility === "private" && userBookings.length > 0) {
    toast("Limit reached", "Private events are limited to 1 seat per attendee. You already have a booking.", "info");
    return;
  }

  const id = btn.dataset.seatId;
  if (selectedSeat && selectedSeat.id === id) {
    selectedSeat = null;                    // deselect
  } else {
    selectedSeat = { id, label: btn.dataset.label };
  }

  renderSeatMap();
  updateSummary();
});

/* ===================== CONFIRM & PAY ===================== */
async function confirmBooking() {
  if (!selectedSeat) return;

  if (!API.isLoggedIn()) {
    toast("Please login to continue", "You need an account to book a seat.");
    setTimeout(() => (window.location.href = "login.html"), 1400);
    return;
  }

  if (event && event.visibility === "private" && userBookings.length > 0) {
    toast("Limit reached", "Private events are limited to 1 seat per attendee.", "info");
    return;
  }

  confirmBtn.disabled = true;
  const original = confirmBtn.innerHTML;
  confirmBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Processing...';

  const seatId = selectedSeat.id;
  const seatLabel = selectedSeat.label;

  try {
    const body = await API.createBooking(EVENT_ID, seatId);

    const isPendingPayment = body && body.data && body.data.status === "pending_payment";
    const bookingId = body && body.data && body.data._id;

    if (body && body.data) {
      userBookings.push(body.data);
    }

    const seat = seats.find((s) => s._id === seatId);
    if (seat) seat.status = event && Number(event.price) > 0 ? "held" : "booked";
    selectedSeat = null;

    if (isPendingPayment && bookingId) {
      toast(
        "Seat held",
        `Seat ${seatLabel} held. Taking you to payment…`,
        "success",
      );
      renderSeatMap();
      updateSummary();
      setTimeout(() => (window.location.href = `checkout.html?booking=${bookingId}`), 1400);
    } else {
      // Free event confirmed
      if (event && event.visibility === "public") {
        toast(
          "Booking confirmed",
          `Seat ${seatLabel} confirmed! You can select another seat to book more, or <a href="my-bookings.html" style="color:#16a34a;font-weight:700;text-decoration:underline;">view your bookings</a>.`,
          "success",
        );
        renderSeatMap();
        updateSummary();
      } else {
        toast(
          "Booking confirmed",
          `Seat ${seatLabel} confirmed successfully!`,
          "success",
        );
        renderSeatMap();
        updateSummary();
        setTimeout(() => (window.location.href = "my-bookings.html"), 1600);
      }
    }

  } catch (err) {
    /* 409 covers two different situations:
       (a) in private event: user hit the 1 seat limit, or
       (b) seat was taken in the meantime. */
    if (err.status === 409) {
      const isPrivateLimit = /only book one seat|active booking/i.test(err.message || "");

      if (isPrivateLimit && event && event.visibility === "private") {
        toast("Private event limit", "Private events are limited to 1 seat per attendee.", "info");
        try {
          const mine = await API.myBookings();
          userBookings = mine.filter(
            (b) =>
              String(b.event?._id || b.event) === String(EVENT_ID) &&
              ["pending_payment", "confirmed"].includes(b.status),
          );
        } catch {}
        renderSeatMap();
        updateSummary();
        return;
      }

      /* genuine seat conflict */
      toast("Seat no longer available", "Someone just booked this seat. Please choose another.");
      const seat = seats.find((s) => s._id === seatId);
      if (seat) seat.status = "booked";
      selectedSeat = null;
      renderSeatMap();
      updateSummary();
      return;
    }

    /* 401 · not authenticated */
    if (err.status === 401) {
      toast("Session expired", "Please login again.");
      setTimeout(() => (window.location.href = "login.html"), 1400);
      return;
    }

    if (err.status === undefined) {
      toast("Unable to connect", "Check your connection and try again.");
      return;
    }

    toast(err.message || "Booking failed", "Please try again.");

  } finally {
    confirmBtn.innerHTML = original;
    updateSummary();
  }
}

/* ===================== INIT ===================== */
async function init() {
  // Admins can't book events — send them back to the event page
  const sessionUser = API.getUser();
  if (sessionUser && sessionUser.role === "admin") {
    window.location.href = `event-details.html?id=${EVENT_ID}`;
    return;
  }

  const [ev, seatList] = await Promise.all([loadEvent(), loadSeats()]);
  event = ev;
  seats = seatList;

  if (!event || event._unauthorized) {
    if (event && event._unauthorized && event.status === 401) {
      document.getElementById("eventName").textContent = "Private Event";
      grid.innerHTML = `<div class="empty-note">This is a private event. Please <a href="login.html?redirect=${encodeURIComponent(window.location.href)}" style="color:var(--brand);font-weight:700;">login with your invited account</a> to view seats.</div>`;
    } else {
      document.getElementById("eventName").textContent = "Event not accessible";
      grid.innerHTML = `<div class="empty-note">This event could not be found or you are not invited.</div>`;
    }
    updateSummary();
    return;
  }

  // Load user bookings for this event
  if (API.isLoggedIn()) {
    try {
      const mine = await API.myBookings();
      userBookings = mine.filter(
        (b) =>
          String(b.event?._id || b.event) === String(EVENT_ID) &&
          ["pending_payment", "confirmed"].includes(b.status),
      );
    } catch {}
  }

  if (!seats.length) {
    document.getElementById("eventName").textContent = event ? event.title : "Event not found";
    grid.innerHTML = `<div class="empty-note">No seats available for this event.</div>`;
    updateSummary();
    return;
  }

  renderSeatMap();
  updateSummary();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
