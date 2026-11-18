/* =========================================================
   EventOps · Landing / Events Listing
   GET /api/events  (public listing)
   ========================================================= */

const PAGE_SIZE = 8;

/* ---------- element refs ---------- */
const grid = document.getElementById("eventsGrid");
const paginationEl = document.getElementById("pagination");
const resultsCount = document.getElementById("resultsCount");

/* ---------- filter state ---------- */
const initialQuery = new URLSearchParams(window.location.search);
const filters = {
  search: initialQuery.get("search") || "",
  category: "",
  date: "",
  price: "",
  sort: "",
  selectedDate: null, // "YYYY-MM-DD" e.g. "2026-11-18"
};
let allEvents = [];   // results from API
let visibleEvents = []; // after client-side category filter
let currentPage = 1;

const CATEGORY_KEYWORDS = {
  tech: ["tech", "ai", "software", "summit", "cloud", "data", "developer"],
  business: ["business", "startup", "market", "innovation", "finance", "forum"],
  music: ["music", "concert", "festival", "band", "live"],
  design: ["design", "ux", "ui", "product", "workshop", "creative"],
  food: ["food", "drink", "dinner", "tasting", "culinary", "chef"],
};

/* ---------- helpers ---------- */
const money = (v) => "EGP " + Number(v || 0).toLocaleString("en-US");
const num = (v) => Number(v || 0).toLocaleString("en-US");

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function formatDate(value) {
  const d = new Date(value);
  if (!value || isNaN(d)) return "Date TBA";
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

/* ---------- date-range → query params ---------- */
function dateRangeParams(range) {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  if (range === "today") {
    return { startsAfter: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), startsBefore: endOfToday.toISOString() };
  }
  if (range === "week") {
    return { startsAfter: now.toISOString(), startsBefore: new Date(now.getTime() + 7 * 864e5).toISOString() };
  }
  if (range === "month") {
    return { startsAfter: now.toISOString(), startsBefore: new Date(now.getTime() + 30 * 864e5).toISOString() };
  }
  return {};
}

function buildQuery() {
  const q = new URLSearchParams();

  if (filters.search) q.set("search", filters.search);
  if (filters.sort) q.set("sort", filters.sort);

  if (filters.price === "free") q.set("maxPrice", "0");
  if (filters.price === "paid") q.set("minPrice", "1");

  const range = dateRangeParams(filters.date);
  Object.entries(range).forEach(([k, v]) => q.set(k, v));

  return q.toString();
}

/* ---------- API ---------- */
async function fetchEvents() {
  try {
    const qs = buildQuery();
    return await API.listEvents(qs ? `?${qs}` : "", { auth: API.isLoggedIn() });
  } catch {
    return [];
  }
}

/* ===================== RENDER ===================== */
function skeletons() {
  grid.innerHTML = Array.from({ length: 8 })
    .map(
      () => `
      <div class="skeleton-card">
        <div class="skeleton skeleton-card__media"></div>
        <div class="skeleton-card__body">
          <div class="skeleton skeleton-line w-40"></div>
          <div class="skeleton skeleton-line w-90"></div>
          <div class="skeleton skeleton-line w-60"></div>
        </div>
      </div>`
    )
    .join("");
  paginationEl.innerHTML = "";
}

function categoryMatches(ev, category) {
  if (!category) return true;
  const text = `${ev.title} ${ev.description}`.toLowerCase();
  return (CATEGORY_KEYWORDS[category] || []).some((kw) => text.includes(kw));
}

function eventCard(ev) {
  const isFree = Number(ev.price) === 0;
  const vis = ev.visibility === "private" ? "private" : "public";
  const visIcon = vis === "private" ? "bi-lock" : "bi-globe2";
  const statusMap = {
    scheduled: { cls: "badge-scheduled", icon: "bi-calendar-check", label: "Scheduled" },
    cancelled: { cls: "badge-cancelled", icon: "bi-x-octagon", label: "Cancelled" },
    completed: { cls: "badge-completed", icon: "bi-check2-circle", label: "Completed" },
  };
  const st = (ev.status === "scheduled" && ev.endsAt && new Date(ev.endsAt) <= new Date())
    ? { cls: "badge-completed", icon: "bi-clock-history", label: "Ended" }
    : (statusMap[ev.status] || statusMap.scheduled);

  return `
    <article class="ev-card">
      <a class="ev-card__link" href="event-details.html?id=${encodeURIComponent(ev._id)}">
        <div class="ev-card__media">
          <div class="ev-card__badges">
            <span class="badge-soft badge-${vis} ev-card__badge"><i class="bi ${visIcon}"></i> ${vis[0].toUpperCase() + vis.slice(1)}</span>
            <span class="badge-soft ${st.cls} ev-card__badge"><i class="bi ${st.icon}"></i> ${st.label}</span>
            <span class="ev-card__price-badge ${isFree ? "is-free" : ""}">${isFree ? "Free" : money(ev.price)}</span>
          </div>
          <img src="https://picsum.photos/seed/${encodeURIComponent(ev._id || ev.title)}/600/360" alt="${escapeHtml(ev.title)}" loading="lazy" />
        </div>
        <div class="ev-card__body">
          <div class="ev-card__date"><i class="bi bi-calendar3"></i> ${formatDate(ev.startsAt)}</div>
          <h3 class="ev-card__title">${escapeHtml(ev.title)}</h3>
          <div class="ev-card__venue"><i class="bi bi-geo-alt"></i> ${escapeHtml(ev.venue || "Venue TBA")}</div>
          <div class="ev-card__seats" data-seats-for="${escapeHtml(ev._id)}">
            <i class="bi bi-people"></i>
            <span>Checking seats…</span>
          </div>
          <div class="ev-card__foot">
            <span class="ev-card__price ${isFree ? "is-free" : ""}">${isFree ? "Free" : money(ev.price)}</span>
            <span class="ev-card__cta">View details <i class="bi bi-arrow-right"></i></span>
          </div>
        </div>
      </a>
    </article>`;
}

function renderPage() {
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageEvents = visibleEvents.slice(start, start + PAGE_SIZE);

  if (!visibleEvents.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon"><i class="bi bi-calendar-x"></i></div>
        <h3>No events found</h3>
        <p>Try changing your filters or search keywords.</p>
      </div>`;
    paginationEl.innerHTML = "";
    return;
  }

  grid.innerHTML = pageEvents.map(eventCard).join("");
  renderPagination();
  refreshSeats(pageEvents);
}

function renderPagination() {
  const totalPages = Math.ceil(visibleEvents.length / PAGE_SIZE);
  if (totalPages <= 1) { paginationEl.innerHTML = ""; return; }

  let html = `
    <button class="page-btn" data-page="prev" ${currentPage === 1 ? "disabled" : ""}>
      <i class="bi bi-chevron-left"></i>
    </button>`;

  for (let p = 1; p <= totalPages; p++) {
    html += `<button class="page-btn ${p === currentPage ? "is-active" : ""}" data-page="${p}">${p}</button>`;
  }

  html += `
    <button class="page-btn" data-page="next" ${currentPage === totalPages ? "disabled" : ""}>
      <i class="bi bi-chevron-right"></i>
    </button>`;

  paginationEl.innerHTML = html;
}

/* ---------- live "seats left" ---------- */
async function refreshSeats(events) {
  await Promise.allSettled(
    events.map(async (ev) => {
      try {
        const seats = await API.getSeats(ev._id);
        if (!seats.length) return;
        const available = seats.filter((s) => s.status === "available").length;
        const holder = document.querySelector(`[data-seats-for="${CSS.escape(ev._id)}"] span`);
        if (holder) {
          const label = available <= 0 ? "Sold out" : `${num(available)} seats left`;
          holder.textContent = label;
        }
      } catch { /* ignore */ }
    })
  );
}

/* ===================== AUTH NAV ===================== */

/* Pages shown in the home page top navigation. Role-specific entries are
   filtered the same way the app sidebar does it.
   Profile / Support live in the profile dropdown. */

function renderOrganizerHomeNav(nav) {
  nav.innerHTML = `
    <a href="index.html" class="is-active"><i class="bi bi-compass"></i><span>Browse Events</span></a>
    <a href="dashboard.html"><i class="bi bi-speedometer2"></i><span>Dashboard</span></a>
    <div class="dropdown nav-dropdown" id="homeEventsDropdown">
      <button type="button" class="nav-dropdown__btn" aria-haspopup="true" aria-expanded="false">
        <i class="bi bi-calendar-event"></i><span>Events</span>
        <i class="bi bi-chevron-down nav-dropdown__caret"></i>
      </button>
      <div class="dropdown__menu nav-dropdown__menu" hidden>
        <a class="dropdown__item" href="organizer-dashboard.html"><i class="bi bi-calendar-check"></i><span>My Events</span></a>
        <a class="dropdown__item" href="create-event.html"><i class="bi bi-plus-circle"></i><span>Create Event</span></a>
      </div>
    </div>
    <div class="dropdown nav-dropdown" id="homeAttendeesDropdown">
      <button type="button" class="nav-dropdown__btn" aria-haspopup="true" aria-expanded="false">
        <i class="bi bi-people"></i><span>Attendees</span>
        <i class="bi bi-chevron-down nav-dropdown__caret"></i>
      </button>
      <div class="dropdown__menu nav-dropdown__menu" hidden>
        <a class="dropdown__item" href="participants.html"><i class="bi bi-person-lines-fill"></i><span>Participants</span></a>
        <a class="dropdown__item" href="check-in.html"><i class="bi bi-qr-code-scan"></i><span>Check-in</span></a>
        <a class="dropdown__item" href="invites.html"><i class="bi bi-envelope-paper"></i><span>Invites</span></a>
      </div>
    </div>
    <a href="reports.html"><i class="bi bi-graph-up-arrow"></i><span>Reports</span></a>
  `;

  // Bind nav dropdowns
  nav.querySelectorAll(".nav-dropdown").forEach((wrap) => {
    const btn = wrap.querySelector(".nav-dropdown__btn");
    const menu = wrap.querySelector(".dropdown__menu");
    if (!btn || !menu) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = !menu.hidden;
      // Close all other nav dropdowns
      nav.querySelectorAll(".nav-dropdown .dropdown__menu").forEach((m) => { m.hidden = true; });
      nav.querySelectorAll(".nav-dropdown").forEach((w) => w.classList.remove("is-open"));
      nav.querySelectorAll(".nav-dropdown__btn").forEach((b) => b.setAttribute("aria-expanded", "false"));
      if (!isOpen) {
        menu.hidden = false;
        wrap.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  document.addEventListener("click", () => {
    nav.querySelectorAll(".nav-dropdown .dropdown__menu").forEach((m) => { m.hidden = true; });
    nav.querySelectorAll(".nav-dropdown").forEach((w) => w.classList.remove("is-open"));
    nav.querySelectorAll(".nav-dropdown__btn").forEach((b) => b.setAttribute("aria-expanded", "false"));
  }, { capture: false });
}

function renderAdminHomeNav(nav) {
  nav.innerHTML = `
    <a href="index.html" class="is-active"><i class="bi bi-compass"></i><span>Browse Events</span></a>
    <a href="dashboard.html"><i class="bi bi-speedometer2"></i><span>Dashboard</span></a>
    <a href="admin-dashboard.html"><i class="bi bi-shield-check"></i><span>Admin Overview</span></a>
    <a href="admin-applications.html"><i class="bi bi-clipboard-check"></i><span>Applications</span></a>
    <a href="admin-users.html"><i class="bi bi-people-fill"></i><span>Users &amp; Events</span></a>
  `;
}

function renderDefaultHomeNav(nav) {
  nav.innerHTML = `
    <a href="index.html" class="is-active"><i class="bi bi-compass"></i><span>Browse Events</span></a>
    <a href="dashboard.html"><i class="bi bi-speedometer2"></i><span>Dashboard</span></a>
    <a href="my-bookings.html"><i class="bi bi-ticket-perforated"></i><span>My Bookings</span></a>
    <a href="support.html"><i class="bi bi-life-preserver"></i><span>Support</span></a>
  `;
}

function renderHomeNav(user) {
  const nav = document.getElementById("homeNav");
  if (!nav) return;

  if (!user) { nav.innerHTML = ""; return; }

  const isOrganizer = user.role === "organizer" && user.status === "approved";
  const isAdmin = user.role === "admin";

  if (isOrganizer) {
    renderOrganizerHomeNav(nav);
  } else if (isAdmin) {
    renderAdminHomeNav(nav);
  } else {
    renderDefaultHomeNav(nav);
  }
}

/* Profile + notifications menus on the home page. */
function bindHomeProfileMenu() {
  const btn = document.getElementById("homeProfBtn");
  const menu = document.getElementById("homeProfMenu");
  const bellBtn = document.getElementById("homeBellBtn");
  const bellMenu = document.getElementById("homeBellMenu");

  const closeAll = () => {
    [menu, bellMenu].forEach((m) => { if (m) m.hidden = true; });
    [btn, bellBtn].forEach((b) => { if (b) b.setAttribute("aria-expanded", "false"); });
  };

  const bind = (button, dropdown) => {
    if (!button || !dropdown) return;
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = dropdown.hidden;
      closeAll();
      dropdown.hidden = !willOpen;
      button.setAttribute("aria-expanded", String(willOpen));
    });
  };

  bind(btn, menu);
  bind(bellBtn, bellMenu);

  if (btn && !document.body.dataset.homeMenusBound) {
    document.body.dataset.homeMenusBound = "1";
    document.addEventListener("click", closeAll);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });
  }

  const out = document.getElementById("homeSignOutBtn");
  if (out) out.addEventListener("click", () => API.logout("login.html"));
}

/* Compact notifications panel for the home top bar. */
async function loadHomeNotifications(user) {
  const list = document.getElementById("homeBellList");
  const dot = document.getElementById("homeBellDot");
  if (!list) return;

  const items = [];
  let alert = false;

  try {
    if (user.role === "admin") {
      const body = await API.adminOrganizerApplications("?status=pending&limit=5");
      const apps = (body && body.data) || [];
      const total = (body && body.pagination && body.pagination.total) || apps.length;
      if (total > 0) {
        alert = true;
        items.push({ icon: "bi-clipboard-check", tint: "tint-amber", title: `${total} pending application${total > 1 ? "s" : ""}`, text: "Organizer requests awaiting review", href: "admin-applications.html" });
      }
      apps.slice(0, 3).forEach((a) => items.push({
        icon: "bi-person-plus", tint: "tint-purple",
        title: `${(a.user && a.user.name) || "Applicant"} applied`,
        text: a.organizationName || "Organizer application",
        href: "admin-applications.html",
      }));
    } else if (user.role === "organizer" && user.status === "approved") {
      const events = (await API.listEvents("?organizer=me", { auth: true })) || [];
      const upcoming = events.filter((e) => e.status === "scheduled" && (!e.endsAt || new Date(e.endsAt) > new Date())).slice(0, 3);
      upcoming.forEach((e) => items.push({
        icon: "bi-calendar-event", tint: "tint-purple",
        title: e.title, text: "Upcoming event", href: `event-details.html?id=${e._id}`,
      }));
      if (upcoming.length) alert = true;
      if (!upcoming.length) items.push({ icon: "bi-calendar-plus", tint: "tint-purple", title: "Create your next event", text: "Publish an event to start selling tickets", href: "create-event.html" });
    } else {
      const bookings = (await API.myBookings()) || [];
      const recent = bookings.slice(0, 3);
      recent.forEach((b) => items.push({
        icon: "bi-ticket-perforated", tint: "tint-purple",
        title: (b.event && b.event.title) || "Booking", text: "Your booking", href: "my-bookings.html",
      }));
      // Private event invitations
      let invited = [];
      try {
        invited = await API.invitedEvents();
        (invited || []).forEach((e) => {
          alert = true;
          items.push({ icon: "bi-envelope-open", tint: "tint-amber", title: `Invited: ${e.title}`, text: "Private event invitation", href: `event-details.html?id=${e._id}` });
        });
      } catch { /* ignore */ }
      if (!recent.length && !invited.length) items.push({ icon: "bi-compass", tint: "tint-purple", title: "Find your next event", text: "Browse events and book a seat", href: "index.html" });
    }
  } catch {
    list.innerHTML = `<div class="dropdown__empty">Couldn't load notifications.</div>`;
    if (dot) dot.hidden = true;
    return;
  }

  list.innerHTML = items
    .map((it) => `
      <a class="notif" href="${it.href}">
        <span class="notif__icon ${it.tint}"><i class="bi ${it.icon}"></i></span>
        <span class="notif__body">
          <span class="notif__title">${escapeHtml(it.title)}</span>
          <span class="notif__text">${escapeHtml(it.text)}</span>
        </span>
      </a>`)
    .join("");

  if (dot) dot.hidden = !alert;
}

function renderAuthButtons() {
  const wrap = document.getElementById("authButtons");
  let user = null;
  try { user = JSON.parse(localStorage.getItem("user") || "null"); } catch { user = null; }

  if (user) {
    const avatar = (name, size = 80) => user.avatarUrl || (window.avatarFor ? window.avatarFor(user, size) : (window.avatarInitials || ((n, s = 80) => `https://ui-avatars.com/api/?name=${encodeURIComponent(n || "User")}&background=random&size=${s}&color=fff&rounded=true`))(name, size));
    wrap.innerHTML = `
      <div class="dropdown" id="homeBellWrap">
        <button class="icon-btn" type="button" id="homeBellBtn" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">
          <i class="bi bi-bell"></i>
          <span class="icon-btn__dot" id="homeBellDot" hidden></span>
        </button>
        <div class="dropdown__menu dropdown__menu--wide" id="homeBellMenu" hidden>
          <div class="dropdown__head"><strong>Notifications</strong></div>
          <div class="dropdown__list" id="homeBellList"><div class="dropdown__empty">Loading…</div></div>
        </div>
      </div>
      <div class="dropdown" id="homeProfWrap">
        <button class="profile" type="button" id="homeProfBtn" aria-haspopup="true" aria-expanded="false">
          <span class="profile__avatar">
            <img src="${avatar(user.name || user.email || "User", 80)}" alt="${escapeHtml(user.name || "User")}" />
          </span>
          <span class="profile__name">${escapeHtml(user.name || "Account")}</span>
          <i class="bi bi-chevron-down profile__caret"></i>
        </button>
        <div class="dropdown__menu dropdown__menu--profile" id="homeProfMenu" hidden>
          <div class="dropdown__head dropdown__head--user">
            <span class="dropdown__avatar"><img src="${avatar(user.name || user.email || "User", 48)}" alt="${escapeHtml(user.name || "User")}" /></span>
            <span>
              <span class="dropdown__name">${escapeHtml(user.name || "User")}</span>
              <span class="dropdown__email">${escapeHtml(user.email || "")}</span>
            </span>
          </div>
          <a class="dropdown__item" href="profile.html"><i class="bi bi-person"></i> My Profile</a>
          <a class="dropdown__item" href="my-bookings.html"><i class="bi bi-ticket-perforated"></i> My Bookings</a>
          <a class="dropdown__item" href="profile.html"><i class="bi bi-gear"></i> Settings</a>
          <a class="dropdown__item" href="support.html"><i class="bi bi-life-preserver"></i> Support</a>
          <div class="dropdown__sep"></div>
          <button class="dropdown__item dropdown__item--danger" type="button" id="homeSignOutBtn"><i class="bi bi-box-arrow-right"></i> Sign out</button>
        </div>
      </div>`;
    bindHomeProfileMenu();
    loadHomeNotifications(user);
    renderHomeNav(user);
  } else {
    wrap.innerHTML = `
      <a class="btn-ghost" href="login.html">Login</a>
      <a class="btn-brand" href="signup.html" style="text-decoration:none">Sign up</a>`;
    renderHomeNav(null);
  }
}

async function refreshSession() {
  if (!API.isLoggedIn()) return;

  try {
    await API.me();
  } catch (err) {
    if (err.status === 401) API.clearSession();
  }
}

/* ===================== DATE SELECTOR RIBBON ===================== */
const MONTH_NAMES_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAY_NAMES_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const nowForRibbon = new Date();
const dateRibbonState = {
  year: nowForRibbon.getFullYear(),
  month: nowForRibbon.getMonth(), // 0 = Jan, 10 = Nov
  selectedDateStr: null,
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toLocalDateKey(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function renderDateRibbon() {
  const track = document.getElementById("dateTrack");
  const monthLabel = document.getElementById("ribbonMonthLabel");
  const allBtn = document.getElementById("allDatesBtn");
  if (!track || !monthLabel) return;

  monthLabel.textContent = MONTH_NAMES_SHORT[dateRibbonState.month];

  if (allBtn) {
    allBtn.classList.toggle("is-active", !dateRibbonState.selectedDateStr);
  }

  const daysInMonth = new Date(dateRibbonState.year, dateRibbonState.month + 1, 0).getDate();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

  // Collect dates that have upcoming events
  const eventDatesSet = new Set(allEvents.map((e) => toLocalDateKey(e.startsAt)).filter(Boolean));

  let html = "";
  for (let day = 1; day <= daysInMonth; day++) {
    const dayDate = new Date(dateRibbonState.year, dateRibbonState.month, day);
    const dayOfWeek = DAY_NAMES_SHORT[dayDate.getDay()];
    const dateKey = `${dateRibbonState.year}-${pad2(dateRibbonState.month + 1)}-${pad2(day)}`;
    const isSelected = dateKey === dateRibbonState.selectedDateStr;
    const isToday = dateKey === todayKey;
    const isPast = dateKey < todayKey;
    const hasEvents = eventDatesSet.has(dateKey);

    const stateClass = isPast ? "is-past" : (isToday ? "is-today" : "is-future");

    html += `
      <button type="button"
        class="date-pill ${isSelected ? "is-selected" : ""} ${stateClass} ${hasEvents ? "has-events" : ""}"
        data-date="${dateKey}"
        role="tab"
        aria-selected="${isSelected ? "true" : "false"}"
        title="${dayDate.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" })}${isToday ? " (Today)" : (isPast ? " (Past)" : "")}">
        <span class="date-pill__num">${day}</span>
        <span class="date-pill__name">${dayOfWeek}</span>
        ${hasEvents ? '<span class="date-pill__dot"></span>' : ""}
      </button>`;
  }

  track.innerHTML = html;

  // Auto-scroll to selected date or today
  setTimeout(() => {
    const targetPill = track.querySelector(".date-pill.is-selected") || track.querySelector(".date-pill.is-today");
    if (targetPill) {
      const leftPos = targetPill.offsetLeft - track.offsetLeft - (track.clientWidth / 2) + (targetPill.clientWidth / 2);
      track.scrollTo({ left: Math.max(0, leftPos), behavior: "smooth" });
    }
  }, 120);
}

function renderMonthMenu() {
  const menu = document.getElementById("monthMenu");
  if (!menu) return;

  const currentRealMonth = new Date().getMonth();
  const currentRealYear = new Date().getFullYear();

  menu.innerHTML = MONTH_NAMES_SHORT.map((name, idx) => {
    const isCurrent = idx === currentRealMonth && dateRibbonState.year === currentRealYear;
    const isActive = idx === dateRibbonState.month;
    return `<button type="button" class="month-item ${isCurrent ? "is-current" : ""} ${isActive ? "is-active" : ""}" data-month="${idx}">${name}</button>`;
  }).join("");
}

function initDateRibbon() {
  const track = document.getElementById("dateTrack");
  const monthTriggerBtn = document.getElementById("monthTriggerBtn");
  const monthMenu = document.getElementById("monthMenu");
  const allBtn = document.getElementById("allDatesBtn");
  const scrollLeftBtn = document.getElementById("ribbonScrollLeft");
  const scrollRightBtn = document.getElementById("ribbonScrollRight");

  if (!track) return;

  renderMonthMenu();
  renderDateRibbon();

  // Toggle month menu
  monthTriggerBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = monthMenu.hidden;
    monthMenu.hidden = !isHidden;
    monthTriggerBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
  });

  // Select month from menu
  monthMenu?.addEventListener("click", (e) => {
    const item = e.target.closest(".month-item");
    if (!item) return;
    const monthIdx = Number(item.dataset.month);
    if (!isNaN(monthIdx)) {
      dateRibbonState.month = monthIdx;
      renderMonthMenu();
      renderDateRibbon();
      monthMenu.hidden = true;
      monthTriggerBtn.setAttribute("aria-expanded", "false");
    }
  });

  // Close month menu on click outside
  document.addEventListener("click", (e) => {
    if (monthMenu && !monthMenu.hidden && !e.target.closest("#ribbonMonthWrap")) {
      monthMenu.hidden = true;
      monthTriggerBtn?.setAttribute("aria-expanded", "false");
    }
  });

  // Click date pill
  track.addEventListener("click", (e) => {
    const pill = e.target.closest(".date-pill");
    if (!pill) return;

    const clickedDate = pill.dataset.date;
    if (dateRibbonState.selectedDateStr === clickedDate) {
      dateRibbonState.selectedDateStr = null;
      filters.selectedDate = null;
    } else {
      dateRibbonState.selectedDateStr = clickedDate;
      filters.selectedDate = clickedDate;
    }

    renderDateRibbon();
    applyClientFilters();
    currentPage = 1;

    if (dateRibbonState.selectedDateStr) {
      const d = new Date(dateRibbonState.selectedDateStr + "T00:00:00");
      const fmt = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      resultsCount.textContent = `(${visibleEvents.length}) · ${fmt}`;
    } else {
      resultsCount.textContent = visibleEvents.length ? `(${visibleEvents.length})` : "";
    }

    renderPage();

    const eventsSec = document.getElementById("events");
    if (eventsSec) {
      eventsSec.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // ALL button
  allBtn?.addEventListener("click", () => {
    dateRibbonState.selectedDateStr = null;
    filters.selectedDate = null;
    renderDateRibbon();
    applyClientFilters();
    currentPage = 1;
    resultsCount.textContent = visibleEvents.length ? `(${visibleEvents.length})` : "";
    renderPage();
  });

  // Scroll arrows
  scrollLeftBtn?.addEventListener("click", () => {
    track.scrollBy({ left: -240, behavior: "smooth" });
  });
  scrollRightBtn?.addEventListener("click", () => {
    track.scrollBy({ left: 240, behavior: "smooth" });
  });
}

/* ===================== EVENTS ===================== */
function applyClientFilters() {
  visibleEvents = allEvents.filter((ev) => {
    if (!categoryMatches(ev, filters.category)) return false;
    if (filters.selectedDate) {
      const evDateKey = toLocalDateKey(ev.startsAt);
      if (evDateKey !== filters.selectedDate) return false;
    }
    return true;
  });
}

async function load() {
  skeletons();
  const fetched = await fetchEvents();
  allEvents = (fetched || []).filter((ev) => !ev.endsAt || new Date(ev.endsAt) > new Date());
  renderDateRibbon();
  applyClientFilters();
  currentPage = 1;
  resultsCount.textContent = visibleEvents.length ? `(${visibleEvents.length})` : "";
  renderPage();
}

/* ===================== WIRING ===================== */
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

async function init() {
  await refreshSession();
  renderAuthButtons();
  initDateRibbon();
  document.getElementById("searchInput").value = filters.search;

  // search (hero + debounce)
  document.getElementById("heroSearchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    filters.search = document.getElementById("searchInput").value.trim();
    load();
  });

  document.getElementById("searchInput").addEventListener(
    "input",
    debounce((e) => { filters.search = e.target.value.trim(); load(); }, 450)
  );

  // filters
  document.getElementById("categoryFilter").addEventListener("change", (e) => {
    filters.category = e.target.value;
    applyClientFilters();
    currentPage = 1;
    resultsCount.textContent = visibleEvents.length ? `(${visibleEvents.length})` : "";
    renderPage();
  });

  document.getElementById("dateFilter").addEventListener("change", (e) => {
    filters.date = e.target.value;
    load();
  });

  document.getElementById("priceFilter").addEventListener("change", (e) => {
    filters.price = e.target.value;
    load();
  });

  document.getElementById("sortFilter").addEventListener("change", (e) => {
    filters.sort = e.target.value;
    load();
  });

  // pagination
  paginationEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".page-btn");
    if (!btn || btn.disabled) return;
    const totalPages = Math.ceil(visibleEvents.length / PAGE_SIZE);
    const target = btn.dataset.page;

    if (target === "prev") currentPage = Math.max(1, currentPage - 1);
    else if (target === "next") currentPage = Math.min(totalPages, currentPage + 1);
    else currentPage = Number(target);

    renderPage();
    document.getElementById("events").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  load();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* Fallback: render the auth UI immediately in case init() above hasn't run yet
   (e.g. DOMContentAlready fired before this script executed). */
(function () {
  try {
    let user = null;
    try { user = JSON.parse(localStorage.getItem("user") || "null"); } catch { user = null; }
    renderAuthButtons();
  } catch { /* ignore */ }
})();
