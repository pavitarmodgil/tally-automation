import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";

export default function AdminPanel() {
  const [orders, setOrders]       = useState([]);
  const [filter, setFilter]       = useState("all");   // all | pending | sent
  const [sending, setSending]     = useState(null);    // orderId currently being sent
  const [message, setMessage]     = useState(null);    // { type, text }
  const [loading, setLoading]     = useState(true);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== "all" ? { status: filter } : {};
      const r = await axios.get("/api/orders", { params });
      setOrders(r.data);
    } catch {
      setMessage({ type: "error", text: "Could not load orders." });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  async function sendToTally(orderId) {
    setSending(orderId);
    setMessage(null);
    try {
      const r = await axios.post(`/api/orders/${orderId}/send`);
      setMessage({
        type: "success",
        text: `✅ XML generated — ${r.data.fileName}. Now import in Tally: O: Import → Transactions`,
      });
      fetchOrders();
    } catch (e) {
      setMessage({
        type: "error",
        text: e.response?.data?.error || "Failed to send to Tally.",
      });
    } finally {
      setSending(null);
    }
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  function orderTotal(items) {
    return items.reduce((sum, i) => sum + i.finalPrice * i.qty, 0).toFixed(2);
  }

  return (
    <div className="page-wide">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1>Admin Panel</h1>
        <p className="muted">Tally Automation — Orders</p>
      </div>

      {/* Filter tabs */}
      <div className="row" style={{ marginBottom: 20, gap: 8 }}>
        {["all", "pending", "sent"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "#4f46e5" : "#e5e7eb",
              color: filter === f ? "white" : "#374151",
              padding: "8px 18px",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button
          onClick={fetchOrders}
          style={{ background: "#f3f4f6", color: "#374151", padding: "8px 14px", borderRadius: 8, fontSize: 14, marginLeft: "auto" }}
        >
          Refresh
        </button>
      </div>

      {/* Message banner */}
      {message && (
        <div style={{
          background: message.type === "success" ? "#dcfce7" : "#fee2e2",
          color:      message.type === "success" ? "#166534" : "#991b1b",
          padding: "12px 16px",
          borderRadius: 10,
          marginBottom: 16,
          fontSize: 14,
        }}>
          {message.text}
        </div>
      )}

      {/* Orders list */}
      {loading ? (
        <p className="muted" style={{ textAlign: "center", marginTop: 40 }}>Loading orders...</p>
      ) : orders.length === 0 ? (
        <p className="muted" style={{ textAlign: "center", marginTop: 40 }}>No orders found.</p>
      ) : (
        <div className="gap">
          {orders.map(order => (
            <div className="card" key={order._id}>
              {/* Order header */}
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{order.customer}</div>
                  <div className="muted">{formatDate(order.createdAt)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className={`badge badge-${order.status}`}>
                    {order.status === "sent" ? "Sent to Tally" : "Pending"}
                  </span>
                  {order.voucherNumber && (
                    <div className="muted" style={{ marginTop: 4 }}>{order.voucherNumber}</div>
                  )}
                </div>
              </div>

              {/* Items table */}
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14, fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left",  padding: "6px 0", color: "#888", fontWeight: 500 }}>Item</th>
                    <th style={{ textAlign: "center", padding: "6px 0", color: "#888", fontWeight: 500 }}>Qty</th>
                    <th style={{ textAlign: "right",  padding: "6px 0", color: "#888", fontWeight: 500 }}>Rate</th>
                    <th style={{ textAlign: "right",  padding: "6px 0", color: "#888", fontWeight: 500 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "6px 0" }}>{item.name}</td>
                      <td style={{ textAlign: "center", padding: "6px 0" }}>{item.qty}</td>
                      <td style={{ textAlign: "right",  padding: "6px 0" }}>₹{item.finalPrice.toFixed(2)}</td>
                      <td style={{ textAlign: "right",  padding: "6px 0", fontWeight: 600 }}>
                        ₹{(item.finalPrice * item.qty).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Footer */}
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700 }}>Total: ₹{orderTotal(order.items)}</span>
                {order.status === "pending" && (
                  <button
                    className="btn-success"
                    onClick={() => sendToTally(order._id)}
                    disabled={sending === order._id}
                    style={{ padding: "10px 20px", fontSize: 14 }}
                  >
                    {sending === order._id ? "Sending..." : "Send to Tally"}
                  </button>
                )}
                {order.status === "sent" && (
                  <span style={{ color: "#16a34a", fontWeight: 600, fontSize: 14 }}>
                    Sent ✓
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
