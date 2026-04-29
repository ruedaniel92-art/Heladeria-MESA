function createPaymentHandlers({
  app,
  asyncHandler,
  buildNextOutgoingReceiptNumber,
  collections,
  commitBatch,
  createDocId,
  deleteRecord,
  getPagos,
  getPaymentCategories,
  hydrateStore,
  outgoingPaymentMethods,
  saveRecord
}) {
  function registerPaymentRoutes() {
    app.get("/pagos-categorias", asyncHandler(async (req, res) => {
      await hydrateStore([collections.paymentCategories], { forceRefresh: true });
      const sortedCategories = getPaymentCategories().slice().sort((left, right) => String(left.nombre || "").localeCompare(String(right.nombre || ""), "es", { sensitivity: "base" }));
      res.json(sortedCategories);
    }));

    app.post("/pagos-categorias", asyncHandler(async (req, res) => {
      await hydrateStore([collections.paymentCategories, collections.pagos]);
      const pagos = getPagos();
      const paymentCategories = getPaymentCategories();
      const originalId = String(req.body?.originalId || "").trim();
      const nombre = String(req.body?.nombre || "").trim();
      const descripcion = String(req.body?.descripcion || "").trim();
      const normalizedName = nombre.toLowerCase();

      if (!nombre) {
        return res.status(400).json({ error: "El nombre de la clasificaciÃ³n es obligatorio." });
      }

      const duplicatedCategory = paymentCategories.find(item => String(item.nombre || "").trim().toLowerCase() === normalizedName && String(item.id) !== originalId);
      if (duplicatedCategory) {
        return res.status(409).json({ error: "Ya existe una clasificaciÃ³n con ese nombre." });
      }

      const now = new Date().toISOString();
      if (originalId) {
        const category = paymentCategories.find(item => String(item.id) === originalId);
        if (!category) {
          return res.status(404).json({ error: "ClasificaciÃ³n no encontrada." });
        }

        category.nombre = nombre;
        category.descripcion = descripcion || null;
        category.updatedAt = now;

        pagos.forEach(payment => {
          if (String(payment.categoriaId || "") === originalId) {
            payment.categoriaNombre = nombre;
            payment.updatedAt = now;
          }
        });

        await commitBatch([
          { type: "set", collection: collections.paymentCategories, id: category.id, data: category },
          ...pagos
            .filter(payment => String(payment.categoriaId || "") === originalId)
            .map(payment => ({ type: "set", collection: collections.pagos, id: payment.id, data: payment }))
        ]);

        return res.json({ message: "ClasificaciÃ³n actualizada correctamente.", category });
      }

      const category = {
        id: createDocId(collections.paymentCategories),
        nombre,
        descripcion: descripcion || null,
        createdAt: now,
        updatedAt: now
      };

      paymentCategories.push(category);
      await saveRecord(collections.paymentCategories, category);
      res.status(201).json({ message: "ClasificaciÃ³n creada correctamente.", category });
    }));

    app.delete("/pagos-categorias/:id", asyncHandler(async (req, res) => {
      await hydrateStore([collections.paymentCategories, collections.pagos], { forceRefresh: true });
      const pagos = getPagos();
      const paymentCategories = getPaymentCategories();
      const { id } = req.params;
      const categoryIndex = paymentCategories.findIndex(item => String(item.id) === String(id));
      if (categoryIndex < 0) {
        return res.status(404).json({ error: "ClasificaciÃ³n no encontrada." });
      }

      const categoryInUse = pagos.some(payment => String(payment.categoriaId || "") === String(id));
      if (categoryInUse) {
        return res.status(409).json({ error: "No se puede eliminar una clasificaciÃ³n que ya tiene pagos registrados." });
      }

      paymentCategories.splice(categoryIndex, 1);
      await deleteRecord(collections.paymentCategories, id);
      res.json({ message: "ClasificaciÃ³n eliminada correctamente." });
    }));

    app.get("/pagos", asyncHandler(async (req, res) => {
      await hydrateStore([collections.pagos], { forceRefresh: true });
      const sortedPayments = getPagos().slice().sort((left, right) => new Date(right.fecha || right.createdAt || 0) - new Date(left.fecha || left.createdAt || 0));
      res.json(sortedPayments);
    }));

    app.post("/pagos", asyncHandler(async (req, res) => {
      await hydrateStore([collections.pagos, collections.paymentCategories, collections.compras, collections.externalDebts]);
      const pagos = getPagos();
      const paymentCategories = getPaymentCategories();
      const descripcion = String(req.body?.descripcion || "").trim();
      const beneficiario = String(req.body?.beneficiario || "").trim();
      const categoriaId = String(req.body?.categoriaId || "").trim();
      const observacion = String(req.body?.observacion || "").trim();
      const referencia = String(req.body?.referencia || "").trim();
      const paymentMethod = String(req.body?.paymentMethod || "").trim().toLowerCase();
      const amount = Number(req.body?.monto);
      const paymentDate = req.body?.fecha ? new Date(req.body.fecha) : new Date();
      const category = paymentCategories.find(item => String(item.id) === categoriaId);

      if (!descripcion) {
        return res.status(400).json({ error: "La descripciÃ³n del pago es obligatoria." });
      }
      if (!category) {
        return res.status(400).json({ error: "Selecciona una clasificaciÃ³n vÃ¡lida para el pago." });
      }
      if (Number.isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "El monto del pago debe ser mayor a cero." });
      }
      if (Number.isNaN(paymentDate.getTime())) {
        return res.status(400).json({ error: "La fecha del pago no es vÃ¡lida." });
      }
      if (!outgoingPaymentMethods.includes(paymentMethod)) {
        return res.status(400).json({ error: "MÃ©todo de pago invÃ¡lido" });
      }
      if (paymentMethod === "transferencia" && !referencia) {
        return res.status(400).json({ error: "La referencia es obligatoria para pagos por transferencia." });
      }

      const receiptNumber = paymentMethod === "efectivo"
        ? buildNextOutgoingReceiptNumber()
        : null;
      const resolvedReference = paymentMethod === "efectivo"
        ? receiptNumber
        : (referencia || null);

      const now = new Date().toISOString();
      const payment = {
        id: createDocId(collections.pagos),
        descripcion,
        beneficiario: beneficiario || null,
        categoriaId: category.id,
        categoriaNombre: category.nombre,
        monto: amount,
        fecha: paymentDate.toISOString(),
        paymentMethod,
        referencia: resolvedReference,
        receiptNumber,
        receiptIssuedAt: receiptNumber ? now : null,
        observacion: observacion || null,
        status: paymentMethod === "tarjeta-credito" ? "pendiente-reembolso" : "registrado",
        reimbursementMethod: paymentMethod === "tarjeta-credito" ? "transferencia" : null,
        reimbursementReference: null,
        reimbursedAt: null,
        createdAt: now,
        updatedAt: now
      };

      pagos.push(payment);
      await saveRecord(collections.pagos, payment);
      res.status(201).json({
        message: paymentMethod === "tarjeta-credito"
          ? "Pago con tarjeta registrado como pendiente de reembolso."
          : paymentMethod === "efectivo"
            ? `Pago registrado correctamente. Recibo ${receiptNumber} generado.`
            : "Pago registrado correctamente.",
        payment
      });
    }));

    app.patch("/pagos/:id", asyncHandler(async (req, res) => {
      await hydrateStore([collections.pagos, collections.paymentCategories, collections.compras, collections.externalDebts]);
      const pagos = getPagos();
      const paymentCategories = getPaymentCategories();
      const { id } = req.params;
      if (!id || typeof id !== "string" || !id.trim()) {
        return res.status(400).json({ error: "ID invÃ¡lido" });
      }
      const payment = pagos.find(item => String(item.id) === String(id));
      if (!payment) {
        return res.status(404).json({ error: "Pago no encontrado." });
      }

      const descripcion = String(req.body?.descripcion || "").trim();
      const beneficiario = String(req.body?.beneficiario || "").trim();
      const categoriaId = String(req.body?.categoriaId || "").trim();
      const observacion = String(req.body?.observacion || "").trim();
      const referencia = String(req.body?.referencia || "").trim();
      const paymentMethod = String(req.body?.paymentMethod || "").trim().toLowerCase();
      const amount = Number(req.body?.monto);
      const paymentDate = req.body?.fecha ? new Date(req.body.fecha) : new Date(payment.fecha || payment.createdAt || Date.now());
      const category = paymentCategories.find(item => String(item.id) === categoriaId);

      if (!descripcion) {
        return res.status(400).json({ error: "La descripciÃ³n del pago es obligatoria." });
      }
      if (!category) {
        return res.status(400).json({ error: "Selecciona una clasificaciÃ³n vÃ¡lida para el pago." });
      }
      if (Number.isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "El monto del pago debe ser mayor a cero." });
      }
      if (Number.isNaN(paymentDate.getTime())) {
        return res.status(400).json({ error: "La fecha del pago no es vÃ¡lida." });
      }
      if (!outgoingPaymentMethods.includes(paymentMethod)) {
        return res.status(400).json({ error: "MÃ©todo de pago invÃ¡lido" });
      }
      if (paymentMethod === "transferencia" && !referencia) {
        return res.status(400).json({ error: "La referencia es obligatoria para pagos por transferencia." });
      }

      const receiptNumber = paymentMethod === "efectivo"
        ? (payment.receiptNumber || buildNextOutgoingReceiptNumber())
        : null;

      payment.descripcion = descripcion;
      payment.beneficiario = beneficiario || null;
      payment.categoriaId = category.id;
      payment.categoriaNombre = category.nombre;
      payment.monto = amount;
      payment.fecha = paymentDate.toISOString();
      payment.paymentMethod = paymentMethod;
      payment.referencia = paymentMethod === "efectivo" ? receiptNumber : (referencia || null);
      payment.receiptNumber = receiptNumber;
      payment.receiptIssuedAt = paymentMethod === "efectivo"
        ? (payment.receiptIssuedAt || new Date().toISOString())
        : null;
      payment.observacion = observacion || null;
      if (paymentMethod === "tarjeta-credito") {
        payment.status = payment.reimbursedAt ? "reembolsado" : "pendiente-reembolso";
        payment.reimbursementMethod = payment.reimbursedAt ? (payment.reimbursementMethod || "transferencia") : "transferencia";
      } else {
        payment.status = "registrado";
        payment.reimbursementMethod = null;
        payment.reimbursementReference = null;
        payment.reimbursedAt = null;
      }
      payment.updatedAt = new Date().toISOString();

      await saveRecord(collections.pagos, payment);
      res.json({
        message: paymentMethod === "efectivo"
          ? `Pago actualizado correctamente. Recibo ${receiptNumber} listo.`
          : "Pago actualizado correctamente.",
        payment
      });
    }));

    app.post("/pagos/:id/reembolsar", asyncHandler(async (req, res) => {
      await hydrateStore([collections.pagos]);
      const { id } = req.params;
      const payment = getPagos().find(item => String(item.id) === String(id));
      if (!payment) {
        return res.status(404).json({ error: "Pago no encontrado." });
      }
      if (String(payment.paymentMethod || "") !== "tarjeta-credito") {
        return res.status(400).json({ error: "Solo los pagos con tarjeta de crÃ©dito pueden marcarse como reembolsados por transferencia." });
      }
      if (payment.reimbursedAt) {
        return res.status(409).json({ error: "Este pago ya fue reembolsado." });
      }

      const reimbursementReference = String(req.body?.reimbursementReference || "").trim();
      const reimbursementDate = req.body?.reimbursedAt ? new Date(req.body.reimbursedAt) : new Date();

      if (!reimbursementReference) {
        return res.status(400).json({ error: "La referencia de la transferencia es obligatoria para cerrar el reembolso." });
      }
      if (Number.isNaN(reimbursementDate.getTime())) {
        return res.status(400).json({ error: "La fecha del reembolso no es vÃ¡lida." });
      }

      payment.reimbursementMethod = "transferencia";
      payment.reimbursementReference = reimbursementReference;
      payment.reimbursedAt = reimbursementDate.toISOString();
      payment.status = "reembolsado";
      payment.updatedAt = new Date().toISOString();

      await saveRecord(collections.pagos, payment);
      res.json({ message: "Reembolso por transferencia registrado correctamente.", payment });
    }));

    app.post("/pagos/reembolsar-lote", asyncHandler(async (req, res) => {
      await hydrateStore([collections.pagos]);
      const pagos = getPagos();
      const paymentIds = Array.isArray(req.body?.paymentIds)
        ? req.body.paymentIds.map(id => String(id || "").trim()).filter(Boolean)
        : [];
      const uniqueIds = Array.from(new Set(paymentIds));
      const reimbursementReference = String(req.body?.reimbursementReference || "").trim();
      const reimbursementDate = req.body?.reimbursedAt ? new Date(req.body.reimbursedAt) : new Date();

      if (!uniqueIds.length) {
        return res.status(400).json({ error: "Selecciona al menos un pago pendiente para registrar el reembolso." });
      }
      if (!reimbursementReference) {
        return res.status(400).json({ error: "La referencia de la transferencia es obligatoria para cerrar el reembolso." });
      }
      if (Number.isNaN(reimbursementDate.getTime())) {
        return res.status(400).json({ error: "La fecha del reembolso no es vÃ¡lida." });
      }

      const selectedPayments = uniqueIds.map(id => pagos.find(item => String(item.id) === id));
      if (selectedPayments.some(payment => !payment)) {
        return res.status(404).json({ error: "Uno o mÃ¡s pagos no fueron encontrados." });
      }
      if (selectedPayments.some(payment => String(payment.paymentMethod || "") !== "tarjeta-credito")) {
        return res.status(400).json({ error: "Solo los pagos con tarjeta de crÃ©dito pueden marcarse como reembolsados por transferencia." });
      }
      if (selectedPayments.some(payment => payment.reimbursedAt)) {
        return res.status(409).json({ error: "Uno o mÃ¡s pagos seleccionados ya fueron reembolsados." });
      }

      const updatedAt = new Date().toISOString();
      selectedPayments.forEach(payment => {
        payment.reimbursementMethod = "transferencia";
        payment.reimbursementReference = reimbursementReference;
        payment.reimbursedAt = reimbursementDate.toISOString();
        payment.status = "reembolsado";
        payment.updatedAt = updatedAt;
      });

      await commitBatch(selectedPayments.map(payment => ({
        type: "set",
        collection: collections.pagos,
        id: payment.id,
        data: payment
      })));

      res.json({
        message: uniqueIds.length === 1
          ? "Reembolso por transferencia registrado correctamente."
          : `Transferencia registrada correctamente para ${uniqueIds.length} pagos.`,
        payments: selectedPayments
      });
    }));
  }

  return { registerPaymentRoutes };
}

module.exports = { createPaymentHandlers };
