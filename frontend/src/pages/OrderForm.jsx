import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

export default function OrderForm() {
  const { phone } = useParams();

  const [customer,    setCustomer]    = useState(null);
  const [items,       setItems]       = useState([]);
  const [cart,        setCart]        = useState({});      // { itemName: qty }
  const [submitted,   setSubmitted]   = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);   // one-time link check
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  // Load customer + items on mount
  useEffect(() => {
    setLoading(true);
    const p1 = axios.get(`/api/customers/${phone}`)
      .then(r => setCustomer(r.data))
      .catch(err => {
        if (err.response?.status === 403 && err.response?.data?.error === "link_expired") {
          setLinkExpired(true);
        } else {
          setError("This link is not valid. Please contact your supplier.");
        }
      });

    const p2 = axios.get("/api/items")
      .then(r => setItems(r.data))
      .catch(() => setError("Could not load items. Please try again."));

    Promise.all([p1, p2]).finally(() => setLoading(false));
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
        finalPrice: item.rate * (1 + item.gst / 100),
      }));
  }

  const orderItems = getOrderItems();
  const total      = orderItems.reduce((sum, i) => sum + i.finalPrice * i.qty, 0);

  async function handleSubmit() {
    if (orderItems.length === 0) { setError("Please add at least one item."); return; }
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

  // ── Link already used ──────────────────────────────────────────────────────
  if (linkExpired) {
    return (
      <div className="of-confirm-page">
        <div className="of-confirm-brand">Architectural Wholesale</div>

        <div className="of-confirm-icon-wrap">
          <div className="of-confirm-icon-glow" />
          <div className="of-confirm-icon-circle">✅</div>
        </div>

        <h1 className="of-confirm-heading">Your order has been placed!</h1>
        <p className="of-confirm-sub">
          This link has expired. Contact us on WhatsApp if you need to make changes.
        </p>

        {/* PLACEHOLDER: replace the number in wa.me/XXXXXXXXXX with your WhatsApp number */}
        <a
          href="https://wa.me/XXXXXXXXXX"
          className="of-btn-whatsapp"
        >
          💬 Message us on WhatsApp
        </a>

        <p className="of-confirm-footer">Thank you for choosing Architectural Wholesale</p>
      </div>
    );
  }

  // ── Submitted success screen ───────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="of-success-page">
        <div className="of-success-icon">✅</div>
        <h1 className="of-success-heading">Order placed!</h1>
        <p className="of-success-sub">
          Your order has been received. We will process it shortly.
        </p>
      </div>
    );
  }

  // ── Generic error (invalid link / network issue) ───────────────────────────
  if (error && !customer && !loading) {
    return (
      <div className="of-success-page">
        <p style={{ color: "var(--color-danger)", fontSize: 15 }}>{error}</p>
      </div>
    );
  }

  // ── Skeleton loading ───────────────────────────────────────────────────────
  if (loading && items.length === 0) {
    return (
      <div className="of-page">
        <header className="of-header">
          <div className="of-header-brand">Architectural Wholesale</div>
          <div className="of-header-subtitle">Place your order</div>
        </header>
        <div className="of-content">
          {[1, 2, 3].map(n => (
            <div className="of-skeleton-card" key={n}>
              <div className="skeleton-line" style={{ height: 16, width: "60%", marginBottom: 8 }} />
              <div className="skeleton-line" style={{ height: 12, width: "40%" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                <div className="skeleton-line" style={{ height: 36, width: 110, borderRadius: 20 }} />
                <div className="skeleton-line" style={{ height: 16, width: 60 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Main order form ────────────────────────────────────────────────────────
  return (
    <div className="of-page">
      {/* Fixed top header */}
      <header className="of-header">
        <div className="of-header-brand">Architectural Wholesale</div>
        <div className="of-header-subtitle">Place your order</div>
      </header>

      {/* Content */}
      <div className="of-content">
        {items.map(item => {
          const unitPrice = item.rate * (1 + item.gst / 100);
          const qty       = cart[item.name] || 0;
          const lineTotal = qty > 0 ? `₹${(unitPrice * qty).toFixed(2)}` : "";

          return (
            <div className="of-card" key={item.name}>
              <div className="of-card-row">
                <div className="of-card-info">
                  <div className="of-card-name">{item.name}</div>
                  <div className="of-card-price">
                    ₹{unitPrice.toFixed(2)} / {item.unit} ·{" "}
                    <span className="gst-label">GST {item.gst}%</span>
                  </div>
                </div>
              </div>

              <div className="of-stepper-row">
                <div className="of-stepper">
                  <button
                    className="of-stepper-btn"
                    onClick={() => setQty(item.name, qty - 1)}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <input
                    className="of-stepper-input"
                    type="number"
                    min="0"
                    value={qty === 0 ? "" : qty}
                    placeholder="0"
                    onChange={e => setQty(item.name, e.target.value)}
                  />
                  <button
                    className="of-stepper-btn"
                    onClick={() => setQty(item.name, qty + 1)}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                {/* Line total — only rendered when qty > 0, no layout jump */}
                <span className="of-line-total">{lineTotal}</span>
              </div>
            </div>
          );
        })}

        {error && <p className="of-error">{error}</p>}

        {items.length === 0 && !loading && (
          <p style={{ textAlign: "center", color: "var(--color-muted)", fontSize: 14, marginTop: 32 }}>
            No items available.
          </p>
        )}
      </div>

      {/* Sticky bottom bar — only when cart has items */}
      {orderItems.length > 0 && (
        <div className="of-bottom-bar">
          <div className="of-bottom-bar-inner">
            <div>
              <div className="of-cart-summary-label">
                {orderItems.length} item{orderItems.length !== 1 ? "s" : ""} in cart
              </div>
              <div className="of-cart-summary-total">
                ₹{total.toFixed(2)}{" "}
                <span>total</span>
              </div>
            </div>
            <button
              className="of-btn-place-order"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Placing order…" : "Place Order"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
