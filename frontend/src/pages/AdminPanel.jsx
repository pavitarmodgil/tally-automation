import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";

// Build Authorization header
function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

export default function AdminPanel() {
  // ── Auth state ─────────────────────────────────────────────────────────────
  const [token,         setToken]         = useState(() => localStorage.getItem("admin_token"));
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword,  setShowPassword]  = useState(false);
  const [loginError,    setLoginError]    = useState("");
  const [loginLoading,  setLoginLoading]  = useState(false);

  // ── Panel state ────────────────────────────────────────────────────────────
  const [orders,  setOrders]  = useState([]);
  const [filter,  setFilter]  = useState("all");   // all | pending | sent
  const [sending, setSending] = useState(null);    // orderId being sent
  const [message, setMessage] = useState(null);    // { type: "success"|"error", text }
  const [loading, setLoading] = useState(true);

  // Auto-dismiss toast after 4s
  const toastTimer = useRef(null);
  useEffect(() => {
    if (!message) return;
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(toastTimer.current);
  }, [message]);

  // ── Clear token + go back to login ──────────────────────────────────────────
  function handleLogout() {
    localStorage.removeItem("admin_token");
    setToken(null);
    setOrders([]);
  }

  // ── Handle 401 from any API call ─────────────────────────────────────────────
  function handle401() {
    localStorage.removeItem("admin_token");
    setToken(null);
  }

  // ── Login ───────────────────────────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const r = await axios.post("/api/auth/login", { password: loginPassword });
      localStorage.setItem("admin_token", r.data.token);
      setToken(r.data.token);
      setLoginPassword("");
    } catch (err) {
      setLoginError(err.response?.data?.error || "Login failed. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  }

  // ── Fetch orders ─────────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = filter !== "all" ? { status: filter } : {};
      const r = await axios.get("/api/orders", {
        params,
        headers: authHeader(token),
      });
      setOrders(r.data);
    } catch (err) {
      if (err.response?.status === 401) { handle401(); return; }
      setMessage({ type: "error", text: "Could not load orders." });
    } finally {
      setLoading(false);
    }
  }, [filter, token]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Send order to Tally ──────────────────────────────────────────────────────
  async function sendToTally(orderId) {
    setSending(orderId);
    setMessage(null);
    try {
      const r = await axios.post(`/api/orders/${orderId}/send`, {}, {
        headers: authHeader(token),
      });
      setMessage({
        type: "success",
        text: `Sent to Tally — voucher ${r.data.voucherNumber}`,
      });
      fetchOrders();
    } catch (err) {
      if (err.response?.status === 401) { handle401(); return; }
      setMessage({
        type: "error",
        text: err.response?.data?.error || "Failed to send to Tally.",
      });
    } finally {
      setSending(null);
    }
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
      " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    );
  }

  function orderTotal(items) {
    return items.reduce((sum, i) => sum + i.finalPrice * i.qty, 0).toFixed(2);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  LOGIN SCREEN
  // ══════════════════════════════════════════════════════════════════════════
  if (!token) {
    return (
      <div className="login-page">
        {/* Decorative blobs */}
        <div className="login-blob-tr" />
        <div className="login-blob-bl" />

        <main className="login-container">
          {/* Brand */}
          <div className="login-brand-area">
            <div className="login-shield-icon">🛡️</div>
            <h2 className="login-brand-name">Architectural Wholesale</h2>
          </div>

          {/* Card */}
          <div className="login-card">
            <div className="login-card-header">
              <h1 className="login-title">Admin Login</h1>
              <p className="login-subtitle">Please enter your credentials to continue.</p>
            </div>

            <form className="login-form" onSubmit={handleLogin}>
              <div>
                <label className="login-field-label" htmlFor="password">Password</label>
                <div className="login-input-wrap">
                  <input
                    className="login-input"
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    className="login-eye-btn"
                    onClick={() => setShowPassword(p => !p)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "🙈" : "👁"}
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="login-error">{loginError}</div>
              )}

              <button
                type="submit"
                className="login-btn"
                disabled={loginLoading}
              >
                {loginLoading ? "Logging in…" : "Login"}
              </button>
            </form>

            <div className="login-security-note">
              <p>
                Only authorized users can access this panel.
                All login attempts are logged for security purposes.
              </p>
            </div>
          </div>

          <footer className="login-footer">
            <p>Tally Automation System</p>
          </footer>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ADMIN PANEL
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="admin-layout">
      {/* ── Sidebar ── */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <div className="admin-sidebar-brand-name">Architectural Wholesale</div>
          <div className="admin-sidebar-brand-sub">Wholesale Manager</div>
        </div>

        <nav className="admin-nav">
          {/* Dashboard — non-clickable placeholder */}
          <span className="admin-nav-item disabled-nav">
            <span className="admin-nav-icon">⊞</span>
            Dashboard
          </span>

          {/* Orders — active */}
          <span className="admin-nav-item active">
            <span className="admin-nav-icon">🛒</span>
            Orders
          </span>

          {/* Customers — future */}
          <span className="admin-nav-item disabled-nav">
            <span className="admin-nav-icon">👥</span>
            Customers
          </span>

          {/* Inventory — future */}
          <span className="admin-nav-item disabled-nav">
            <span className="admin-nav-icon">📦</span>
            Inventory
          </span>
        </nav>

        <div className="admin-sidebar-footer">
          <button className="admin-logout-btn" onClick={handleLogout}>
            <span className="admin-nav-icon">↩</span>
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="admin-main">
        {/* Top bar */}
        <header className="admin-topbar">
          <div className="admin-topbar-title-group">
            <div className="admin-topbar-title">Orders</div>
            <div className="admin-topbar-subtitle">Management Dashboard</div>
          </div>

          <div className="admin-topbar-actions">
            {/* Filter pills */}
            <div className="admin-filter-pills">
              {["all", "pending", "sent"].map(f => (
                <button
                  key={f}
                  className={`admin-filter-pill${filter === f ? " active" : ""}`}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "All" : f === "pending" ? "Pending" : "Sent"}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button className="admin-refresh-btn" onClick={fetchOrders} aria-label="Refresh orders">
              ↻
            </button>
          </div>
        </header>

        {/* Orders list */}
        <div className="admin-orders-list">
          {loading ? (
            <p className="admin-empty">Loading orders…</p>
          ) : orders.length === 0 ? (
            <p className="admin-empty">No orders found.</p>
          ) : (
            orders.map(order => (
              <div className="order-card" key={order._id}>
                {/* Card header */}
                <div className="order-card-header">
                  <div>
                    <div className="order-card-customer">{order.customer}</div>
                    <div className="order-card-meta">{formatDate(order.createdAt)}</div>
                  </div>
                  <span className={`badge badge-${order.status}`}>
                    {order.status === "sent" ? "Sent to Tally" : "Pending"}
                  </span>
                </div>

                {/* Items table */}
                <div className="order-card-table-wrap">
                  <table className="order-table">
                    <thead>
                      <tr>
                        <th>Item Details</th>
                        <th>Qty</th>
                        <th>Rate (Incl.)</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item, i) => (
                        <tr key={i}>
                          <td>
                            <span className="order-table-item-name">{item.name}</span>
                          </td>
                          <td>{item.qty}</td>
                          <td>₹{item.finalPrice.toFixed(2)}</td>
                          <td>₹{(item.finalPrice * item.qty).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Card footer */}
                <div className="order-card-footer">
                  <div>
                    <div className="order-card-total-label">Total Amount</div>
                    <div className="order-card-total-amount">₹{orderTotal(order.items)}</div>
                  </div>

                  {/* Pending → Send to Tally button */}
                  {order.status === "pending" && (
                    <button
                      className="btn-send-tally"
                      onClick={() => sendToTally(order._id)}
                      disabled={sending === order._id}
                    >
                      {sending === order._id ? (
                        <>
                          <span className="spinner" />
                          Sending…
                        </>
                      ) : (
                        <>
                          ☁ Send to Tally
                        </>
                      )}
                    </button>
                  )}

                  {/* Sent → green indicator + voucher */}
                  {order.status === "sent" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      {order.voucherNumber && (
                        <div className="order-sent-state">
                          <span className="order-sent-voucher">Voucher #{order.voucherNumber}</span>
                          <span className="order-sent-time">
                            {order.sentAt
                              ? new Date(order.sentAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                              : ""}
                          </span>
                        </div>
                      )}
                      <button className="btn-sent-indicator" disabled>
                        ✓ Sent
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Toast notification */}
      {message && (
        <div className={`admin-toast ${message.type}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
