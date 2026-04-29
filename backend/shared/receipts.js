function buildNextDocumentNumber(records, prefix) {
  const maxSequence = records.reduce((maxValue, record) => {
    const documentValue = String(record.documento || record.document || '').trim().toUpperCase();
    if (!documentValue.startsWith(`${prefix}-`)) {
      return maxValue;
    }
    const sequence = Number(documentValue.slice(prefix.length + 1));
    return Number.isNaN(sequence) ? maxValue : Math.max(maxValue, sequence);
  }, 0);

  return `${prefix}-${String(maxSequence + 1).padStart(4, "0")}`;
}

function extractReceiptSequence(value, prefix = 'REC-') {
  const normalizedValue = String(value || '').trim().toUpperCase();
  if (!normalizedValue.startsWith(prefix)) {
    return 0;
  }
  const numericPart = normalizedValue.slice(prefix.length).replace(/[^0-9]/g, '');
  const sequence = Number(numericPart);
  return Number.isInteger(sequence) && sequence > 0 ? sequence : 0;
}

function getHistoryReceiptSequence(historyEntries, prefix = 'REC-') {
  return (Array.isArray(historyEntries) ? historyEntries : []).reduce((maxValue, entry) => {
    const entrySequence = Math.max(
      extractReceiptSequence(entry?.receiptNumber, prefix),
      extractReceiptSequence(entry?.paymentReference, prefix)
    );
    return Math.max(maxValue, entrySequence);
  }, 0);
}

function buildNextOutgoingReceiptNumber({ pagos, compras, externalDebts }, prefix = 'REC-') {
  const paymentMax = (Array.isArray(pagos) ? pagos : []).reduce((maxValue, payment) => {
    const paymentSequence = Math.max(
      extractReceiptSequence(payment?.receiptNumber, prefix),
      extractReceiptSequence(payment?.referencia, prefix)
    );
    return Math.max(maxValue, paymentSequence);
  }, 0);
  const purchaseMax = (Array.isArray(compras) ? compras : []).reduce((maxValue, compra) => Math.max(maxValue, getHistoryReceiptSequence(compra?.paymentHistory, prefix)), 0);
  const externalDebtMax = (Array.isArray(externalDebts) ? externalDebts : []).reduce((maxValue, debt) => Math.max(maxValue, getHistoryReceiptSequence(debt?.paymentHistory, prefix)), 0);
  const highestSequence = Math.max(paymentMax, purchaseMax, externalDebtMax);
  return `${prefix}${String(highestSequence + 1).padStart(6, '0')}`;
}

module.exports = {
  buildNextDocumentNumber,
  buildNextOutgoingReceiptNumber,
  extractReceiptSequence,
  getHistoryReceiptSequence
};
