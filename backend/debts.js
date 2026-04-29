const crypto = require("crypto");

function createDebtHandlers({
  app,
  asyncHandler,
  buildNextOutgoingReceiptNumber,
  collections,
  createDocId,
  ensureExternalDebtFinancialState,
  getExternalDebts,
  hydrateStore,
  normalizeFundAccount,
  normalizeNonNegativeAmount,
  saveRecord
}) {
  function registerDebtRoutes() {
    app.get("/deudas-externas", asyncHandler(async (req, res) => {
      await hydrateStore([collections.externalDebts], { forceRefresh: true });
      const sortedDebts = getExternalDebts()
        .map(debt => ensureExternalDebtFinancialState(debt))
        .slice()
        .sort((left, right) => new Date(right.fecha || right.createdAt || 0) - new Date(left.fecha || left.createdAt || 0));
      res.json(sortedDebts);
    }));

    app.post("/deudas-externas", asyncHandler(async (req, res) => {
      await hydrateStore([collections.externalDebts]);
      const externalDebts = getExternalDebts();
      const tercero = String(req.body?.tercero || "").trim();
      const concepto = String(req.body?.concepto || "").trim();
      const tipo = String(req.body?.type || req.body?.tipo || "").trim().toLowerCase() === "por-cobrar" ? "por-cobrar" : "por-pagar";
      const fecha = req.body?.fecha ? new Date(req.body.fecha) : new Date();
      const dueDate = req.body?.dueDate ? new Date(req.body.dueDate) : null;
      const monto = normalizeNonNegativeAmount(req.body?.originalAmount ?? req.body?.monto ?? req.body?.amount);
      const observacion = String(req.body?.observacion || req.body?.note || "").trim();

      if (!tercero) {
        return res.status(400).json({ error: "El tercero es obligatorio." });
      }
      if (!concepto) {
        return res.status(400).json({ error: "El concepto es obligatorio." });
      }
      if (!fecha || Number.isNaN(fecha.getTime())) {
        return res.status(400).json({ error: "La fecha no es vÃ¡lida." });
      }
      if (dueDate && Number.isNaN(dueDate.getTime())) {
        return res.status(400).json({ error: "La fecha de vencimiento no es vÃ¡lida." });
      }
      if (monto === null || monto <= 0) {
        return res.status(400).json({ error: "El monto debe ser mayor a cero." });
      }

      const now = new Date().toISOString();
      const debt = ensureExternalDebtFinancialState({
        id: createDocId(collections.externalDebts),
        type: tipo,
        tercero,
        concepto,
        fecha: fecha.toISOString(),
        dueDate: dueDate ? dueDate.toISOString() : null,
        originalAmount: monto,
        paymentHistory: [],
        observacion: observacion || null,
        createdAt: now,
        updatedAt: now
      });

      externalDebts.push(debt);
      await saveRecord(collections.externalDebts, debt);
      res.status(201).json({ message: "Deuda externa registrada correctamente.", debt });
    }));

    app.patch("/deudas-externas/:id", asyncHandler(async (req, res) => {
      await hydrateStore([collections.externalDebts]);
      const { id } = req.params;
      const debt = getExternalDebts().find(item => String(item.id) === String(id));
      if (!debt) {
        return res.status(404).json({ error: "Deuda externa no encontrada." });
      }

      ensureExternalDebtFinancialState(debt);
      const tercero = String(req.body?.tercero || "").trim();
      const concepto = String(req.body?.concepto || "").trim();
      const tipo = String(req.body?.type || req.body?.tipo || "").trim().toLowerCase() === "por-cobrar" ? "por-cobrar" : "por-pagar";
      const fecha = req.body?.fecha ? new Date(req.body.fecha) : new Date(debt.fecha || Date.now());
      const dueDate = req.body?.dueDate ? new Date(req.body.dueDate) : null;
      const monto = normalizeNonNegativeAmount(req.body?.originalAmount ?? req.body?.monto ?? req.body?.amount);
      const observacion = String(req.body?.observacion || req.body?.note || "").trim();

      if (!tercero) {
        return res.status(400).json({ error: "El tercero es obligatorio." });
      }
      if (!concepto) {
        return res.status(400).json({ error: "El concepto es obligatorio." });
      }
      if (!fecha || Number.isNaN(fecha.getTime())) {
        return res.status(400).json({ error: "La fecha no es vÃ¡lida." });
      }
      if (dueDate && Number.isNaN(dueDate.getTime())) {
        return res.status(400).json({ error: "La fecha de vencimiento no es vÃ¡lida." });
      }
      if (monto === null || monto <= 0) {
        return res.status(400).json({ error: "El monto debe ser mayor a cero." });
      }
      if (monto + 0.0001 < Number(debt.totalPaid || 0)) {
        return res.status(400).json({ error: "El monto original no puede ser menor que lo ya abonado." });
      }

      debt.type = tipo;
      debt.tercero = tercero;
      debt.concepto = concepto;
      debt.fecha = fecha.toISOString();
      debt.dueDate = dueDate ? dueDate.toISOString() : null;
      debt.originalAmount = monto;
      debt.observacion = observacion || null;
      debt.updatedAt = new Date().toISOString();
      ensureExternalDebtFinancialState(debt);

      await saveRecord(collections.externalDebts, debt);
      res.json({ message: "Deuda externa actualizada correctamente.", debt });
    }));

    app.post("/deudas-externas/:id/abonos", asyncHandler(async (req, res) => {
      await hydrateStore([collections.externalDebts, collections.pagos, collections.compras]);
      const { id } = req.params;
      const debt = getExternalDebts().find(item => String(item.id) === String(id));
      if (!debt) {
        return res.status(404).json({ error: "Deuda externa no encontrada." });
      }

      ensureExternalDebtFinancialState(debt);
      const amount = normalizeNonNegativeAmount(req.body?.amount ?? req.body?.monto);
      const fecha = req.body?.date || req.body?.fecha ? new Date(req.body?.date || req.body?.fecha) : new Date();
      const account = normalizeFundAccount(req.body?.account);
      const paymentReference = String(req.body?.paymentReference || req.body?.referencia || "").trim();
      const note = String(req.body?.note || req.body?.observacion || "").trim();
      const requestedPaymentEntryId = String(req.body?.paymentEntryId || "").trim();
      const existingPaymentHistory = Array.isArray(debt.paymentHistory) ? debt.paymentHistory : [];
      const existingPayment = requestedPaymentEntryId
        ? existingPaymentHistory.find(entry => String(entry.id) === requestedPaymentEntryId) || null
        : null;

      if (amount === null || amount <= 0) {
        return res.status(400).json({ error: "El monto del abono debe ser mayor a cero." });
      }
      if (Number.isNaN(fecha.getTime())) {
        return res.status(400).json({ error: "La fecha del abono no es vÃ¡lida." });
      }
      if (!account) {
        return res.status(400).json({ error: "Selecciona si el abono se hizo por efectivo o bancos." });
      }
      if (requestedPaymentEntryId && !existingPayment) {
        return res.status(404).json({ error: "No se encontrÃ³ el abono seleccionado para esta deuda externa." });
      }
      const maxAllowedAmount = existingPayment
        ? Number(debt.balanceDue || 0) + Number(existingPayment.amount || 0)
        : Number(debt.balanceDue || 0);
      if (amount - maxAllowedAmount > 0.0001) {
        return res.status(400).json({ error: "El abono no puede ser mayor que el saldo pendiente." });
      }

      const receiptNumber = account === "efectivo"
        ? (existingPayment?.receiptNumber || buildNextOutgoingReceiptNumber())
        : null;
      const resolvedPaymentReference = account === "efectivo"
        ? receiptNumber
        : (paymentReference || null);

      debt.paymentHistory = existingPayment
        ? existingPaymentHistory.map(entry => String(entry.id) === String(existingPayment.id)
          ? {
            id: existingPayment.id || crypto.randomUUID(),
            amount,
            date: fecha.toISOString(),
            account,
            paymentMethod: account === "efectivo" ? "efectivo" : "transferencia",
            paymentReference: resolvedPaymentReference,
            receiptNumber,
            note: note || null,
            createdAt: existingPayment.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
          : entry)
        : [
          ...existingPaymentHistory,
          {
            id: crypto.randomUUID(),
            amount,
            date: fecha.toISOString(),
            account,
            paymentMethod: account === "efectivo" ? "efectivo" : "transferencia",
            paymentReference: resolvedPaymentReference,
            receiptNumber,
            note: note || null,
            createdAt: new Date().toISOString()
          }
        ];
      debt.updatedAt = new Date().toISOString();
      ensureExternalDebtFinancialState(debt);

      await saveRecord(collections.externalDebts, debt);
      res.json({
        message: existingPayment
          ? debt.balanceDue <= 0
            ? "Abono actualizado y deuda saldada correctamente."
            : "Abono actualizado correctamente."
          : debt.balanceDue <= 0
            ? "Abono aplicado y deuda saldada correctamente."
            : "Abono aplicado correctamente.",
        debt
      });
    }));
  }

  return { registerDebtRoutes };
}

module.exports = { createDebtHandlers };
