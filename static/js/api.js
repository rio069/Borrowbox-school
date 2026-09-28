/**
 * BorrowBox API Client
 * Connects frontend UI to Starlette REST endpoints with authentication header
 */

const API_BASE = "";

class ApiClient {
  constructor() {
    this.currentUserId = localStorage.getItem("borrowbox_user_id") || "user-maya";
  }

  setUserId(id) {
    this.currentUserId = id;
    localStorage.setItem("borrowbox_user_id", id);
  }

  getHeaders() {
    return {
      "Content-Type": "application/json",
      "x-user-id": this.currentUserId
    };
  }

  async request(path, options = {}) {
    const headers = { ...this.getHeaders(), ...(options.headers || {}) };
    try {
      const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
      if (!res.ok) {
        let errData;
        try {
          errData = await res.json();
        } catch (e) {
          errData = { message: res.statusText };
        }
        throw new Error(errData.error || errData.message || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`API Error [${path}]:`, err);
      throw err;
    }
  }

  // --- Auth & Persona ---
  async getMe() {
    return this.request("/api/auth/me");
  }

  async getUsers() {
    return this.request("/api/auth/users");
  }

  async switchUser(userId) {
    const res = await this.request("/api/auth/switch-user", {
      method: "POST",
      body: JSON.stringify({ userId })
    });
    this.setUserId(userId);
    return res;
  }

  async createUser(userData) {
    const res = await this.request("/api/users", {
      method: "POST",
      body: JSON.stringify(userData)
    });
    if (res && res.user && res.user.id) {
      this.setUserId(res.user.id);
    }
    return res;
  }

  async updateProfile(userData, userId = null) {
    const endpoint = userId ? `/api/users/${userId}` : "/api/auth/me";
    return this.request(endpoint, {
      method: "PUT",
      body: JSON.stringify(userData)
    });
  }

  // --- Items ---
  async getItems(filters = {}) {
    const params = new URLSearchParams();
    if (filters.category && filters.category !== "All") params.append("category", filters.category);
    if (filters.condition && filters.condition !== "All") params.append("condition", filters.condition);
    if (filters.status && filters.status !== "All") params.append("status", filters.status);
    if (filters.q) params.append("q", filters.q);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/api/items${query}`);
  }

  async getItem(id) {
    return this.request(`/api/items/${id}`);
  }

  async createItem(data) {
    return this.request("/api/items", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  async deleteItem(id) {
    return this.request(`/api/items/${id}`, {
      method: "DELETE"
    });
  }

  // --- Borrow Requests ---
  async getRequests() {
    return this.request("/api/requests");
  }

  async createRequest(data) {
    return this.request("/api/requests", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  async approveRequest(requestId) {
    return this.request(`/api/requests/${requestId}/approve`, {
      method: "POST"
    });
  }

  async rejectRequest(requestId) {
    return this.request(`/api/requests/${requestId}/reject`, {
      method: "POST"
    });
  }

  // --- Transactions & Returns ---
  async getTransactions() {
    return this.request("/api/transactions");
  }

  async verifyExchangeCode(txId, code) {
    return this.request(`/api/transactions/${txId}/verify-code`, {
      method: "POST",
      body: JSON.stringify({ exchangeCode: code })
    });
  }

  async markReturned(txId) {
    return this.request(`/api/transactions/${txId}/return`, {
      method: "POST"
    });
  }

  async confirmReturn(txId) {
    return this.request(`/api/transactions/${txId}/confirm-return`, {
      method: "POST"
    });
  }

  // --- Skills ---
  async getSkills() {
    return this.request("/api/skills");
  }

  async createSkill(data) {
    return this.request("/api/skills", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  async getSkillRequests() {
    return this.request("/api/skills/requests");
  }

  async createSkillRequest(data) {
    return this.request("/api/skills/requests", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  async respondSkillRequest(requestId, action) {
    return this.request(`/api/skills/requests/${requestId}/respond`, {
      method: "POST",
      body: JSON.stringify({ action })
    });
  }

  // --- Impact ---
  async getImpact() {
    return this.request("/api/impact");
  }

  async getPersonalImpact() {
    return this.request("/api/impact/personal");
  }

  // --- Admin Moderation & Exchange Points ---
  async getReports() {
    return this.request("/api/admin/reports");
  }

  async createReport(data) {
    return this.request("/api/reports", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  async resolveReport(reportId) {
    return this.request(`/api/admin/reports/${reportId}/resolve`, {
      method: "POST"
    });
  }

  async getLocations() {
    return this.request("/api/admin/locations");
  }

  async addLocation(location) {
    return this.request("/api/admin/locations", {
      method: "POST",
      body: JSON.stringify({ location })
    });
  }

  async deleteLocation(location) {
    return this.request("/api/admin/locations/remove", {
      method: "POST",
      body: JSON.stringify({ location })
    });
  }

  // --- Notifications ---
  async getNotifications() {
    return this.request("/api/notifications");
  }

  async markNotificationsRead() {
    return this.request("/api/notifications/mark-read", {
      method: "POST"
    });
  }

  // --- Reset Demo ---
  async resetDemo() {
    return this.request("/api/reset-demo", {
      method: "POST"
    });
  }
}

const api = new ApiClient();
window.api = api;
