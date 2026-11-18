/* =========================================================
   EventOps · Shared app shell (sidebar + topbar)

   Renders ONE consistent sidebar on every page, and turns the
   topbar into working controls:
     · the bell  → a notifications panel built from real endpoints
     · the user  → a menu with Profile / Support / Sign out

   Usage: load after api.js and before the page script.
     <script src="assets/js/api.js"></script>
     <script src="assets/js/layout.js"></script>
     <script src="assets/js/<page>.js"></script>
   ========================================================= */

window.Layout = (function () {
  /* Single source of truth for the sidebar. Order is fixed for every
     role; `organizer`/`admin` items only appear for those roles. */
  const NAV = [
    { page: "dashboard",   href: "dashboard.html",          icon: "bi-house",           label: "Dashboard" },
    { page: "events",      href: "index.html",              icon: "bi-calendar3",       label: "Browse events" },
    { page: "bookings",    href: "my-bookings.html",        icon: "bi-ticket-perforated", label: "My bookings" },
    { page: "support",     href: "support.html",            icon: "bi-life-preserver",  label: "Support" },
    { page: "profile",     href: "profile.html",            icon: "bi-person",          label: "Profile" },
    { page: "organizer",   href: "organizer-dashboard.html", icon: "bi-briefcase",      label: "Organizer dashboard", organizer: true },
    { page: "create-event", href: "create-event.html",      icon: "bi-plus-square",     label: "Create event",        organizer: true },
    { page: "participants", href: "participants.html",      icon: "bi-people",          label: "Participants",        organizer: true },
    { page: "check-in",    href: "check-in.html",           icon: "bi-qr-code-scan",    label: "Check-in",            organizer: true },
    { page: "invites",     href: "invites.html",            icon: "bi-envelope-paper",  label: "Invites",             organizer: true },
    { page: "reports",     href: "reports.html",            icon: "bi-graph-up",        label: "Reports",             organizer: true },
    { page: "admin",       href: "admin-dashboard.html",    icon: "bi-speedometer2",    label: "Admin overview",      admin: true },
    { page: "admin-apps",  href: "admin-applications.html", icon: "bi-clipboard-check", label: "Organizer applications", admin: true },
    { page: "admin-users", href: "admin-users.html",        icon: "bi-people-fill",     label: "Users & events",      admin: true },
  ];

  /* Top navigation shown under the topbar on every page. Mirrors the home
     page: Browse events first, then Dashboard, My bookings, and role pages. */
  const TOPNAV = [
    { href: "index.html", label: "Browse events" },
    { href: "dashboard.html", label: "Dashboard" },
    { href: "my-bookings.html", label: "My bookings" },
    { href: "organizer-dashboard.html", label: "My events", organizer: true },
    { href: "create-event.html", label: "Create event", organizer: true },
    { href: "participants.html", label: "Participants", organizer: true },
    { href: "check-in.html", label: "Check-in", organizer: true },
    { href: "invites.html", label: "Invites", organizer: true },
    { href: "reports.html", label: "Reports", organizer: true },
    { href: "admin-dashboard.html", label: "Admin overview", admin: true },
    { href: "admin-applications.html", label: "Organizer applications", admin: true },
    { href: "admin-users.html", label: "Users & events", admin: true },
  ];

  /* Which sidebar item is "active" for a given file. */
  const PAGE_BY_FILE = {
    "dashboard.html": "dashboard",
    "index.html": "events",
    "event-details.html": "events",
    "seat-selection.html": "events",
    "my-bookings.html": "bookings",
    "ticket.html": "bookings",
    "checkout.html": "bookings",
    "payment-result.html": "bookings",
    "support.html": "support",
    "profile.html": "profile",
    "organizer-dashboard.html": "organizer",
    "create-event.html": "create-event",
    "participants.html": "participants",
    "check-in.html": "check-in",
    "invites.html": "invites",
    "reports.html": "reports",
    "admin-dashboard.html": "admin",
    "admin-applications.html": "admin-apps",
    "admin-users.html": "admin-users",
  };

  /* ---------- small helpers ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const initials = (name) =>
    String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

  function formatDate(value) {
    const d = new Date(value);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function relTime(value) {
    const d = new Date(value);
    if (isNaN(d)) return "";
    const diff = Date.now() - d.getTime();
    const min = Math.round(diff / 60000);
    if (min < 1) return "now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.round(hr / 24);
    if (day < 7) return `${day}d ago`;
    return formatDate(value);
  }

  function currentFile() {
    return (window.location.pathname.split("/").pop() || "dashboard.html").toLowerCase();
  }

  function canSee(item, user) {
    const role = user && user.role;
    if (item.admin) return role === "admin";
    if (item.organizer) return role === "organizer" && user.status === "approved";
    return true;
  }

  /* ---------- sidebar ---------- */
  function renderSidebar(user) {
    // Navigation lives in the fixed top nav bar on every page, so the side
    // bar is not used at all.
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.remove();
  }

  function isOrganizerUser(user, file) {
    const organizerFiles = [
      "organizer-dashboard.html",
      "create-event.html",
      "participants.html",
      "check-in.html",
      "invites.html",
      "reports.html"
    ];
    if (organizerFiles.includes(file)) return true;
    if (!user) return false;
    return user.role === "organizer" && (user.status === "approved" || !user.status);
  }

  function renderOrganizerNav(file) {
    const isEventsActive = ["organizer-dashboard.html", "create-event.html"].includes(file);
    const isAttendeesActive = ["participants.html", "check-in.html", "invites.html"].includes(file);

    return `
      <a href="index.html" class="pagenav__link ${file === "index.html" ? "is-active" : ""}">
        <i class="bi bi-compass"></i><span>Browse Events</span>
      </a>
      <a href="dashboard.html" class="pagenav__link ${file === "dashboard.html" ? "is-active" : ""}">
        <i class="bi bi-speedometer2"></i><span>Dashboard</span>
      </a>
      <div class="dropdown nav-dropdown" id="navEventsDropdown">
        <button type="button" class="nav-dropdown__btn ${isEventsActive ? "is-active" : ""}" aria-haspopup="true" aria-expanded="false">
          <i class="bi bi-calendar-event"></i>
          <span>Events</span>
          <i class="bi bi-chevron-down nav-dropdown__caret"></i>
        </button>
        <div class="dropdown__menu nav-dropdown__menu" hidden>
          <a class="dropdown__item ${file === "organizer-dashboard.html" ? "is-active" : ""}" href="organizer-dashboard.html">
            <i class="bi bi-calendar-check"></i><span>My Events</span>
          </a>
          <a class="dropdown__item ${file === "create-event.html" ? "is-active" : ""}" href="create-event.html">
            <i class="bi bi-plus-circle"></i><span>Create Event</span>
          </a>
        </div>
      </div>
      <div class="dropdown nav-dropdown" id="navAttendeesDropdown">
        <button type="button" class="nav-dropdown__btn ${isAttendeesActive ? "is-active" : ""}" aria-haspopup="true" aria-expanded="false">
          <i class="bi bi-people"></i>
          <span>Attendees</span>
          <i class="bi bi-chevron-down nav-dropdown__caret"></i>
        </button>
        <div class="dropdown__menu nav-dropdown__menu" hidden>
          <a class="dropdown__item ${file === "participants.html" ? "is-active" : ""}" href="participants.html">
            <i class="bi bi-person-lines-fill"></i><span>Participants</span>
          </a>
          <a class="dropdown__item ${file === "check-in.html" ? "is-active" : ""}" href="check-in.html">
            <i class="bi bi-qr-code-scan"></i><span>Check-in</span>
          </a>
          <a class="dropdown__item ${file === "invites.html" ? "is-active" : ""}" href="invites.html">
            <i class="bi bi-envelope-paper"></i><span>Invites</span>
          </a>
        </div>
      </div>
      <a href="reports.html" class="pagenav__link ${file === "reports.html" ? "is-active" : ""}">
        <i class="bi bi-graph-up-arrow"></i><span>Reports</span>
      </a>
    `;
  }

  function renderAdminNav(file) {
    return `
      <a href="index.html" class="pagenav__link ${file === "index.html" ? "is-active" : ""}">
        <i class="bi bi-compass"></i><span>Browse Events</span>
      </a>
      <a href="dashboard.html" class="pagenav__link ${file === "dashboard.html" ? "is-active" : ""}">
        <i class="bi bi-speedometer2"></i><span>Dashboard</span>
      </a>
      <a href="admin-dashboard.html" class="pagenav__link ${file === "admin-dashboard.html" ? "is-active" : ""}">
        <i class="bi bi-shield-check"></i><span>Admin Overview</span>
      </a>
      <a href="admin-applications.html" class="pagenav__link ${file === "admin-applications.html" ? "is-active" : ""}">
        <i class="bi bi-clipboard-check"></i><span>Organizer Applications</span>
      </a>
      <a href="admin-users.html" class="pagenav__link ${file === "admin-users.html" ? "is-active" : ""}">
        <i class="bi bi-people-fill"></i><span>Users & Events</span>
      </a>
    `;
  }

  function renderAttendeeNav(file) {
    const isBookingsActive = ["my-bookings.html", "ticket.html", "checkout.html", "payment-result.html"].includes(file);
    return `
      <a href="index.html" class="pagenav__link ${file === "index.html" ? "is-active" : ""}">
        <i class="bi bi-compass"></i><span>Browse Events</span>
      </a>
      <a href="dashboard.html" class="pagenav__link ${file === "dashboard.html" ? "is-active" : ""}">
        <i class="bi bi-speedometer2"></i><span>Dashboard</span>
      </a>
      <a href="my-bookings.html" class="pagenav__link ${isBookingsActive ? "is-active" : ""}">
        <i class="bi bi-ticket-perforated"></i><span>My Bookings</span>
      </a>
      <a href="support.html" class="pagenav__link ${file === "support.html" ? "is-active" : ""}">
        <i class="bi bi-life-preserver"></i><span>Support</span>
      </a>
    `;
  }

  function renderGuestNav(file) {
    return `
      <a href="index.html" class="pagenav__link ${file === "index.html" ? "is-active" : ""}">
        <i class="bi bi-compass"></i><span>Browse Events</span>
      </a>
    `;
  }

  function bindNavDropdowns(container) {
    if (!container) return;
    container.querySelectorAll(".nav-dropdown").forEach((wrap) => {
      const btn = wrap.querySelector(".nav-dropdown__btn");
      const menu = wrap.querySelector(".dropdown__menu");
      if (!btn || !menu) return;

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const willOpen = menu.hidden;
        closeMenus();
        if (willOpen) {
          setOpen(wrap, true);
          if (window.innerWidth <= 768) {
            const rect = btn.getBoundingClientRect();
            menu.style.position = "fixed";
            menu.style.top = (rect.bottom + 6) + "px";
            const menuWidth = Math.min(200, window.innerWidth - 20);
            let left = rect.left + (rect.width / 2) - (menuWidth / 2);
            if (left < 10) left = 10;
            if (left + menuWidth > window.innerWidth - 10) left = window.innerWidth - menuWidth - 10;
            menu.style.left = left + "px";
          } else {
            menu.style.position = "";
            menu.style.top = "";
            menu.style.left = "";
          }
        } else {
          setOpen(wrap, false);
        }
      });
    });
  }

  /* ---------- top navigation ---------- */
  function renderTopNav(user) {
    const inner = document.querySelector(".topbar .topbar__inner");
    if (!inner) return;

    let bar = document.getElementById("pageNav");
    if (!bar) {
      bar = document.createElement("nav");
      bar.id = "pageNav";
      bar.className = "pagenav";
      bar.setAttribute("aria-label", "Site pages");
      // Same row as the logo, in the free space before the bell / profile.
      inner.insertBefore(bar, inner.querySelector(".topbar__actions"));
    }

    const file = currentFile();

    if (isOrganizerUser(user, file)) {
      bar.innerHTML = renderOrganizerNav(file);
    } else if (user && user.role === "admin") {
      bar.innerHTML = renderAdminNav(file);
    } else if (user) {
      bar.innerHTML = renderAttendeeNav(file);
    } else {
      bar.innerHTML = renderGuestNav(file);
    }

    bindNavDropdowns(bar);
  }

  /* ---------- topbar ---------- */
  function renderTopbar(user) {
    const brand = document.querySelector(".topbar .brand");
    // The logo always returns to the site home (Browse events).
    if (brand) brand.setAttribute("href", "index.html");

    const nameEl = document.querySelector(".topbar .profile__name");
    if (nameEl) nameEl.textContent = (user && user.name) || "Guest";

    const avatarImg = document.querySelector(".topbar .profile__avatar img") || document.querySelector(".topbar .profile__avatar");
    const avatarFor = window.avatarFor || ((u, sz = 80) => (u && u.avatarUrl) || ((window.avatarInitials || ((nm, s = 80) => `https://ui-avatars.com/api/?name=${encodeURIComponent(nm || "User")}&background=random&size=${s}&color=fff&rounded=true`))((u && (u.name || u.email)) || "User", sz)));
    if (avatarImg && user) avatarImg.src = avatarFor(user, 80);
  }

  /* ---------- dropdown menu plumbing ---------- */
  function setOpen(wrap, open) {
    if (!wrap) return;
    wrap.classList.toggle("is-open", open);
    const menu = wrap.querySelector(".dropdown__menu");
    if (menu) {
      menu.hidden = !open;
      if (!open) {
        menu.style.position = "";
        menu.style.top = "";
        menu.style.left = "";
      }
    }
    const btn = wrap.querySelector("button");
    if (btn) btn.setAttribute("aria-expanded", String(open));
  }

  function closeMenus() {
    document.querySelectorAll(".dropdown.is-open").forEach((w) => setOpen(w, false));
  }

  function toggleMenu(wrap) {
    document.querySelectorAll(".dropdown").forEach((m) => { if (m !== wrap) setOpen(m, false); });
    setOpen(wrap, !wrap.classList.contains("is-open"));
  }

  /* ---------- menus (bell + user) ---------- */
  function ensureMenus(user) {
    const actions = document.querySelector(".topbar__actions");
    if (!actions) return;

    if (actions.dataset.menus !== "1") {
      actions.dataset.menus = "1";

      const bell = actions.querySelector(".icon-btn");
      const profile = actions.querySelector(".profile");

      /* notifications */
      const notifWrap = document.createElement("div");
      notifWrap.className = "dropdown";
      notifWrap.id = "notifWrap";
      if (bell) {
        actions.insertBefore(notifWrap, bell);
        notifWrap.appendChild(bell);
        bell.setAttribute("aria-haspopup", "true");
        bell.setAttribute("aria-expanded", "false");
        const dot = bell.querySelector(".icon-btn__dot");
        if (dot) { dot.id = "notifDot"; dot.hidden = true; }
        const notifMenu = document.createElement("div");
        notifMenu.className = "dropdown__menu dropdown__menu--wide";
        notifMenu.hidden = true;
        notifMenu.innerHTML = `
          <div class="dropdown__head"><strong>Notifications</strong></div>
          <div class="dropdown__list" id="notifList"><div class="dropdown__empty">Loading…</div></div>`;
        notifWrap.appendChild(notifMenu);
        bell.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(notifWrap); });
      }

      /* user menu */
      if (profile) {
        const profWrap = document.createElement("div");
        profWrap.className = "dropdown";
        profWrap.id = "profWrap";
        actions.appendChild(profWrap);
        profWrap.appendChild(profile);
        profile.setAttribute("aria-haspopup", "true");
        profile.setAttribute("aria-expanded", "false");
        const profMenu = document.createElement("div");
        profMenu.className = "dropdown__menu dropdown__menu--profile";
        profMenu.hidden = true;
        profMenu.innerHTML = `<div class="dropdown__head dropdown__head--user" id="menuUser"></div><div id="menuLinks"></div>`;
        profWrap.appendChild(profMenu);
        profile.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(profWrap); });
      }

      if (!document.body.dataset.menuClickBound) {
        document.body.dataset.menuClickBound = "1";
        document.addEventListener("click", closeMenus);
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });
      }
    }

    updateMenuUser(user);
  }

  function updateMenuUser(user) {
    const head = document.getElementById("menuUser");
    const links = document.getElementById("menuLinks");
    if (!head || !links) return;

    if (user) {
      const avatarFor = window.avatarFor || ((u, sz = 80) => (u && u.avatarUrl) || ((window.avatarInitials || ((nm, s = 80) => `https://ui-avatars.com/api/?name=${encodeURIComponent(nm || "User")}&background=random&size=${s}&color=fff&rounded=true`))((u && (u.name || u.email)) || "User", sz)));
      head.innerHTML = `
        <span class="dropdown__avatar"><img src="${avatarFor(user, 48)}" alt="${esc(user.name || "User")}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" /></span>
        <span>
          <span class="dropdown__name">${esc(user.name || "User")}</span>
          <span class="dropdown__email">${esc(user.email || "")}</span>
        </span>`;
      links.innerHTML = `
        <a class="dropdown__item" href="profile.html"><i class="bi bi-person"></i><span>My Profile</span></a>
        <a class="dropdown__item" href="my-bookings.html"><i class="bi bi-ticket-perforated"></i><span>My Bookings</span></a>
        <a class="dropdown__item" href="profile.html"><i class="bi bi-gear"></i><span>Settings</span></a>
        <a class="dropdown__item" href="support.html"><i class="bi bi-life-preserver"></i><span>Support</span></a>
        <div class="dropdown__sep"></div>
        <button class="dropdown__item dropdown__item--danger" type="button" id="signOutBtn"><i class="bi bi-box-arrow-right"></i><span>Sign Out</span></button>`;
      const out = document.getElementById("signOutBtn");
      if (out) out.addEventListener("click", () => API.logout("login.html"));
    } else {
      head.innerHTML = `
        <span class="dropdown__avatar"><i class="bi bi-person"></i></span>
        <span><span class="dropdown__name">Guest</span><span class="dropdown__email">Not signed in</span></span>`;
      links.innerHTML = `
        <a class="dropdown__item" href="login.html"><i class="bi bi-box-arrow-in-right"></i><span>Sign In</span></a>
        <a class="dropdown__item" href="signup.html"><i class="bi bi-person-plus"></i><span>Create Account</span></a>`;
    }
  }

  /* ---------- notifications ---------- */
  function notifRow(item) {
    return `
      <a class="notif" href="${item.href}">
        <span class="notif__icon ${item.tint}"><i class="bi ${item.icon}"></i></span>
        <span class="notif__body">
          <span class="notif__title">${esc(item.title)}</span>
          <span class="notif__text">${esc(item.text)}</span>
        </span>
        <span class="notif__time">${esc(item.time ? relTime(item.time) : "")}</span>
      </a>`;
  }

  async function buildNotifications(user) {
    const items = [];

    if (!user) return items;

    const role = user.role;
    const approvedOrganizer = role === "organizer" && user.status === "approved";

    if (role === "admin") {
      const body = await API.adminOrganizerApplications("?status=pending&limit=5");
      const apps = (body && body.data) || [];
      const total = (body && body.pagination && body.pagination.total) || apps.length;
      if (total > 0) {
        items.push({ icon: "bi-clipboard-check", tint: "tint-amber", title: `${total} pending application${total > 1 ? "s" : ""}`, text: "Organizer requests awaiting review", href: "admin-applications.html" });
      }
      apps.slice(0, 3).forEach((a) => items.push({
        icon: "bi-person-plus", tint: "tint-purple",
        title: `${(a.user && a.user.name) || "Applicant"} applied`,
        text: a.organizationName || "Organizer application",
        href: "admin-applications.html", time: a.createdAt,
      }));
    } else if (approvedOrganizer) {
      const events = await API.listEvents("?organizer=me", { auth: true });
      const upcoming = events
        .filter((e) => e.status === "scheduled")
        .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
        .slice(0, 4);
      upcoming.forEach((e) => items.push({
        icon: "bi-calendar-event", tint: "tint-purple",
        title: e.title, text: `Starts ${formatDate(e.startsAt)}`,
        href: `participants.html?event=${e._id}`, time: e.startsAt,
      }));
      if (!items.length) items.push({ icon: "bi-calendar-plus", tint: "tint-purple", title: "Create your next event", text: "Publish an event to start selling tickets", href: "create-event.html" });
    } else {
      const bookings = await API.myBookings();
      const recent = [...bookings]
        .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
        .slice(0, 5);
      recent.forEach((b) => {
        const map = {
          confirmed: { t: "Booking confirmed", icon: "bi-check-circle", tint: "tint-green", href: `ticket.html?id=${b._id}` },
          pending_payment: { t: "Payment pending", icon: "bi-hourglass-split", tint: "tint-amber", href: `checkout.html?booking=${b._id}` },
          cancelled: { t: "Booking cancelled", icon: "bi-x-circle", tint: "tint-red", href: "my-bookings.html" },
          expired: { t: "Booking expired", icon: "bi-clock-history", tint: "tint-red", href: "my-bookings.html" },
        }[b.status] || { t: "Booking updated", icon: "bi-ticket-perforated", tint: "tint-purple", href: "my-bookings.html" };
        items.push({
          icon: map.icon, tint: map.tint, title: map.t,
          text: (b.event && b.event.title) || "Event", href: map.href,
          time: b.updatedAt || b.createdAt,
        });
      });
      // Private event invitations
      let invited = [];
      try {
        invited = await API.invitedEvents();
        (invited || []).forEach((e) => {
          items.push({
            icon: "bi-envelope-open", tint: "tint-amber", title: `Invited: ${e.title}`,
            text: "Private event invitation", href: `event-details.html?id=${e._id}`, time: e.createdAt,
          });
        });
      } catch { /* ignore */ }
      if (!items.length) items.push({ icon: "bi-compass", tint: "tint-purple", title: "Find your next event", text: "Browse events and book a seat", href: "index.html" });
    }

    return items;
  }

  async function loadNotifications(user) {
    const list = document.getElementById("notifList");
    const dot = document.getElementById("notifDot");
    if (!list) return;

    if (!user) {
      list.innerHTML = `<div class="dropdown__empty">Sign in to see notifications.</div>`;
      if (dot) dot.hidden = true;
      return;
    }

    list.innerHTML = `<div class="dropdown__empty">Loading…</div>`;
    try {
      const items = await buildNotifications(user);
      if (!items.length) {
        list.innerHTML = `<div class="dropdown__empty">You're all caught up.</div>`;
        if (dot) dot.hidden = true;
        return;
      }
      list.innerHTML = items.map(notifRow).join("");
      if (dot) dot.hidden = false;
    } catch (err) {
      list.innerHTML = `<div class="dropdown__empty">Couldn't load notifications.</div>`;
      if (dot) dot.hidden = true;
    }
  }

  /* ---------- mobile sidebar ---------- */
  function bindMobileClose() {
    if (document.body.dataset.layoutBound === "1") return;
    document.body.dataset.layoutBound = "1";
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".sidebar__link")) return;
      const sidebar = document.querySelector(".sidebar");
      if (sidebar) sidebar.classList.remove("is-open");
    });
  }

  /* Move the topbar search under the nav bar so it sits above the content
     panel at the same width as the panel. */
  function relocateSearch() {
    const search = document.querySelector(".topbar .topbar__search");
    const content = document.querySelector(".content");
    if (!search || !content || content.contains(search)) return;
    search.classList.add("topbar__search--panel");
    content.prepend(search);
  }

  function apply(user) {
    renderSidebar(user);
    renderTopbar(user);
    renderTopNav(user);
    relocateSearch();
    ensureMenus(user);
  }

  function init() {
    if (!window.API) return;

    bindMobileClose();

    const cached = API.getUser();
    apply(cached);
    loadNotifications(cached);

    if (!API.isLoggedIn()) return;

    API.me()
      .then((user) => { apply(user); loadNotifications(user); })
      .catch(() => { /* page script handles auth errors */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return { init, renderSidebar, renderTopbar, renderTopNav, NAV };
})();
