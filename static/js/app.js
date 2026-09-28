/**
 * BorrowBox Core Application Engine
 * Handles State, Views, Safe Exchange Verification, "Need It Once?" Nudge,
 * Skill Swaps, Return Confirmations, Admin Moderation & Demo Flow.
 */

// Global State
const state = {
  currentUser: null,
  currentSchool: null,
  users: [],
  currentView: "home",
  items: [],
  categories: [
    "All",
    "Study Equipment",
    "Books",
    "Electronics",
    "Project Tools",
    "Art Supplies",
    "Sports",
    "School Supplies",
    "Costumes"
  ],
  selectedCategory: "All",
  selectedCondition: "All",
  searchQuery: "",
  activeActivityTab: "borrowing", // borrowing, lending, requests, history
  transactions: [],
  requests: [],
  skills: [],
  skillRequests: [],
  reports: [],
  approvedLocations: [],
  impact: null,
  personalImpact: null,
  notifications: [],
  unreadNotifsCount: 0
};

// UI Helper: Toast Notifications
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  const icon = type === "success" ? "✓" : type === "warning" ? "⚠" : "ℹ";
  toast.innerHTML = `
    <div style="font-size: 1.25rem; line-height: 1; color: ${type === 'success' ? '#10B981' : type === 'warning' ? '#F59E0B' : '#2563EB'}">
      ${icon}
    </div>
    <div style="flex: 1;">
      <div style="font-weight: 600; font-size: 0.9rem; color: #0F172A;">${message}</div>
    </div>
    <button onclick="this.parentElement.remove()" style="background:none; border:none; color:#94A3B8; cursor:pointer; font-size:1.1rem; line-height:1;">&times;</button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(50px)";
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

// Router & View Switcher
function switchView(viewName) {
  state.currentView = viewName;

  // Update navigation highlights
  document.querySelectorAll("[data-nav-view]").forEach(el => {
    if (el.getAttribute("data-nav-view") === viewName) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });

  // Hide all view containers
  document.querySelectorAll(".view-section").forEach(sec => {
    sec.style.display = "none";
  });

  // Show active view
  const target = document.getElementById(`view-${viewName}`);
  if (target) {
    target.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // View specific refresh
  if (viewName === "discover") {
    loadItems();
  } else if (viewName === "activity") {
    loadActivityData();
  } else if (viewName === "skills") {
    loadSkillsData();
  } else if (viewName === "impact") {
    loadImpactData();
  } else if (viewName === "admin") {
    loadAdminData();
  } else if (viewName === "home") {
    loadHomeData();
  } else if (viewName === "profile") {
    loadProfileData();
  }
}

// Format Currency
function formatINR(val) {
  if (val >= 100000) {
    return `₹${(val / 100000).toFixed(1)}L`;
  }
  return `₹${Number(val).toLocaleString('en-IN')}`;
}

// --- INIT APP ---
async function initApp() {
  try {
    // 1. Fetch current user and school
    const meRes = await window.api.getMe();
    state.currentUser = meRes.user;
    state.currentSchool = meRes.school;

    // 2. Fetch all users for persona switcher
    state.users = await window.api.getUsers();

    // 3. Update Header UI
    updateHeaderUserUI();

    // 4. Load initial notifications & impact
    await loadNotifications();
    await loadImpactData();

    // 5. Setup View
    switchView("home");

    // 6. Listen to location hash if any
    const hash = window.location.hash.replace("#", "");
    if (hash && document.getElementById(`view-${hash}`)) {
      switchView(hash);
    }
  } catch (err) {
    console.error("Initialization error:", err);
    showToast("Loaded in local demo mode", "info");
  }
}

// Header UI Sync
function updateHeaderUserUI() {
  const u = state.currentUser;
  if (!u) return;

  const avatarEl = document.getElementById("header-user-avatar");
  const nameEl = document.getElementById("header-user-name");
  const roleBadgeEl = document.getElementById("header-user-role");
  const greetingEl = document.getElementById("home-greeting-name");

  if (avatarEl) avatarEl.src = u.avatarUrl;
  if (nameEl) nameEl.textContent = u.displayName;
  if (greetingEl) greetingEl.textContent = u.displayName.split(" ")[0];

  if (roleBadgeEl) {
    if (u.role === "school_admin") {
      roleBadgeEl.className = "badge badge-purple";
      roleBadgeEl.textContent = "Admin";
    } else {
      roleBadgeEl.className = "badge badge-emerald";
      roleBadgeEl.textContent = `Grade ${u.grade.replace('Grade ', '')}`;
    }
  }

  // Render Persona Switcher Options
  const personaSelect = document.getElementById("persona-switcher");
  if (personaSelect) {
    personaSelect.innerHTML = state.users.map(usr => `
      <option value="${usr.id}" ${usr.id === u.id ? 'selected' : ''}>
        ${usr.displayName} (${usr.role === 'school_admin' ? 'Principal / Admin' : usr.grade})
      </option>
    `).join("");
  }

  // Show/Hide Admin Nav link based on role
  const adminNavLinks = document.querySelectorAll(".admin-nav-item");
  adminNavLinks.forEach(link => {
    link.style.display = (u.role === "school_admin") ? "flex" : "none";
  });
}

// Switch Persona
async function switchPersona(userId) {
  try {
    const res = await window.api.switchUser(userId);
    state.currentUser = res.user;
    updateHeaderUserUI();
    showToast(`Switched persona to ${res.user.displayName}`, "success");
    
    // Refresh current view
    if (state.currentView === "home") loadHomeData();
    else if (state.currentView === "activity") loadActivityData();
    else if (state.currentView === "impact") loadImpactData();
    else if (state.currentView === "admin") loadAdminData();
    else if (state.currentView === "profile") loadProfileData();
    loadNotifications();
  } catch (err) {
    showToast("Failed to switch persona", "warning");
  }
}

// --- HOME VIEW ---
async function loadHomeData() {
  await loadImpactData();
  const items = await window.api.getItems();
  state.items = items;

  // Render "Popular in Your School"
  const popularContainer = document.getElementById("popular-items-scroll");
  if (popularContainer) {
    popularContainer.innerHTML = items.slice(0, 6).map(item => `
      <div class="app-card app-card-interactive flex-shrink-0" style="width: 250px;" onclick="openItemModal('${item.id}')">
        <div style="height: 140px; overflow: hidden; position: relative; border-radius: 15px 15px 0 0;">
          <img src="${item.images[0]}" alt="${item.title}" style="width: 100%; height: 100%; object-fit: cover;">
          <span class="badge ${item.status === 'Available' ? 'badge-emerald' : item.status === 'OnLoan' ? 'badge-amber' : 'badge-purple'}" 
                style="position: absolute; top: 10px; right: 10px;">
            ${item.status === 'OnLoan' ? 'On Loan' : item.status}
          </span>
        </div>
        <div style="padding: 1rem;">
          <div style="font-size: 0.75rem; color: var(--primary); font-weight: 700; text-transform: uppercase;">
            ${item.category}
          </div>
          <h4 style="font-size: 0.95rem; font-weight: 700; margin: 0.25rem 0 0.5rem 0; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${item.title}
          </h4>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted);">
            <span>📍 ${item.exchangeLocation.replace('School ', '').replace('Main ', '')}</span>
            <span style="font-weight: 700; color: #0F172A;">${item.deposit > 0 ? `₹${item.deposit}` : 'Free'}</span>
          </div>
        </div>
      </div>
    `).join("");
  }

  // Render Recent Skill Preview
  const skills = await window.api.getSkills();
  const skillPreview = document.getElementById("home-skill-preview");
  if (skillPreview && skills.length > 0) {
    const s = skills[0];
    skillPreview.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <img src="${s.userAvatar}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent);">
        <div style="flex: 1;">
          <div style="font-weight: 700; font-size: 0.95rem; color: #0F172A;">${s.skillTitle}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Offered by ${s.userName} • In exchange for: <span style="color: var(--accent); font-weight: 600;">${s.desiredExchange}</span></div>
        </div>
        <button class="btn-secondary" style="font-size: 0.8rem; padding: 0.4rem 0.8rem;" onclick="switchView('skills')">
          Explore Skills →
        </button>
      </div>
    `;
  }
}

// --- DISCOVER MARKETPLACE ---
async function loadItems() {
  const container = document.getElementById("items-grid");
  if (!container) return;

  container.innerHTML = `
    <div style="grid-column: 1/-1; text-align: center; padding: 3rem 0;">
      <div style="display: inline-block; width: 36px; height: 36px; border: 3px solid #E2E8F0; border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
      <p style="margin-top: 0.75rem; color: var(--text-muted); font-size: 0.9rem;">Loading verified school items...</p>
    </div>
  `;

  try {
    const items = await window.api.getItems({
      category: state.selectedCategory,
      condition: state.selectedCondition,
      q: state.searchQuery
    });
    state.items = items;

    renderCategoryChips();

    if (items.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem;" class="app-card">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">📦</div>
          <h3 style="font-size: 1.15rem; font-weight: 700; color: #0F172A;">No items found</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 380px; margin: 0.5rem auto 1.5rem auto;">
            No items match your active filters in Authpur National Model School. Try resetting filters or post a request!
          </p>
          <button class="btn-primary" onclick="resetFilters()">Reset All Filters</button>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="app-card app-card-interactive" onclick="openItemModal('${item.id}')" style="display: flex; flex-direction: column;">
        <div style="height: 180px; overflow: hidden; position: relative; border-radius: 15px 15px 0 0;">
          <img src="${item.images[0]}" alt="${item.title}" style="width: 100%; height: 100%; object-fit: cover;">
          <div style="position: absolute; top: 12px; left: 12px; display: flex; gap: 0.4rem;">
            <span class="badge badge-slate" style="background: rgba(15, 23, 42, 0.75); color: #FFF; backdrop-filter: blur(4px);">
              ${item.category}
            </span>
          </div>
          <div style="position: absolute; top: 12px; right: 12px;">
            <span class="badge ${item.status === 'Available' ? 'badge-emerald' : item.status === 'OnLoan' ? 'badge-amber' : 'badge-purple'}">
              ${item.status === 'OnLoan' ? 'On Loan' : item.status === 'Donated' ? 'Permanent Gift' : item.status}
            </span>
          </div>
        </div>
        <div style="padding: 1.25rem; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.35rem;">
              <span class="badge badge-blue" style="font-size: 0.7rem;">${item.condition}</span>
              <span style="font-size: 0.8rem; font-weight: 700; color: ${item.deposit > 0 ? '#2563EB' : '#10B981'};">
                ${item.deposit > 0 ? `₹${item.deposit} Deposit` : 'Zero Deposit'}
              </span>
            </div>
            <h3 style="font-size: 1.05rem; font-weight: 700; color: #0F172A; line-height: 1.35; margin-bottom: 0.5rem;">
              ${item.title}
            </h3>
            <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
              ${item.description}
            </p>
          </div>

          <div style="border-top: 1px solid #F1F5F9; margin-top: 1rem; padding-top: 0.75rem;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <img src="${item.ownerAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=50'}" 
                     style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover;">
                <span style="font-size: 0.8rem; font-weight: 600; color: #334155;">${item.ownerName}</span>
                <span title="Verified Student" style="color: var(--accent); font-size: 0.8rem;">✓</span>
              </div>
              <span style="font-size: 0.75rem; color: var(--text-muted); background: #F8FAFC; padding: 0.2rem 0.5rem; border-radius: 6px; border: 1px solid #E2E8F0;">
                📍 ${item.exchangeLocation.replace('School ', '').replace('Main ', '')}
              </span>
            </div>
          </div>
        </div>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<div style="grid-column: 1/-1; padding: 2rem; color: red;">Failed to load items.</div>`;
  }
}

// Render category chips
function renderCategoryChips() {
  const container = document.getElementById("category-chips-container");
  if (!container) return;

  container.innerHTML = state.categories.map(cat => `
    <button class="category-pill ${state.selectedCategory === cat ? 'active' : ''}" 
            onclick="setCategory('${cat}')">
      ${cat}
    </button>
  `).join("");
}

function setCategory(cat) {
  state.selectedCategory = cat;
  loadItems();
}

function resetFilters() {
  state.selectedCategory = "All";
  state.selectedCondition = "All";
  state.searchQuery = "";
  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.value = "";
  loadItems();
}

function handleSearch(query) {
  state.searchQuery = query;
  loadItems();
}

// --- ITEM DETAIL MODAL & BORROW REQUEST ---
let currentModalItem = null;

function openItemModal(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;
  currentModalItem = item;

  const modalEl = document.getElementById("item-detail-modal");
  const contentEl = document.getElementById("item-detail-content");
  if (!modalEl || !contentEl) return;

  const isOwner = state.currentUser && state.currentUser.id === item.ownerId;
  const isAvailable = item.status === "Available" || item.status === "Donated";

  contentEl.innerHTML = `
    <div style="position: relative;">
      <img src="${item.images[0]}" alt="${item.title}" style="width: 100%; height: 260px; object-fit: cover; border-radius: 16px 16px 0 0;">
      <button onclick="closeItemModal()" 
              style="position: absolute; top: 14px; right: 14px; background: rgba(0,0,0,0.6); color: white; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
        &times;
      </button>
      <div style="position: absolute; bottom: 14px; left: 14px; display: flex; gap: 0.5rem;">
        <span class="badge badge-emerald" style="backdrop-filter: blur(4px); font-size: 0.75rem;">
          ${item.condition}
        </span>
        <span class="badge badge-blue">
          ${item.category}
        </span>
      </div>
    </div>

    <div style="padding: 1.5rem;">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem;">
        <div>
          <h2 style="font-size: 1.35rem; font-weight: 800; color: #0F172A; line-height: 1.3;">${item.title}</h2>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">
            Listed in <span style="font-weight: 600; color: var(--primary);">Authpur National Model School</span> Network
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 1.25rem; font-weight: 800; color: #0F172A;">
            ${item.deposit > 0 ? `₹${item.deposit}` : 'Free'}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            ${item.deposit > 0 ? 'Refundable Deposit' : 'No Deposit Needed'}
          </div>
        </div>
      </div>

      <p style="font-size: 0.95rem; color: #334155; line-height: 1.6; margin-bottom: 1.25rem;">
        ${item.description}
      </p>

      <!-- Safety & Exchange Location Card -->
      <div style="background: #F8FAFC; border: 1px solid var(--border-color); border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem;">
        <div style="font-weight: 700; font-size: 0.85rem; color: #0F172A; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.4rem;">
          <span style="color: var(--accent);">🛡️</span> School Verified Safe Exchange Point
        </div>
        <div style="font-size: 0.85rem; color: #475569; display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-weight: 700; color: var(--primary);">📍 ${item.exchangeLocation}</span>
          <span style="color: #94A3B8;">•</span>
          <span>Max Duration: <strong>${item.maxBorrowDays} Days</strong></span>
        </div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 0.4rem;">
          Terms: "${item.terms}"
        </div>
      </div>

      <!-- Owner Info Card -->
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: #FFFFFF; border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 1.5rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <img src="${item.ownerAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=60'}" 
               style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover;">
          <div>
            <div style="font-weight: 700; font-size: 0.9rem; color: #0F172A; display: flex; align-items: center; gap: 0.3rem;">
              ${item.ownerName}
              <span style="color: var(--accent);" title="Verified Student">✓</span>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              Community Trust Score: <strong style="color: var(--primary);">${item.ownerTrust || 5} Safe Exchanges</strong>
            </div>
          </div>
        </div>
        <span class="badge badge-emerald">Verified Peer</span>
      </div>

      <!-- Actions -->
      <div style="display: flex; gap: 0.75rem;">
        ${isOwner ? `
          <div style="flex: 1; padding: 0.75rem; background: #F1F5F9; border-radius: 12px; text-align: center; font-size: 0.85rem; font-weight: 600; color: #64748B;">
            This is your listing
          </div>
          <button class="btn-secondary" onclick="deleteMyItem('${item.id}')" style="color: #DC2626; border-color: #FECACA;">
            Remove
          </button>
        ` : isAvailable ? `
          <button class="btn-secondary" style="flex: 1;" onclick="openReportModal('${item.id}', '${item.ownerId}')">
            🚩 Report
          </button>
          <button class="btn-primary" style="flex: 2;" onclick="openBorrowRequestModal('${item.id}')">
            ${item.status === 'Donated' ? 'Claim Donation' : 'Request to Borrow'}
          </button>
        ` : `
          <button class="btn-secondary" style="flex: 1;" disabled>
            Currently On Loan
          </button>
        `}
      </div>
    </div>
  `;

  modalEl.style.display = "flex";
}

function closeItemModal() {
  const modalEl = document.getElementById("item-detail-modal");
  if (modalEl) modalEl.style.display = "none";
}

// Borrow Request Modal
function openBorrowRequestModal(itemId) {
  closeItemModal();
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  const modalEl = document.getElementById("borrow-request-modal");
  const contentEl = document.getElementById("borrow-request-content");
  if (!modalEl || !contentEl) return;

  const today = new Date().toISOString().split("T")[0];

  contentEl.innerHTML = `
    <div style="padding: 1.5rem;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
        <div>
          <h3 style="font-size: 1.25rem; font-weight: 800; color: #0F172A;">Request to Borrow</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted);">${item.title}</p>
        </div>
        <button onclick="closeBorrowRequestModal()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #94A3B8;">&times;</button>
      </div>

      <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem; font-size: 0.85rem; color: #1E40AF;">
        <strong>Safe School Exchange:</strong> You and ${item.ownerName} will exchange at <strong>${item.exchangeLocation}</strong>. A 6-digit confirmation code will be issued once approved.
      </div>

      <form id="borrow-request-form" onsubmit="submitBorrowRequest(event, '${item.id}')">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 0.4rem;">
            When do you need it?
          </label>
          <input type="date" id="req-start-date" value="${today}" min="${today}" required
                 style="width: 100%; padding: 0.65rem; border: 1px solid var(--border-color); border-radius: 10px; font-family: inherit;">
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 0.4rem;">
            Duration (Max ${item.maxBorrowDays} Days)
          </label>
          <select id="req-duration-days" style="width: 100%; padding: 0.65rem; border: 1px solid var(--border-color); border-radius: 10px; font-family: inherit;">
            <option value="3">3 Days (Quick project)</option>
            <option value="5">5 Days (School week)</option>
            <option value="7" selected>7 Days (Standard 1 week)</option>
            ${item.maxBorrowDays >= 14 ? '<option value="14">14 Days (Two weeks)</option>' : ''}
          </select>
        </div>

        <div style="margin-bottom: 1.25rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 0.4rem;">
            Note for ${item.ownerName}
          </label>
          <textarea id="req-message" rows="3" required
                    placeholder="Hi! I need this for our physics test on Friday. I will meet you at the library desk."
                    style="width: 100%; padding: 0.65rem; border: 1px solid var(--border-color); border-radius: 10px; font-family: inherit; font-size: 0.9rem; resize: none;"></textarea>
        </div>

        <div style="display: flex; gap: 0.75rem;">
          <button type="button" class="btn-secondary" style="flex: 1;" onclick="closeBorrowRequestModal()">Cancel</button>
          <button type="submit" class="btn-primary" style="flex: 2;">Send Borrow Request</button>
        </div>
      </form>
    </div>
  `;

  modalEl.style.display = "flex";
}

function closeBorrowRequestModal() {
  const modalEl = document.getElementById("borrow-request-modal");
  if (modalEl) modalEl.style.display = "none";
}

async function submitBorrowRequest(e, itemId) {
  e.preventDefault();
  const startDate = document.getElementById("req-start-date").value;
  const durationDays = document.getElementById("req-duration-days").value;
  const message = document.getElementById("req-message").value;

  try {
    await window.api.createRequest({
      itemId,
      startDate,
      durationDays,
      message
    });
    closeBorrowRequestModal();
    showToast("Borrow request sent! The owner will review it.", "success");
    switchView("activity");
    setActivityTab("requests");
  } catch (err) {
    showToast(err.message || "Failed to submit request", "warning");
  }
}

// --- SIGNATURE FEATURE: "NEED IT ONCE?" NUDGE ---
function openNudgeModal() {
  const modalEl = document.getElementById("nudge-modal");
  if (modalEl) modalEl.style.display = "flex";
}

function closeNudgeModal() {
  const modalEl = document.getElementById("nudge-modal");
  if (modalEl) modalEl.style.display = "none";
}

function handleNudgeChoice(choice) {
  closeNudgeModal();
  if (choice === "temporary") {
    // Redirect to marketplace filtering available items for borrowing
    switchView("discover");
    state.selectedCategory = "All";
    state.selectedCondition = "All";
    showToast("Showing items available to borrow immediately in your school!", "info");
    loadItems();
  } else if (choice === "own") {
    // Show items marked for permanent donation
    switchView("discover");
    const container = document.getElementById("items-grid");
    state.items = state.items.filter(i => i.status === "Donated" || i.deposit === 0);
    showToast("Showing items available for permanent donation / free keep!", "success");
    loadItems();
  } else if (choice === "unsure") {
    // Recommend testing
    switchView("discover");
    showToast("Tip: Try borrowing for 3 days before spending your money!", "info");
  }
}

// --- POST ITEM LISTING FORM ---
async function handleCreateItem(e) {
  e.preventDefault();
  const title = document.getElementById("list-title").value.trim();
  const category = document.getElementById("list-category").value;
  const condition = document.getElementById("list-condition").value;
  const description = document.getElementById("list-description").value.trim();
  const maxBorrowDays = parseInt(document.getElementById("list-duration").value);
  const deposit = parseFloat(document.getElementById("list-deposit").value || 0);
  const exchangeLocation = document.getElementById("list-location").value;
  const itemType = document.getElementById("list-item-type").value; // 'loan' or 'donation'
  const imageUrl = document.getElementById("list-image-url").value.trim() || "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600";

  const status = itemType === "donation" ? "Donated" : "Available";

  try {
    await window.api.createItem({
      title,
      category,
      condition,
      description,
      maxBorrowDays,
      deposit,
      exchangeLocation,
      status,
      images: [imageUrl]
    });

    showToast("🎉 Item successfully listed in Authpur National Model School sharing network!", "success");
    e.target.reset();
    switchView("discover");
  } catch (err) {
    showToast(err.message || "Failed to list item", "warning");
  }
}

async function deleteMyItem(itemId) {
  if (!confirm("Are you sure you want to remove this item listing?")) return;
  try {
    await window.api.deleteItem(itemId);
    closeItemModal();
    showToast("Listing removed.", "info");
    loadItems();
  } catch (err) {
    showToast(err.message || "Failed to remove listing", "warning");
  }
}

// --- ACTIVITY / MY BORROWBOX (TABS: BORROWING, LENDING, REQUESTS, HISTORY) ---
function setActivityTab(tabName) {
  state.activeActivityTab = tabName;
  document.querySelectorAll(".activity-tab-btn").forEach(btn => {
    if (btn.getAttribute("data-tab") === tabName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  document.querySelectorAll(".activity-tab-content").forEach(panel => {
    panel.style.display = "none";
  });

  const activePanel = document.getElementById(`tab-content-${tabName}`);
  if (activePanel) activePanel.style.display = "block";

  renderActivityTabContent(tabName);
}

async function loadActivityData() {
  try {
    const [txs, reqs] = await Promise.all([
      window.api.getTransactions(),
      window.api.getRequests()
    ]);
    state.transactions = txs;
    state.requests = reqs;

    setActivityTab(state.activeActivityTab);
  } catch (err) {
    console.error("Error loading activity:", err);
  }
}

function renderActivityTabContent(tabName) {
  const u = state.currentUser;
  if (!u) return;

  if (tabName === "borrowing") {
    // Current user is borrower
    const container = document.getElementById("tab-content-borrowing");
    const activeLoans = state.transactions.filter(t => t.borrowerId === u.id && (t.status === "Active" || t.status === "PendingVerification" || t.status === "ReturnPendingConfirmation"));

    if (activeLoans.length === 0) {
      container.innerHTML = `
        <div class="app-card" style="text-align: center; padding: 3rem 1.5rem;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎒</div>
          <h3 style="font-weight: 700; color: #0F172A;">No Active Borrowings</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0.4rem 0 1.25rem 0;">You aren't currently borrowing any items from classmates.</p>
          <button class="btn-primary" onclick="switchView('discover')">Browse School Items</button>
        </div>
      `;
      return;
    }

    container.innerHTML = activeLoans.map(tx => `
      <div class="app-card" style="padding: 1.5rem; margin-bottom: 1rem;">
        <div style="display: flex; gap: 1rem; align-items: flex-start;">
          <img src="${tx.itemImages[0]}" style="width: 80px; height: 80px; border-radius: 12px; object-fit: cover;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span class="badge ${tx.status === 'Active' ? 'badge-emerald' : 'badge-amber'}">
                ${tx.status === 'Active' ? 'Active Loan' : tx.status === 'ReturnPendingConfirmation' ? 'Return Pending Confirmation' : 'Pickup Pending'}
              </span>
              <span style="font-size: 0.8rem; color: var(--text-muted);">Due: ${tx.dueDate}</span>
            </div>
            <h3 style="font-size: 1.1rem; font-weight: 700; color: #0F172A; margin: 0.25rem 0;">${tx.itemTitle}</h3>
            <p style="font-size: 0.85rem; color: var(--text-muted);">
              Lent by <strong>${tx.ownerName}</strong> • Exchange Desk: <strong>${tx.exchangeLocation}</strong>
            </p>

            <!-- Days countdown progress bar -->
            <div style="margin: 0.85rem 0 0.5rem 0;">
              <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 700; margin-bottom: 0.3rem;">
                <span style="color: var(--primary);">4 Days Remaining</span>
                <span style="color: var(--text-muted);">Return by Friday</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: 55%;"></div>
              </div>
            </div>

            <!-- Action buttons -->
            <div style="display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap;">
              ${tx.status === 'PendingVerification' ? `
                <button class="btn-primary" style="font-size: 0.85rem; padding: 0.5rem 1rem;" onclick="openVerifyCodeModal('${tx.id}', '${tx.exchangeCode}')">
                  🔑 Enter 6-Digit Code
                </button>
              ` : tx.status === 'ReturnPendingConfirmation' ? `
                <div style="font-size: 0.85rem; color: #D97706; font-weight: 600;">
                  ⏳ Waiting for ${tx.ownerName} to confirm drop-off receipt
                </div>
              ` : `
                <button class="btn-primary" style="font-size: 0.85rem; padding: 0.5rem 1rem;" onclick="handleMarkReturned('${tx.id}', '${tx.itemTitle}')">
                  📦 Mark as Returned (Drop-off)
                </button>
                <button class="btn-secondary" style="font-size: 0.85rem; padding: 0.5rem 1rem;" onclick="showToast('Extension requested to owner', 'info')">
                  ⏱️ Request Extension
                </button>
              `}
            </div>
          </div>
        </div>
      </div>
    `).join("");
  } else if (tabName === "lending") {
    // Current user is owner
    const container = document.getElementById("tab-content-lending");
    const activeLends = state.transactions.filter(t => t.ownerId === u.id && (t.status === "Active" || t.status === "PendingVerification" || t.status === "ReturnPendingConfirmation"));

    if (activeLends.length === 0) {
      container.innerHTML = `
        <div class="app-card" style="text-align: center; padding: 3rem 1.5rem;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🤝</div>
          <h3 style="font-weight: 700; color: #0F172A;">No Active Lending</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0.4rem 0 1.25rem 0;">You haven't lent out items recently. Share items to build your Community Trust Score!</p>
          <button class="btn-primary" onclick="switchView('list')">List an Item to Lend</button>
        </div>
      `;
      return;
    }

    container.innerHTML = activeLends.map(tx => `
      <div class="app-card" style="padding: 1.5rem; margin-bottom: 1rem;">
        <div style="display: flex; gap: 1rem; align-items: flex-start;">
          <img src="${tx.itemImages[0]}" style="width: 80px; height: 80px; border-radius: 12px; object-fit: cover;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span class="badge ${tx.status === 'Active' ? 'badge-emerald' : 'badge-amber'}">
                ${tx.status === 'ReturnPendingConfirmation' ? 'Drop-off Confirmation Required' : tx.status}
              </span>
              <span style="font-size: 0.8rem; color: var(--text-muted);">Due: ${tx.dueDate}</span>
            </div>
            <h3 style="font-size: 1.1rem; font-weight: 700; color: #0F172A; margin: 0.25rem 0;">${tx.itemTitle}</h3>
            <p style="font-size: 0.85rem; color: var(--text-muted);">
              Borrowed by <strong>${tx.borrowerName}</strong> • Desk: <strong>${tx.exchangeLocation}</strong>
            </p>

            <!-- Show 6-digit exchange code card for owner -->
            <div style="background: #F1F5F9; border-radius: 10px; padding: 0.75rem 1rem; margin: 0.75rem 0; display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 0.85rem; color: #475569;">Exchange Pickup Code:</span>
              <span style="font-family: monospace; font-size: 1.1rem; font-weight: 800; color: var(--primary); letter-spacing: 0.1em;">
                ${tx.exchangeCode}
              </span>
            </div>

            <!-- Actions -->
            <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
              ${tx.status === 'ReturnPendingConfirmation' ? `
                <button class="btn-accent" style="font-size: 0.85rem; padding: 0.5rem 1rem;" onclick="handleConfirmReturn('${tx.id}', '${tx.itemTitle}')">
                  ✓ Confirm Received in Good Condition
                </button>
              ` : `
                <button class="btn-secondary" style="font-size: 0.85rem; padding: 0.5rem 1rem;" onclick="showToast('Message sent to borrower', 'info')">
                  💬 Message Borrower
                </button>
                <button class="btn-accent" style="font-size: 0.85rem; padding: 0.5rem 1rem;" onclick="handleConfirmReturn('${tx.id}', '${tx.itemTitle}')">
                  ✓ Item Returned (Early Drop-off)
                </button>
              `}
            </div>
          </div>
        </div>
      </div>
    `).join("");
  } else if (tabName === "requests") {
    // Show requests
    const container = document.getElementById("tab-content-requests");
    const incomingReqs = state.requests.filter(r => r.ownerId === u.id);
    const outgoingReqs = state.requests.filter(r => r.borrowerId === u.id);

    container.innerHTML = `
      <div style="margin-bottom: 1.5rem;">
        <h4 style="font-size: 1rem; font-weight: 700; color: #0F172A; margin-bottom: 0.75rem;">
          Incoming Requests for Your Items (${incomingReqs.length})
        </h4>
        ${incomingReqs.length === 0 ? `
          <div class="app-card" style="padding: 1.25rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
            No incoming borrow requests at the moment.
          </div>
        ` : incomingReqs.map(r => `
          <div class="app-card" style="padding: 1.25rem; margin-bottom: 0.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
              <div>
                <span class="badge ${r.status === 'Pending' ? 'badge-amber' : r.status === 'Approved' ? 'badge-emerald' : 'badge-slate'}">
                  ${r.status}
                </span>
                <h4 style="font-weight: 700; font-size: 1rem; color: #0F172A; margin-top: 0.35rem;">${r.itemTitle}</h4>
                <div style="font-size: 0.85rem; color: var(--text-muted);">
                  Requested by <strong>${r.borrowerName}</strong>
                </div>
              </div>
              <div style="text-align: right; font-size: 0.8rem; color: var(--text-muted);">
                Drop-off at: <strong>${r.exchangeLocation}</strong>
              </div>
            </div>
            <p style="background: #F8FAFC; padding: 0.6rem 0.85rem; border-radius: 8px; font-size: 0.85rem; color: #334155; margin-bottom: 0.75rem; border-left: 3px solid var(--primary);">
              "${r.message}"
            </p>
            ${r.status === 'Pending' ? `
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn-primary" style="font-size: 0.8rem; padding: 0.4rem 0.85rem;" onclick="handleApproveRequest('${r.id}')">
                  ✓ Approve & Generate Code
                </button>
                <button class="btn-secondary" style="font-size: 0.8rem; padding: 0.4rem 0.85rem; color: #DC2626;" onclick="handleRejectRequest('${r.id}')">
                  Decline
                </button>
              </div>
            ` : `
              <div style="font-size: 0.8rem; color: var(--accent); font-weight: 600;">
                ✓ Request Approved
              </div>
            `}
          </div>
        `).join("")}
      </div>

      <div>
        <h4 style="font-size: 1rem; font-weight: 700; color: #0F172A; margin-bottom: 0.75rem;">
          Outgoing Requests Sent by You (${outgoingReqs.length})
        </h4>
        ${outgoingReqs.length === 0 ? `
          <div class="app-card" style="padding: 1.25rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
            You haven't requested any items yet.
          </div>
        ` : outgoingReqs.map(r => `
          <div class="app-card" style="padding: 1.25rem; margin-bottom: 0.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <span class="badge ${r.status === 'Pending' ? 'badge-amber' : r.status === 'Approved' ? 'badge-emerald' : 'badge-slate'}">
                  ${r.status}
                </span>
                <h4 style="font-weight: 700; font-size: 1rem; color: #0F172A; margin-top: 0.35rem;">${r.itemTitle}</h4>
                <div style="font-size: 0.85rem; color: var(--text-muted);">
                  Owner: <strong>${r.ownerName}</strong> • Desk: <strong>${r.exchangeLocation}</strong>
                </div>
              </div>
            </div>
            <p style="font-size: 0.85rem; color: #64748B; margin-top: 0.5rem;">"${r.message}"</p>
          </div>
        `).join("")}
      </div>
    `;
  } else if (tabName === "history") {
    // Completed transactions
    const container = document.getElementById("tab-content-history");
    const completed = state.transactions.filter(t => t.status === "Completed");

    if (completed.length === 0) {
      container.innerHTML = `
        <div class="app-card" style="text-align: center; padding: 3rem 1.5rem;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📜</div>
          <h3 style="font-weight: 700; color: #0F172A;">No Past History Yet</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem;">Completed exchanges will appear here with calculated impact.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = completed.map(t => `
      <div class="app-card" style="padding: 1.25rem; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span style="font-size: 1.75rem;">✅</span>
          <div>
            <h4 style="font-weight: 700; font-size: 0.95rem; color: #0F172A;">${t.itemTitle}</h4>
            <div style="font-size: 0.8rem; color: var(--text-muted);">
              ${t.borrowerId === u.id ? `Borrowed from ${t.ownerName}` : `Lent to ${t.borrowerName}`}
            </div>
          </div>
        </div>
        <div style="text-align: right;">
          <span class="badge badge-emerald">+1 Trust Point</span>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">₹1,500 Saved</div>
        </div>
      </div>
    `).join("");
  }
}

// Request approval with 6-digit exchange code modal
async function handleApproveRequest(requestId) {
  try {
    const res = await window.api.approveRequest(requestId);
    showToast(`Request Approved! 6-Digit Exchange Code: ${res.exchangeCode}`, "success");
    openExchangeCodeModal(res.exchangeCode, "Borrower will enter this code at the school exchange point to confirm item pickup.");
    await loadActivityData();
  } catch (err) {
    showToast(err.message || "Failed to approve request", "warning");
  }
}

async function handleRejectRequest(requestId) {
  try {
    await window.api.rejectRequest(requestId);
    showToast("Request declined.", "info");
    await loadActivityData();
  } catch (err) {
    showToast(err.message || "Failed to decline", "warning");
  }
}

// Safe Exchange Modal (Displays 6-Digit Code + QR Illustration)
function openExchangeCodeModal(code, note) {
  const modalEl = document.getElementById("exchange-code-modal");
  const contentEl = document.getElementById("exchange-code-content");
  if (!modalEl || !contentEl) return;

  contentEl.innerHTML = `
    <div class="exchange-code-box" style="text-align: center;">
      <div style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.9;">
        Safe School Exchange Verification
      </div>
      <div class="code-digits">${code}</div>
      <p style="font-size: 0.85rem; opacity: 0.95; max-width: 320px; margin: 0 auto;">
        ${note}
      </p>
    </div>

    <!-- QR Code visual representation -->
    <div style="text-align: center; padding: 1.5rem 1rem 0.5rem 1rem;">
      <div style="display: inline-block; padding: 1rem; background: #FFFFFF; border: 2px solid #E2E8F0; border-radius: 12px; box-shadow: var(--shadow-sm);">
        <svg width="120" height="120" viewBox="0 0 100 100" fill="#0F172A">
          <rect x="10" y="10" width="30" height="30" fill="#0F172A"/>
          <rect x="15" y="15" width="20" height="20" fill="#FFFFFF"/>
          <rect x="20" y="20" width="10" height="10" fill="#0F172A"/>
          <rect x="60" y="10" width="30" height="30" fill="#0F172A"/>
          <rect x="65" y="15" width="20" height="20" fill="#FFFFFF"/>
          <rect x="70" y="20" width="10" height="10" fill="#0F172A"/>
          <rect x="10" y="60" width="30" height="30" fill="#0F172A"/>
          <rect x="15" y="65" width="20" height="20" fill="#FFFFFF"/>
          <rect x="20" y="70" width="10" height="10" fill="#0F172A"/>
          <rect x="45" y="15" width="8" height="8"/>
          <rect x="45" y="30" width="8" height="8"/>
          <rect x="45" y="45" width="8" height="8"/>
          <rect x="20" y="45" width="8" height="8"/>
          <rect x="60" y="60" width="10" height="10"/>
          <rect x="75" y="60" width="15" height="8"/>
          <rect x="60" y="75" width="8" height="15"/>
          <rect x="75" y="80" width="12" height="10"/>
        </svg>
      </div>
      <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
        Scan or enter 6-digit code at the verified school counter
      </div>
    </div>

    <div style="padding: 1rem 1.5rem; text-align: center;">
      <button class="btn-primary" style="width: 100%;" onclick="closeExchangeCodeModal()">
        Got It, Thanks!
      </button>
    </div>
  `;

  modalEl.style.display = "flex";
}

function closeExchangeCodeModal() {
  const modalEl = document.getElementById("exchange-code-modal");
  if (modalEl) modalEl.style.display = "none";
}

// Borrower verifies code modal
function openVerifyCodeModal(txId, correctCode) {
  const code = prompt(`Enter the 6-Digit Exchange Code provided by the owner (Demo code: ${correctCode}):`, correctCode);
  if (code) {
    verifyCode(txId, code);
  }
}

async function verifyCode(txId, code) {
  try {
    await window.api.verifyExchangeCode(txId, code);
    showToast("🎉 Exchange verified! Safe loan is now active.", "success");
    await loadActivityData();
  } catch (err) {
    showToast(err.message || "Invalid code", "warning");
  }
}

// Return workflows
async function handleMarkReturned(txId, itemTitle) {
  if (!confirm(`Confirm drop-off of "${itemTitle}" at the designated school exchange point?`)) return;
  try {
    await window.api.markReturned(txId);
    showToast("Drop-off recorded! Owner notified to confirm receipt.", "success");
    await loadActivityData();
  } catch (err) {
    showToast(err.message || "Failed to mark returned", "warning");
  }
}

async function handleConfirmReturn(txId, itemTitle) {
  if (!confirm(`Did you receive "${itemTitle}" back in good condition?`)) return;
  try {
    await window.api.confirmReturn(txId);
    showToast("🎉 Return confirmed! Trust score increased & ₹1,500 impact added!", "success");
    await loadActivityData();
    await loadImpactData();
  } catch (err) {
    showToast(err.message || "Failed to confirm return", "warning");
  }
}

// --- SKILL SWAP MODULE ---
async function loadSkillsData() {
  const container = document.getElementById("skills-list-container");
  if (!container) return;

  try {
    const skills = await window.api.getSkills();
    state.skills = skills;

    if (skills.length === 0) {
      container.innerHTML = `<div class="app-card" style="padding: 2rem; text-align: center;">No skills listed yet.</div>`;
      return;
    }

    container.innerHTML = skills.map(s => `
      <div class="app-card" style="padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <img src="${s.userAvatar}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">
              <div>
                <div style="font-weight: 700; font-size: 0.85rem; color: #0F172A;">${s.userName}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${s.userGrade}</div>
              </div>
            </div>
            <span class="badge badge-purple">${s.durationMinutes} Mins</span>
          </div>

          <h3 style="font-size: 1.15rem; font-weight: 700; color: #0F172A; line-height: 1.35; margin-bottom: 0.5rem;">
            ${s.skillTitle}
          </h3>
          <p style="font-size: 0.85rem; color: #475569; line-height: 1.5; margin-bottom: 1rem;">
            ${s.description}
          </p>

          <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; padding: 0.75rem; margin-bottom: 0.75rem;">
            <div style="font-size: 0.75rem; font-weight: 700; color: #166534; text-transform: uppercase;">Looking for in exchange:</div>
            <div style="font-size: 0.85rem; font-weight: 600; color: #15803D; margin-top: 0.2rem;">
              🤝 ${s.desiredExchange}
            </div>
          </div>

          <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1rem;">
            ⏰ Availability: <strong>${s.availability}</strong>
          </div>
        </div>

        <div>
          ${state.currentUser && state.currentUser.id === s.userId ? `
            <div style="text-align: center; padding: 0.5rem; background: #F1F5F9; border-radius: 8px; font-size: 0.8rem; color: #64748B;">
              Your Skill Listing
            </div>
          ` : `
            <button class="btn-primary" style="width: 100%;" onclick="openProposeSkillModal('${s.id}')">
              Propose Skill Swap
            </button>
          `}
        </div>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<div style="padding: 2rem; color: red;">Failed to load skills.</div>`;
  }
}

function openCreateSkillModal() {
  const modalEl = document.getElementById("create-skill-modal");
  if (modalEl) modalEl.style.display = "flex";
}

function closeCreateSkillModal() {
  const modalEl = document.getElementById("create-skill-modal");
  if (modalEl) modalEl.style.display = "none";
}

async function handleCreateSkill(e) {
  e.preventDefault();
  const skillTitle = document.getElementById("skill-title").value.trim();
  const description = document.getElementById("skill-desc").value.trim();
  const durationMinutes = parseInt(document.getElementById("skill-duration").value);
  const desiredExchange = document.getElementById("skill-desired").value.trim();
  const availability = document.getElementById("skill-availability").value.trim();

  try {
    await window.api.createSkill({
      skillTitle,
      description,
      durationMinutes,
      desiredExchange,
      availability
    });
    closeCreateSkillModal();
    showToast("🎉 Skill offered to classmates!", "success");
    e.target.reset();
    loadSkillsData();
  } catch (err) {
    showToast(err.message || "Failed to list skill", "warning");
  }
}

function openProposeSkillModal(skillId) {
  const skill = state.skills.find(s => s.id === skillId);
  if (!skill) return;

  const modalEl = document.getElementById("propose-skill-modal");
  const contentEl = document.getElementById("propose-skill-content");
  if (!modalEl || !contentEl) return;

  contentEl.innerHTML = `
    <div style="padding: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div>
          <h3 style="font-size: 1.2rem; font-weight: 800; color: #0F172A;">Propose Skill Swap</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted);">With ${skill.userName}</p>
        </div>
        <button onclick="closeProposeSkillModal()" style="background:none; border:none; font-size:1.4rem; cursor:pointer; color:#94A3B8;">&times;</button>
      </div>

      <div style="background: #F8FAFC; border: 1px solid var(--border-color); border-radius: 10px; padding: 0.85rem; margin-bottom: 1rem; font-size: 0.85rem;">
        <strong>${skill.userName} wants:</strong> ${skill.desiredExchange}
      </div>

      <form onsubmit="submitSkillProposal(event, '${skill.id}')">
        <div style="margin-bottom: 1.25rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 0.4rem;">
            What can you teach or help with?
          </label>
          <textarea id="prop-message" rows="3" required
                    placeholder="Hi! I can teach you acoustic guitar chords in exchange for Python basics."
                    style="width: 100%; padding: 0.65rem; border: 1px solid var(--border-color); border-radius: 10px; font-family: inherit; font-size: 0.9rem; resize: none;"></textarea>
        </div>

        <div style="display: flex; gap: 0.75rem;">
          <button type="button" class="btn-secondary" style="flex: 1;" onclick="closeProposeSkillModal()">Cancel</button>
          <button type="submit" class="btn-primary" style="flex: 2;">Send Proposal</button>
        </div>
      </form>
    </div>
  `;

  modalEl.style.display = "flex";
}

function closeProposeSkillModal() {
  const modalEl = document.getElementById("propose-skill-modal");
  if (modalEl) modalEl.style.display = "none";
}

async function submitSkillProposal(e, skillId) {
  e.preventDefault();
  const message = document.getElementById("prop-message").value;

  try {
    await window.api.createSkillRequest({
      skillId,
      message
    });
    closeProposeSkillModal();
    showToast("Skill Swap proposal sent!", "success");
  } catch (err) {
    showToast(err.message || "Failed to send proposal", "warning");
  }
}

// --- IMPACT & ANALYTICS ---
async function loadImpactData() {
  try {
    const [community, personal] = await Promise.all([
      window.api.getImpact(),
      window.api.getPersonalImpact()
    ]);
    state.impact = community;
    state.personalImpact = personal;

    // Update community counters on Home and Impact page
    const counters = {
      "impact-items-reused": community.itemsReused.toLocaleString(),
      "impact-money-saved": formatINR(community.moneySaved),
      "impact-exchanges-count": community.successfulExchanges.toLocaleString(),
      "impact-waste-avoided": `${community.wasteAvoidedKg} kg`,
      "impact-active-loans": community.activeLoansCount,
      "impact-trees": community.treesEquivalent,
      "impact-co2": `${community.co2ReducedKg} kg`
    };

    for (const [id, val] of Object.entries(counters)) {
      document.querySelectorAll(`.${id}`).forEach(el => el.textContent = val);
    }

    // Render Personal Badges & Impact
    renderPersonalImpact(personal);
  } catch (err) {
    console.error("Failed to load impact:", err);
  }
}

function renderPersonalImpact(personal) {
  const container = document.getElementById("personal-impact-container");
  if (!container || !personal) return;

  container.innerHTML = `
    <div class="app-card" style="padding: 1.5rem; margin-bottom: 1.5rem;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <img src="${personal.user.avatarUrl}" style="width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 3px solid var(--primary);">
          <div>
            <h3 style="font-size: 1.25rem; font-weight: 800; color: #0F172A;">${personal.user.displayName}</h3>
            <div style="font-size: 0.85rem; color: var(--text-muted);">
              ${personal.user.grade} • Verified Authpur National Model School Student
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 1rem;">
          <div style="text-align: center; padding: 0.75rem 1.25rem; background: #EFF6FF; border-radius: 12px;">
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--primary);">${personal.trustScore}</div>
            <div style="font-size: 0.75rem; color: #1E40AF; font-weight: 600;">Trust Score</div>
          </div>
          <div style="text-align: center; padding: 0.75rem 1.25rem; background: #ECFDF5; border-radius: 12px;">
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--accent);">${formatINR(personal.moneySaved)}</div>
            <div style="font-size: 0.75rem; color: #065F46; font-weight: 600;">Money Saved</div>
          </div>
        </div>
      </div>
    </div>

    <div style="margin-bottom: 1.5rem;">
      <h4 style="font-size: 1.1rem; font-weight: 800; color: #0F172A; margin-bottom: 1rem;">
        🎖️ Community Badges & Recognition
      </h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem;">
        ${personal.badges.map(b => `
          <div class="app-card" style="padding: 1.25rem; border-left: 4px solid var(--accent);">
            <div style="font-weight: 800; font-size: 1rem; color: #0F172A; margin-bottom: 0.25rem;">${b.title}</div>
            <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">${b.description}</p>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// --- ADMIN DASHBOARD ---
async function loadAdminData() {
  try {
    const [reports, locations] = await Promise.all([
      window.api.getReports(),
      window.api.getLocations()
    ]);
    state.reports = reports;
    state.approvedLocations = locations;

    // Render reports
    const reportContainer = document.getElementById("admin-reports-container");
    if (reportContainer) {
      if (reports.length === 0) {
        reportContainer.innerHTML = `<div class="app-card" style="padding: 1.5rem; text-align: center; color: var(--text-muted);">No reports filed. Clean school record!</div>`;
      } else {
        reportContainer.innerHTML = reports.map(r => `
          <div class="app-card" style="padding: 1.25rem; margin-bottom: 0.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <span class="badge ${r.status === 'Open' ? 'badge-amber' : 'badge-emerald'}">${r.status}</span>
                <h4 style="font-weight: 700; font-size: 0.95rem; margin: 0.25rem 0;">${r.itemTitle ? `Item: ${r.itemTitle}` : 'User Report'}</h4>
                <div style="font-size: 0.8rem; color: var(--text-muted);">Reported by ${r.reporterName}</div>
              </div>
              ${r.status === 'Open' ? `
                <button class="btn-accent" style="font-size: 0.75rem; padding: 0.35rem 0.75rem;" onclick="handleResolveReport('${r.id}')">
                  Resolve
                </button>
              ` : ''}
            </div>
            <p style="background: #F8FAFC; padding: 0.5rem; border-radius: 6px; font-size: 0.8rem; margin-top: 0.5rem; color: #334155;">
              "${r.reason}"
            </p>
          </div>
        `).join("");
      }
    }

    // Render locations
    renderApprovedLocations();
  } catch (err) {
    console.error("Admin load error:", err);
  }
}

function renderApprovedLocations() {
  const container = document.getElementById("admin-locations-container");
  if (!container) return;

  container.innerHTML = state.approvedLocations.map(loc => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: #F8FAFC; border: 1px solid var(--border-color); border-radius: 10px; margin-bottom: 0.5rem;">
      <span style="font-weight: 600; font-size: 0.9rem; color: #0F172A;">📍 ${loc}</span>
      <button onclick="handleDeleteLocation('${loc}')" style="background:none; border:none; color:#DC2626; cursor:pointer; font-size:0.85rem; font-weight:700;">
        Remove
      </button>
    </div>
  `).join("");

  // Also update listing form dropdown
  const listLocationSelect = document.getElementById("list-location");
  if (listLocationSelect) {
    listLocationSelect.innerHTML = state.approvedLocations.map(loc => `
      <option value="${loc}">${loc}</option>
    `).join("");
  }
}

async function handleAddLocation(e) {
  e.preventDefault();
  const input = document.getElementById("new-location-input");
  const loc = input.value.trim();
  if (!loc) return;

  try {
    const res = await window.api.addLocation(loc);
    state.approvedLocations = res.locations;
    renderApprovedLocations();
    input.value = "";
    showToast("Added school approved exchange point!", "success");
  } catch (err) {
    showToast(err.message || "Failed to add location", "warning");
  }
}

async function handleDeleteLocation(loc) {
  if (!confirm(`Remove "${loc}" as an approved exchange desk?`)) return;
  try {
    const res = await window.api.deleteLocation(loc);
    state.approvedLocations = res.locations;
    renderApprovedLocations();
    showToast("Exchange point removed", "info");
  } catch (err) {
    showToast(err.message || "Failed to remove", "warning");
  }
}

async function handleResolveReport(reportId) {
  try {
    await window.api.resolveReport(reportId);
    showToast("Report marked resolved", "success");
    loadAdminData();
  } catch (err) {
    showToast(err.message || "Failed to resolve", "warning");
  }
}

// Generate School Sustainability Report (PDF/Print View)
function generateSustainabilityReport() {
  const win = window.open("", "_blank");
  win.document.write(`
    <html>
      <head>
        <title>Authpur National Model School - BorrowBox Impact Report</title>
        <style>
          body { font-family: sans-serif; padding: 40px; color: #0F172A; }
          h1 { color: #2563EB; }
          .stat-box { display: inline-block; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 20px; border-radius: 12px; margin-right: 15px; margin-bottom: 15px; min-width: 180px; }
          .stat-num { font-size: 28px; font-weight: bold; color: #10B981; }
          table { width: 100%; border-collapse: collapse; margin-top: 30px; }
          th, td { border: 1px solid #CBD5E1; padding: 10px; text-align: left; }
          th { background: #F1F5F9; }
        </style>
      </head>
      <body>
        <h1>🌱 Authpur National Model School • BorrowBox Sustainability Report</h1>
        <p>Generated on: ${new Date().toLocaleDateString()} | Verified School Circular Sharing Network</p>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #E2E8F0;">
        <div>
          <div class="stat-box">
            <div>Items Reused</div>
            <div class="stat-num">${state.impact ? state.impact.itemsReused : 1248}</div>
          </div>
          <div class="stat-box">
            <div>Parent & Student Savings</div>
            <div class="stat-num">${state.impact ? formatINR(state.impact.moneySaved) : '₹2.4L'}</div>
          </div>
          <div class="stat-box">
            <div>Landfill Waste Avoided</div>
            <div class="stat-num">${state.impact ? state.impact.wasteAvoidedKg : 384} kg</div>
          </div>
          <div class="stat-box">
            <div>Trees Equivalent</div>
            <div class="stat-num">${state.impact ? state.impact.treesEquivalent : 19.2}</div>
          </div>
        </div>
        <h3>Approved School Exchange Points:</h3>
        <ul>
          ${state.approvedLocations.map(l => `<li>${l}</li>`).join("")}
        </ul>
        <script>window.print();</script>
      </body>
    </html>
  `);
}

// --- REPORT MODAL ---
function openReportModal(itemId, ownerId) {
  const reason = prompt("Please describe why you are reporting this item or listing to the school admin:");
  if (reason) {
    window.api.createReport({
      itemId,
      reportedUserId: ownerId,
      reason
    }).then(() => {
      showToast("Report submitted to school administration for review.", "info");
    });
  }
}

// --- NOTIFICATIONS DROPDOWN ---
async function loadNotifications() {
  try {
    const notifs = await window.api.getNotifications();
    state.notifications = notifs;
    const unread = notifs.filter(n => !n.isRead).length;
    state.unreadNotifsCount = unread;

    const badge = document.getElementById("notif-badge");
    if (badge) {
      if (unread > 0) {
        badge.style.display = "flex";
        badge.textContent = unread;
      } else {
        badge.style.display = "none";
      }
    }
  } catch (e) {}
}

function toggleNotificationDropdown() {
  const dropdown = document.getElementById("notif-dropdown");
  if (!dropdown) return;

  const isVisible = dropdown.style.display === "block";
  if (isVisible) {
    dropdown.style.display = "none";
  } else {
    dropdown.style.display = "block";
    renderNotificationsList();
    window.api.markNotificationsRead();
    state.unreadNotifsCount = 0;
    const badge = document.getElementById("notif-badge");
    if (badge) badge.style.display = "none";
  }
}

function renderNotificationsList() {
  const listEl = document.getElementById("notif-list");
  if (!listEl) return;

  if (state.notifications.length === 0) {
    listEl.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No notifications.</div>`;
    return;
  }

  listEl.innerHTML = state.notifications.map(n => `
    <div style="padding: 0.85rem 1rem; border-bottom: 1px solid #F1F5F9; font-size: 0.85rem;">
      <div style="color: #0F172A; font-weight: 500; line-height: 1.4;">${n.message}</div>
      <div style="font-size: 0.75rem; color: #94A3B8; margin-top: 0.25rem;">${new Date(n.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
    </div>
  `).join("");
}

// --- PROFILE MANAGEMENT, CREATION, EDITING & USER SWITCHING ---

const AVATAR_PRESETS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80"
];

async function loadProfileData() {
  const container = document.getElementById("profile-view-container");
  if (!container) return;

  const u = state.currentUser;
  if (!u) return;

  // Refresh all users to ensure newly created profiles are listed
  state.users = await window.api.getUsers();
  updateHeaderUserUI();

  // Find user's items
  const userItems = state.items.filter(i => i.ownerId === u.id);

  container.innerHTML = `
    <!-- Top Profile Summary Card -->
    <div class="app-card" style="padding: 1.75rem; margin-bottom: 1.5rem; background: linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%);">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1.25rem;">
        <div style="display: flex; align-items: center; gap: 1.25rem;">
          <div style="position: relative;">
            <img src="${u.avatarUrl}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid var(--primary); box-shadow: var(--shadow-md);">
            <span style="position: absolute; bottom: 0; right: 0; background: var(--accent); color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800; border: 2px solid white;" title="Verified Student">✓</span>
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <h2 style="font-size: 1.4rem; font-weight: 800; color: #0F172A; margin: 0;">${u.fullName}</h2>
              <span class="badge ${u.role === 'school_admin' ? 'badge-purple' : 'badge-emerald'}">
                ${u.role === 'school_admin' ? 'Faculty Admin' : u.grade}
              </span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.2rem;">
              Display Name: <strong style="color: #334155;">${u.displayName}</strong> • <span>${u.email}</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--primary); font-weight: 600; margin-top: 0.25rem;">
              🏫 Authpur National Model School
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
          <button class="btn-primary" style="font-size: 0.85rem; padding: 0.5rem 1rem;" onclick="openEditProfileModal()">
            ✏️ Edit Profile
          </button>
          <button class="btn-secondary" style="font-size: 0.85rem; padding: 0.5rem 1rem;" onclick="openCreateProfileModal()">
            ➕ Create New Profile
          </button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1.25rem;">
        <div style="background: #EFF6FF; border-radius: 12px; padding: 0.85rem; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--primary);">${u.trustScore}</div>
          <div style="font-size: 0.75rem; font-weight: 600; color: #1E40AF;">Trust Score (Exchanges)</div>
        </div>
        <div style="background: #ECFDF5; border-radius: 12px; padding: 0.85rem; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--accent);">${userItems.length}</div>
          <div style="font-size: 0.75rem; font-weight: 600; color: #065F46;">Active Listings</div>
        </div>
        <div style="background: #FEF3C7; border-radius: 12px; padding: 0.85rem; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 800; color: #B45309;">${state.transactions.filter(t => t.borrowerId === u.id).length}</div>
          <div style="font-size: 0.75rem; font-weight: 600; color: #92400E;">Items Borrowed</div>
        </div>
        <div style="background: #F3E8FF; border-radius: 12px; padding: 0.85rem; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 800; color: #7C3AED;">${state.transactions.filter(t => t.ownerId === u.id).length}</div>
          <div style="font-size: 0.75rem; font-weight: 600; color: #6B21A8;">Items Lent</div>
        </div>
      </div>
    </div>

    <!-- CHANGE BETWEEN USERS SECTION -->
    <div style="margin-bottom: 2rem;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
        <div>
          <h3 style="font-size: 1.2rem; font-weight: 800; color: #0F172A;">
            🔄 Switch Between Campus Users
          </h3>
          <p style="font-size: 0.85rem; color: var(--text-muted);">
            Test and experience BorrowBox from the perspective of different students and faculty.
          </p>
        </div>
        <button class="btn-accent" style="font-size: 0.8rem; padding: 0.4rem 0.85rem;" onclick="openCreateProfileModal()">
          ➕ Add New Student
        </button>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem;">
        ${state.users.map(usr => {
          const isCurrent = usr.id === u.id;
          return `
            <div class="app-card ${isCurrent ? '' : 'app-card-interactive'}" 
                 style="padding: 1.25rem; border: 2px solid ${isCurrent ? '#10B981' : 'var(--border-color)'}; background: ${isCurrent ? '#F0FDF4' : '#FFFFFF'}; display: flex; flex-direction: column; justify-content: space-between;"
                 ${isCurrent ? '' : `onclick="switchPersona('${usr.id}')"`}>
              <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
                <img src="${usr.avatarUrl}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid ${isCurrent ? '#10B981' : '#E2E8F0'};">
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 800; font-size: 0.95rem; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${usr.displayName}
                  </div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">${usr.grade}</div>
                  <div style="font-size: 0.7rem; color: var(--primary); font-weight: 600;">Trust: ${usr.trustScore} pts</div>
                </div>
              </div>

              <div>
                ${isCurrent ? `
                  <div style="text-align: center; padding: 0.4rem; background: #DCFCE7; color: #166534; border-radius: 8px; font-size: 0.8rem; font-weight: 700;">
                    ✓ Active Current Profile
                  </div>
                ` : `
                  <button class="btn-secondary" style="width: 100%; font-size: 0.8rem; padding: 0.4rem;" onclick="event.stopPropagation(); switchPersona('${usr.id}')">
                    Switch to this User →
                  </button>
                `}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>

    <!-- User's Catalogued Items Section -->
    <div style="margin-bottom: 2rem;">
      <h3 style="font-size: 1.2rem; font-weight: 800; color: #0F172A; margin-bottom: 0.75rem;">
        📦 Listings Owned by You (${userItems.length})
      </h3>
      ${userItems.length === 0 ? `
        <div class="app-card" style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
          You haven't listed any items to share yet.
          <div style="margin-top: 0.75rem;">
            <button class="btn-primary" onclick="switchView('list')">List an Item Now</button>
          </div>
        </div>
      ` : `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
          ${userItems.map(item => `
            <div class="app-card" style="padding: 1rem; display: flex; gap: 0.75rem; align-items: center;">
              <img src="${item.images[0]}" style="width: 60px; height: 60px; border-radius: 10px; object-fit: cover;">
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 700; font-size: 0.9rem; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${item.title}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${item.category} • ${item.status}</div>
                <div style="font-size: 0.75rem; color: var(--primary); font-weight: 600;">📍 ${item.exchangeLocation}</div>
              </div>
              <button onclick="deleteMyItem('${item.id}')" style="background:none; border:none; color:#DC2626; cursor:pointer; font-size:1.1rem; padding: 0.25rem;" title="Delete Listing">
                🗑️
              </button>
            </div>
          `).join("")}
        </div>
      `}
    </div>
  `;
}

// Open Edit Profile Modal
function openEditProfileModal() {
  const u = state.currentUser;
  if (!u) return;

  const modalEl = document.getElementById("edit-profile-modal");
  if (!modalEl) return;

  document.getElementById("edit-full-name").value = u.fullName || "";
  document.getElementById("edit-display-name").value = u.displayName || "";
  document.getElementById("edit-grade").value = u.grade || "Grade 11";
  document.getElementById("edit-email").value = u.email || "";
  document.getElementById("edit-avatar-url").value = u.avatarUrl || "";
  document.getElementById("edit-avatar-preview").src = u.avatarUrl || "";

  renderAvatarPresets("edit");

  modalEl.style.display = "flex";
}

function closeEditProfileModal() {
  const modalEl = document.getElementById("edit-profile-modal");
  if (modalEl) modalEl.style.display = "none";
}

async function handleEditProfile(e) {
  e.preventDefault();
  const u = state.currentUser;
  if (!u) return;

  const fullName = document.getElementById("edit-full-name").value.trim();
  const displayName = document.getElementById("edit-display-name").value.trim() || fullName;
  const grade = document.getElementById("edit-grade").value;
  const email = document.getElementById("edit-email").value.trim();
  const avatarUrl = document.getElementById("edit-avatar-url").value.trim();

  try {
    const res = await window.api.updateProfile({
      fullName,
      displayName,
      grade,
      email,
      avatarUrl
    }, u.id);

    state.currentUser = res.user;
    state.users = await window.api.getUsers();
    updateHeaderUserUI();
    closeEditProfileModal();
    showToast("🎉 Profile updated successfully!", "success");
    loadProfileData();
  } catch (err) {
    showToast(err.message || "Failed to update profile", "warning");
  }
}

// Open Create Profile Modal
function openCreateProfileModal() {
  const modalEl = document.getElementById("create-profile-modal");
  if (!modalEl) return;

  document.getElementById("create-full-name").value = "";
  document.getElementById("create-display-name").value = "";
  document.getElementById("create-grade").value = "Grade 11";
  document.getElementById("create-email").value = "";
  document.getElementById("create-role").value = "student";
  const defaultAvatar = AVATAR_PRESETS[Math.floor(Math.random() * AVATAR_PRESETS.length)];
  document.getElementById("create-avatar-url").value = defaultAvatar;
  document.getElementById("create-avatar-preview").src = defaultAvatar;

  renderAvatarPresets("create");

  modalEl.style.display = "flex";
}

function closeCreateProfileModal() {
  const modalEl = document.getElementById("create-profile-modal");
  if (modalEl) modalEl.style.display = "none";
}

async function handleCreateProfile(e) {
  e.preventDefault();

  const fullName = document.getElementById("create-full-name").value.trim();
  const displayName = document.getElementById("create-display-name").value.trim() || fullName;
  const grade = document.getElementById("create-grade").value;
  let email = document.getElementById("create-email").value.trim();
  const role = document.getElementById("create-role").value;
  const avatarUrl = document.getElementById("create-avatar-url").value.trim() || AVATAR_PRESETS[0];

  if (!email) {
    email = `${fullName.toLowerCase().replace(/\s+/g, '.')}@authpurmodel.edu`;
  } else if (!email.includes("@")) {
    email = `${email}@authpurmodel.edu`;
  }

  try {
    const res = await window.api.createUser({
      fullName,
      displayName,
      grade,
      email,
      role,
      avatarUrl
    });

    state.currentUser = res.user;
    state.users = await window.api.getUsers();
    updateHeaderUserUI();
    closeCreateProfileModal();
    showToast(`🎉 Welcome to Authpur National Model School, ${res.user.displayName}!`, "success");
    switchView("profile");
  } catch (err) {
    showToast(err.message || "Failed to create profile", "warning");
  }
}

function renderAvatarPresets(type) {
  const container = document.getElementById(`${type}-avatar-presets`);
  if (!container) return;

  container.innerHTML = AVATAR_PRESETS.map(url => `
    <img src="${url}" 
         onclick="selectPresetAvatar('${type}', '${url}')"
         style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; cursor: pointer; border: 2px solid #E2E8F0; transition: transform 0.15s ease;"
         onmouseover="this.style.transform='scale(1.15)'; this.style.borderColor='var(--primary)';"
         onmouseout="this.style.transform='scale(1)'; this.style.borderColor='#E2E8F0';">
  `).join("");
}

function selectPresetAvatar(type, url) {
  const input = document.getElementById(`${type}-avatar-url`);
  const preview = document.getElementById(`${type}-avatar-preview`);
  if (input) input.value = url;
  if (preview) preview.src = url;
}

// Reset Demo State
async function handleResetDemo() {
  if (!confirm("Reset BorrowBox demo to initial competition seed state? (1,248 items reused, active Casio loan, pending Arduino request)")) return;
  try {
    await window.api.resetDemo();
    showToast("🎉 Database reset to pristine competition seed state!", "success");
    await initApp();
  } catch (err) {
    showToast("Failed to reset demo", "warning");
  }
}

// Close modals when clicking outside
window.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-backdrop")) {
    e.target.style.display = "none";
  }
  const notifDropdown = document.getElementById("notif-dropdown");
  const notifBell = document.getElementById("notif-bell-btn");
  if (notifDropdown && notifBell && !notifDropdown.contains(e.target) && !notifBell.contains(e.target)) {
    notifDropdown.style.display = "none";
  }
});

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", initApp);
