/* =========================================================
   EventOps · Profile + Become Organizer
   Wired to the backend (no demo data):
     GET  /api/users/me                    (current user)
     PUT  /api/users/me                    (update name)
     GET  /api/organizer-applications/me   (my applications)
     POST /api/organizer-applications      (apply)
   ========================================================= */

/* ---------- status maps (backend → UI) ---------- */
const ROLE_LABEL = { user: "Participant", organizer: "Organizer", admin: "Admin" };
const ROLE_BADGE = { user: "badge-draft", organizer: "badge-upcoming", admin: "badge-upcoming" };

const ACCOUNT_STATUS = {
  pending: { label: "Pending", badge: "badge-pending" },
  approved: { label: "Approved", badge: "badge-upcoming" },
  rejected: { label: "Rejected", badge: "badge-cancelled" },
};

const APP_STATUS = {
  pending: { label: "Pending", badge: "badge-pending" },
  approved: { label: "Approved", badge: "badge-upcoming" },
  rejected: { label: "Rejected", badge: "badge-cancelled" },
};

/* ---------- helpers ---------- */
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function formatDate(value) {
  const d = new Date(value);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function showError(el, message) { el.textContent = message; el.hidden = false; }
function clearError(el) { el.textContent = ""; el.hidden = true; }

/* ---------- toasts ---------- */
function toast(title, text = "", type = "error") {
  const stack = document.getElementById("toastStack");
  const el = document.createElement("div");
  el.className = "toast-msg" + (type === "success" ? " toast-msg--success" : "");
  el.innerHTML = `
    <span class="toast-msg__icon"><i class="bi ${type === "success" ? "bi-check-lg" : "bi-exclamation-lg"}"></i></span>
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

/* ---------- renderers ---------- */
function setTopbarName(name) {
  const el = document.querySelector(".profile__name");
  if (el && name) el.textContent = name;
}

function fillAccount(user) {
  const avatarFor = window.avatarFor || ((u, sz = 160) => (u && u.avatarUrl) || ((window.avatarInitials || ((nm, s = 160) => `https://ui-avatars.com/api/?name=${encodeURIComponent(nm || "User")}&background=random&size=${s}&color=fff&rounded=true`))((u && (u.name || u.email)) || "User", sz)));
  document.getElementById("accountAvatar").src = avatarFor(user, 160);
  document.getElementById("accountName").textContent = user.name || "—";
  document.getElementById("accountEmail").textContent = user.email || "—";
  document.getElementById("nameInput").value = user.name || "";
  savedName = user.name || "";
  updateSaveState();

  const roleEl = document.getElementById("roleBadge");
  roleEl.textContent = ROLE_LABEL[user.role] || user.role || "—";
  roleEl.className = "badge-soft " + (ROLE_BADGE[user.role] || "badge-draft");

  const st = ACCOUNT_STATUS[user.status] || { label: user.status || "—", badge: "badge-draft" };
  const statusEl = document.getElementById("statusBadge");
  statusEl.textContent = st.label;
  statusEl.className = "badge-soft " + st.badge;
}

function isApprovedOrganizer(user) {
  return user.role === "organizer" && user.status === "approved";
}

function renderApplyState(user) {
  const applyCard = document.getElementById("applyCard");
  const already = document.getElementById("alreadyOrganizer");
  const formWrap = document.getElementById("applyFormWrap");

  // Admins already manage the platform, so the "Become an organizer" card
  // (and its "you're already an organizer" note) is irrelevant to them.
  if (user.role === "admin") {
    applyCard.hidden = true;
    return;
  }

  applyCard.hidden = false;
  const approved = isApprovedOrganizer(user);
  already.hidden = !approved;
  formWrap.hidden = approved;
}

function applicationItem(app, prominent) {
  const st = APP_STATUS[app.status] || { label: app.status || "—", badge: "badge-draft" };
  const notes = app.reviewNotes
    ? `<p class="app-item__notes"><i class="bi bi-chat-left-text"></i>Review notes: ${escapeHtml(app.reviewNotes)}</p>`
    : "";
  return `
    <article class="app-item${prominent ? " app-item--latest" : ""}">
      <div class="app-item__head">
        <div>
          <div class="app-item__org">${escapeHtml(app.organizationName)}</div>
          <div class="app-item__date"><i class="bi bi-calendar3"></i>Submitted ${formatDate(app.createdAt)}</div>
        </div>
        <span class="badge-soft ${st.badge}">${st.label}</span>
      </div>
      ${notes}
    </article>`;
}

function renderApplications(list) {
  const el = document.getElementById("applicationsList");

  if (!list.length) {
    el.innerHTML = `<div class="empty-note">You haven't submitted an organizer application yet.</div>`;
    return;
  }

  const sorted = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const [latest, ...rest] = sorted;

  let html = applicationItem(latest, true);
  if (rest.length) {
    html += `
      <div class="app-history">
        <div class="app-history__title">History</div>
        ${rest.map((a) => applicationItem(a, false)).join("")}
      </div>`;
  }
  el.innerHTML = html;
}

/* ---------- data ---------- */
async function loadApplications() {
  try {
    const list = await API.myOrganizerApplications();
    renderApplications(Array.isArray(list) ? list : []);
  } catch (err) {
    if (err.status === 401) { API.logout(); return; }
    renderApplications([]);
  }
}

/* ===================== ACTIONS ===================== */
async function onSaveName(e) {
  e.preventDefault();
  const input = document.getElementById("nameInput");
  const errEl = document.getElementById("nameError");
  const name = input.value.trim();

  if (name.length < 3 || name.length > 30) {
    showError(errEl, "Name must be between 3 and 30 characters.");
    return;
  }
  clearError(errEl);

  const btn = document.getElementById("saveNameBtn");
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving...';

  try {
    const payload = { name };
    const savingAvatar = !!pendingAvatarUrl;
    if (pendingAvatarUrl) payload.avatarUrl = pendingAvatarUrl;

    const user = await API.updateProfile(payload);
    pendingAvatarUrl = null;
    const plus = document.querySelector(".avatar-upload__btn");
    if (plus) {
      plus.innerHTML = '<i class="bi bi-plus-lg"></i>';
      plus.setAttribute("aria-label", "Change profile photo");
    }
    toast("Profile updated", savingAvatar ? "Your photo and name have been saved." : "Your display name has been saved.", "success");
    setTopbarName(name);
    if (user) fillAccount(user);
  } catch (err) {
    if (err.status === 401) {
      toast("Session expired", "Please login again.");
      setTimeout(() => API.logout(), 1200);
      return;
    }
    if (err.status === undefined) {
      showError(errEl, "Unable to connect. Check your connection and try again.");
      return;
    }
    showError(errEl, err.message || "Could not update your name.");
  } finally {
    btn.innerHTML = original;
    updateSaveState();
  }
}

async function onApply(e) {
  e.preventDefault();
  const input = document.getElementById("orgNameInput");
  const errEl = document.getElementById("orgError");
  const organizationName = input.value.trim();

  if (organizationName.length < 2 || organizationName.length > 100) {
    showError(errEl, "Organization name must be between 2 and 100 characters.");
    return;
  }
  clearError(errEl);

  const btn = document.getElementById("applyBtn");
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Submitting...';

  try {
    const body = await API.applyOrganizer({ organizationName });
    toast("Application submitted", (body && body.message) || "We'll review your request shortly.", "success");
    input.value = "";
    await loadApplications();
  } catch (err) {
    if (err.status === 401) {
      toast("Session expired", "Please login again.");
      setTimeout(() => API.logout(), 1200);
      return;
    }
    if (err.status === undefined) {
      showError(errEl, "Unable to connect. Check your connection and try again.");
      return;
    }
    showError(errEl, err.message || "Application failed. Please try again.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

/* ===================== AVATAR UPLOAD ===================== */
/* Adds a "+" badge on the profile picture. Clicking it opens the device
   file picker. The chosen image is resized to 256px and shown as a
   PREVIEW only — it is NOT saved until the user presses "Save changes",
   which then saves the photo and the display name together. */
let pendingAvatarUrl = null;
let savedName = "";

/* Save button state: pale gray (disabled) until the name or the photo
   actually changes, then it turns blue and clickable. */
function updateSaveState() {
  const input = document.getElementById("nameInput");
  const btn = document.getElementById("saveNameBtn");
  if (!input || !btn) return;
  const dirty = (input.value.trim() !== savedName) || !!pendingAvatarUrl;
  btn.disabled = !dirty;
}

function setupAvatarUpload() {
  const img = document.getElementById("accountAvatar");
  if (!img) return;

  const holder = img.closest(".profile-card__top") || img.parentElement;
  if (!holder) return;

  const wrap = document.createElement("div");
  wrap.className = "avatar-upload";
  holder.insertBefore(wrap, img);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.hidden = true;

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "avatar-upload__btn";
  plus.setAttribute("aria-label", "Change profile photo");
  plus.innerHTML = '<i class="bi bi-plus-lg"></i>';

  wrap.appendChild(img);
  wrap.appendChild(fileInput);
  wrap.appendChild(plus);

  plus.addEventListener("click", (e) => {
    e.preventDefault();
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file", "");
      return;
    }

    plus.disabled = true;
    plus.innerHTML = '<i class="bi bi-arrow-repeat"></i>';

    try {
      const dataUrl = await resizeImage(file, 256);
      pendingAvatarUrl = dataUrl;

      // Preview only (profile card + top bar) — nothing is saved yet
      img.src = dataUrl;
      document.querySelectorAll(".topbar .profile__avatar").forEach((el) => {
        if (el.tagName === "IMG") el.src = dataUrl;
        else {
          const inner = el.querySelector("img");
          if (inner) inner.src = dataUrl;
        }
      });
      plus.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i>';
      plus.setAttribute("aria-label", "Choose another photo");
      updateSaveState();
    } catch (err) {
      toast("Couldn't read the photo", err.message || "Please try again.");
    } finally {
      plus.disabled = false;
    }
  });
}

/* Draws the picked file onto a square canvas (center-crop) and returns a
   JPEG data URL — keeps the payload small enough for the API + database. */
function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not read the image"));
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          const side = Math.min(image.width, image.height);
          const sx = (image.width - side) / 2;
          const sy = (image.height - side) / 2;
          ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch (e) {
          reject(e);
        }
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ===================== INIT ===================== */
async function init() {
  if (!API.isLoggedIn()) {
    window.location.href = "login.html";
    return;
  }

  let user;
  try {
    user = await API.me();
  } catch (err) {
    if (err.status === 401) { API.logout(); return; }
    toast("Unable to load your profile", "Check your connection and try again.");
    return;
  }

  fillAccount(user);
  setTopbarName(user.name);
  renderApplyState(user);
  setupAvatarUpload();

  await loadApplications();

  document.getElementById("nameForm").addEventListener("submit", onSaveName);
  document.getElementById("nameInput").addEventListener("input", updateSaveState);
  document.getElementById("applyForm").addEventListener("submit", onApply);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
