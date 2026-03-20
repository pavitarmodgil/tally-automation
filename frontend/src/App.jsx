import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import OrderForm  from "./pages/OrderForm";
import AdminPanel from "./pages/AdminPanel";

export default function App() {
  return (
    <Routes>
      <Route path="/order/:phone" element={<OrderForm />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="*" element={<Navigate to="/admin" />} />
    </Routes>
  );
}