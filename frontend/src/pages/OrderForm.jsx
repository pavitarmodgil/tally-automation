import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

export default function OrderForm() {
  const { phone } = useParams();

  const [customer, setCustomer]   = useState(null);
  const [items, setItems]         = useState([]);       // all available items
  const [cart, setCart]           = useState({});       // { itemName: qty }
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  // Load customer + items on mount
  useEffect(() => {
    axios.get(`/api/customers/${phone}`)
      .then(r => setCustomer(r.data))
      .catch(() => setError("This link is not valid. Please contact your supplier."));

    axios.get("/api/items")
      .then(r => setItems(r.data))
      .catch(() => setError("Could not load items. Please try again."));
  }, [phone]);

  function setQty(itemName, value) {
    const qty = Math.max(0, parseInt(value) || 0);
    setCart(prev => ({ ...prev, [itemName]: qty }));
  }

  function getOrderItems() {
    return items
      .filter(item => cart[item.name] > 0)
      .map(item => ({
        name:       item.name,
        qty:        cart[item.name],
        finalPrice: item.rate * (1 + item.gst / 100),  // default GST-inclusive price
      }));
  }

  const orderItems = getOrderItems();
  const total = orderItems.reduce((sum, i) => sum + i.finalPrice * i.qty, 0);

  async function handleSubmit() {
    if (orderItems.length === 0) {
      setError("Please add at least one item.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await axios.post("/api/orders", { phone, items: orderItems });
      setSubmitted(true);
    } catch (e) {
      setError(e.response?.data?.error || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="page" style={{ paddingTop: 60, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h1>Order placed!</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Your order has been received. We will process it shortly.
        </p>
      </div>
    );
  }

  // ── Error screen ────────────────────────────────────────────────────────
  if (error && !customer) {
    return (
      <div className="page" style={{ paddingTop: 60, textAlign: "center" }}>
        <p style={{ color: "#dc2626" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p className="muted">Place your order</p>
        <h1>{customer?.name || "Loading..."}</h1>
      </div>

      {/* Items */}
      <div className="gap">
        {items.map(item => (
          <div className="card" key={item.name}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div className="muted">
                  ₹{(item.rate * (1 + item.gst / 100)).toFixed(2)} / {item.unit}
                </div>
              </div>
              <div style={{ color: "#888", fontSize: 13 }}>GST {item.gst}%</div>
            </div>
            <div className="row">
              <button
                onClick={() => setQty(item.name, (cart[item.name] || 0) - 1)}
                style={{ background: "#f3f4f6", color: "#222", width: 40, height: 40, fontSize: 20, borderRadius: 8, padding: 0 }}
              >−</button>
              <input
                type="number"
                min="0"
                value={cart[item.name] || ""}
                placeholder="0"
                onChange={e => setQty(item.name, e.target.value)}
                style={{ textAlign: "center", width: 80 }}
              />
              <button
                onClick={() => setQty(item.name, (cart[item.name] || 0) + 1)}
                style={{ background: "#f3f4f6", color: "#222", width: 40, height: 40, fontSize: 20, borderRadius: 8, padding: 0 }}
              >+</button>
              <span className="muted" style={{ marginLeft: "auto", minWidth: 70, textAlign: "right" }}>
                {cart[item.name] > 0
                  ? `₹${(item.rate * (1 + item.gst / 100) * cart[item.name]).toFixed(2)}`
                  : ""}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Summary + Submit */}
      {orderItems.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontWeight: 600 }}>Total</span>
            <span style={{ fontWeight: 700, fontSize: 18 }}>₹{total.toFixed(2)}</span>
          </div>
          {error && <p style={{ color: "#dc2626", marginBottom: 12, fontSize: 14 }}>{error}</p>}
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? "Placing order..." : "Place Order"}
          </button>
        </div>
      )}

      {orderItems.length === 0 && (
        <p className="muted" style={{ textAlign: "center", marginTop: 32 }}>
          Select items above to place an order
        </p>
      )}
    </div>
  );
}
