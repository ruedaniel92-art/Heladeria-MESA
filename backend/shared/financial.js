const crypto = require("crypto");

function normalizeFundAccount(rawAccount) {
  const normalizedAccount = String(rawAccount || "").trim().toLowerCase();
  if (normalizedAccount === "efectivo") {
    return "efectivo";
  }
  if (["banco", "bancos"].includes(normalizedAccount)) {
    return "banco";
  }
  return "";
}

function normalizeNonNegativeAmount(value) {
  const amount = Number(value);
  if (Number.isNaN(amount) || amount < 0) {
    return null;
  }
  return amount;
}

function calculatePurchaseInvoiceTotal(compra) {
  const items = Array.isArray(compra?.items) ? compra.items : [];
  return items.reduce((sum, item) => sum + Number(item.costo || 0) * Number(item.cantidad || 0), 0);
}

function calculateSaleInvoiceTotal(venta) {
  const items = Array.isArray(venta?.items) ? venta.items : [];
  return items.reduce((sum, item) => {
    const extrasTotal = Array.isArray(item.adicionales)
      ? item.adicionales.reduce((addonSum, adicional) => addonSum + Number(adicional.cantidad || 0) * Number(adicional.precio || 0), 0)
      : 0;
    return sum + Number(item.precio || 0) * Number(item.cantidad || 0) + extrasTotal;
  }, 0);
}

function normalizePaymentHistoryEntries(entries, totalAmount, fallbackEntry = null) {
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .map(entry => {
      const amount = normalizeNonNegativeAmount(entry?.amount);
      const date = entry?.date ? new Date(entry.date) : null;
      if (amount === null || amount <= 0 || !date || Number.isNaN(date.getTime())) {
        return null;
      }
      return {
        id: String(entry.id || crypto.randomUUID()),
        amount,
        date: date.toISOString(),
        paymentMethod: String(entry.paymentMethod || "").trim().toLowerCase() || null,
        paymentReference: String(entry.paymentReference || "").trim() || null,
        receiptNumber: String(entry.receiptNumber || "").trim() || null,
        note: String(entry.note || "").trim() || null,
        account: normalizeFundAccount(entry.account) || null,
        createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : new Date().toISOString()
      };
    })
    .filter(Boolean)
    .sort((left, right) => new Date(left.date || 0) - new Date(right.date || 0));

  if (!normalizedEntries.length && fallbackEntry) {
    const fallbackAmount = normalizeNonNegativeAmount(fallbackEntry.amount);
    const fallbackDate = fallbackEntry.date ? new Date(fallbackEntry.date) : null;
    if (fallbackAmount !== null && fallbackAmount > 0 && fallbackDate && !Number.isNaN(fallbackDate.getTime())) {
      normalizedEntries.push({
        id: crypto.randomUUID(),
        amount: Math.min(fallbackAmount, Math.max(Number(totalAmount || 0), 0)),
        date: fallbackDate.toISOString(),
        paymentMethod: String(fallbackEntry.paymentMethod || "").trim().toLowerCase() || null,
        paymentReference: String(fallbackEntry.paymentReference || "").trim() || null,
        receiptNumber: String(fallbackEntry.receiptNumber || "").trim() || null,
        note: String(fallbackEntry.note || "").trim() || null,
        account: normalizeFundAccount(fallbackEntry.account) || null,
        createdAt: fallbackDate.toISOString()
      });
    }
  }

  return normalizedEntries;
}

function summarizePaymentHistory(record, totalAmount) {
  const normalizedTotal = Math.max(Number(totalAmount || 0), 0);
  const paymentHistory = normalizePaymentHistoryEntries(record?.paymentHistory, normalizedTotal, record?.paidAt ? {
    amount: normalizedTotal,
    date: record.paidAt,
    paymentMethod: record.paymentMethod,
    paymentReference: record.paymentReference,
    account: record.account
  } : null);
  const totalPaid = paymentHistory.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  return {
    paymentHistory,
    totalPaid: Math.min(totalPaid, normalizedTotal),
    balanceDue: Math.max(normalizedTotal - totalPaid, 0)
  };
}

function getAccountFromPaymentMethod(method) {
  const normalizedMethod = String(method || "").trim().toLowerCase();
  if (normalizedMethod === "efectivo") {
    return "efectivo";
  }
  if (["transferencia", "tarjeta", "tarjeta-credito"].includes(normalizedMethod)) {
    return "banco";
  }
  return null;
}

function ensurePurchaseFinancialState(compra) {
  if (!compra) {
    return null;
  }
  const totalAmount = calculatePurchaseInvoiceTotal(compra);
  const paymentSummary = summarizePaymentHistory(compra, totalAmount);
  const lastPayment = paymentSummary.paymentHistory.length ? paymentSummary.paymentHistory[paymentSummary.paymentHistory.length - 1] : null;
  const originalPaymentType = String(compra.originalPaymentType || compra.paymentType || "").trim().toLowerCase() || "contado";
  const isCredit = originalPaymentType === "credito";

  compra.totalAmount = totalAmount;
  compra.paymentHistory = paymentSummary.paymentHistory;
  compra.totalPaid = paymentSummary.totalPaid;
  compra.balanceDue = isCredit ? paymentSummary.balanceDue : 0;
  compra.status = isCredit
    ? (compra.balanceDue <= 0 ? "pagada" : compra.totalPaid > 0 ? "abonada" : "pendiente")
    : "pagada";
  compra.paidAt = compra.status === "pagada" ? (lastPayment?.date || compra.paidAt || compra.fecha || null) : null;
  compra.paymentMethod = lastPayment?.paymentMethod || (compra.paidAt ? compra.paymentMethod : compra.paymentMethod || null);
  compra.paymentReference = lastPayment?.paymentReference || (compra.paidAt ? compra.paymentReference : null);
  if (String(compra.paymentType || "").trim().toLowerCase() !== originalPaymentType) {
    compra.paymentType = originalPaymentType;
  }
  return compra;
}

function ensureSaleFinancialState(venta) {
  if (!venta) {
    return null;
  }
  const totalAmount = calculateSaleInvoiceTotal(venta);
  const paymentSummary = summarizePaymentHistory(venta, totalAmount);
  const lastPayment = paymentSummary.paymentHistory.length ? paymentSummary.paymentHistory[paymentSummary.paymentHistory.length - 1] : null;
  const originalPaymentType = String(venta.originalPaymentType || venta.paymentType || "").trim().toLowerCase() || "contado";
  const isCredit = originalPaymentType === "credito";

  venta.totalAmount = totalAmount;
  venta.paymentHistory = paymentSummary.paymentHistory;
  venta.totalPaid = paymentSummary.totalPaid;
  venta.balanceDue = isCredit ? paymentSummary.balanceDue : 0;
  venta.status = isCredit
    ? (venta.balanceDue <= 0 ? "pagada" : venta.totalPaid > 0 ? "abonada" : "pendiente")
    : "pagada";
  venta.paidAt = venta.status === "pagada" ? (lastPayment?.date || venta.paidAt || venta.fecha || null) : null;
  venta.paymentMethod = lastPayment?.paymentMethod || (venta.paidAt ? venta.paymentMethod : venta.paymentMethod || null);
  venta.paymentReference = lastPayment?.paymentReference || (venta.paidAt ? venta.paymentReference : null);
  if (String(venta.paymentType || "").trim().toLowerCase() !== originalPaymentType) {
    venta.paymentType = originalPaymentType;
  }
  return venta;
}

function ensureExternalDebtFinancialState(debt) {
  if (!debt) {
    return null;
  }
  const originalAmount = Math.max(Number(debt.originalAmount || debt.totalAmount || debt.amount || 0), 0);
  const paymentHistory = normalizePaymentHistoryEntries(debt.paymentHistory, originalAmount);
  const totalPaid = paymentHistory.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const balanceDue = Math.max(originalAmount - totalPaid, 0);
  const type = String(debt.type || "").trim().toLowerCase() === "por-cobrar" ? "por-cobrar" : "por-pagar";
  const dueDate = debt.dueDate ? new Date(debt.dueDate) : null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const isOverdue = balanceDue > 0 && dueDate && !Number.isNaN(dueDate.getTime()) && dueDate < now;

  debt.type = type;
  debt.originalAmount = originalAmount;
  debt.paymentHistory = paymentHistory;
  debt.totalPaid = Math.min(totalPaid, originalAmount);
  debt.balanceDue = balanceDue;
  debt.status = balanceDue <= 0 ? "pagada" : totalPaid > 0 ? "abonada" : isOverdue ? "vencida" : "pendiente";
  debt.paidAt = balanceDue <= 0 && paymentHistory.length ? paymentHistory[paymentHistory.length - 1].date : null;
  return debt;
}

module.exports = {
  calculatePurchaseInvoiceTotal,
  calculateSaleInvoiceTotal,
  ensureExternalDebtFinancialState,
  ensurePurchaseFinancialState,
  ensureSaleFinancialState,
  getAccountFromPaymentMethod,
  normalizeFundAccount,
  normalizeNonNegativeAmount,
  normalizePaymentHistoryEntries,
  summarizePaymentHistory
};
