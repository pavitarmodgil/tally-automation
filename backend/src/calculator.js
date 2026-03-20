/**
 * calculator.js
 * Calculates base price and GST breakdown for a single item.
 * GST rate is read per-item from items.json config.
 *
 * Rule: NEVER let Tally calculate GST — always do it here.
 */

/**
 * Calculate amounts for one order item.
 *
 * @param {Object} item       - Order item: { name, qty, finalPrice }
 * @param {number} gstRate    - GST % from items.json (e.g. 18)
 * @returns {Object}          - Calculated values for XML builder
 */
function calculateItem(item, gstRate) {
  const { name, qty, finalPrice } = item;

  // finalPrice is GST-inclusive price per unit
  const basePrice = finalPrice / (1 + gstRate / 100);
  const gstAmountPerUnit = finalPrice - basePrice;

  const amount = basePrice * qty;               // base amount (excl. GST)
  const totalGst = gstAmountPerUnit * qty;      // total GST for this item
  const cgst = totalGst / 2;                    // CGST = half of GST
  const sgst = totalGst / 2;                    // SGST = half of GST
  const lineTotal = amount + totalGst;          // finalPrice * qty

  return {
    name,
    qty,
    unit: null,           // filled in by index.js from items.json
    rate: round(basePrice),
    amount: round(amount),
    cgst: round(cgst),
    sgst: round(sgst),
    lineTotal: round(lineTotal),
    gstRate,
  };
}

/**
 * Calculate totals across ALL items in the order.
 *
 * @param {Array} calculatedItems - Array of results from calculateItem()
 * @returns {Object}              - Grand totals: amount, cgst, sgst, total
 */
function calculateTotals(calculatedItems) {
  const totals = calculatedItems.reduce(
    (acc, item) => {
      acc.amount += item.amount;
      acc.cgst   += item.cgst;
      acc.sgst   += item.sgst;
      acc.total  += item.lineTotal;
      return acc;
    },
    { amount: 0, cgst: 0, sgst: 0, total: 0 }
  );

  return {
    amount: round(totals.amount),
    cgst:   round(totals.cgst),
    sgst:   round(totals.sgst),
    total:  round(totals.total),
  };
}

/** Round to 2 decimal places */
function round(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { calculateItem, calculateTotals };
