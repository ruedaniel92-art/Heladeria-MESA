const crypto = require("crypto");

function createPurchaseHandlers({
  app,
  asyncHandler,
  buildNextOutgoingReceiptNumber,
  calculatePurchaseInvoiceTotal,
  collections,
  commitBatch,
  createDocId,
  creditPaymentMethods,
  ensurePurchaseFinancialState,
  getAccountFromPaymentMethod,
  getCompras,
  getMateriaPrimaStockIncrement,
  getProductos,
  getSalsas,
  getSabores,
  getToppings,
  hydrateStore,
  isPurchasableProduct,
  syncPurchaseCardPendingPaymentOperations
}) {
  function registerPurchaseRoutes() {
    app.post("/compras", asyncHandler(async (req, res) => {
      await hydrateStore();
      const productos = getProductos();
      const compras = getCompras();
      const sabores = getSabores();
      const toppings = getToppings();
      const salsas = getSalsas();

      const { documento, proveedor, fecha, items, id, nombre, cantidad, costo, paymentType, paymentMethod, dueDate, cashOut, cashReceived, paymentReference } = req.body;
      const invoiceItems = Array.isArray(items)
        ? items
        : (id || nombre || cantidad !== undefined || costo !== undefined)
          ? [{ id, nombre, cantidad, costo }]
          : [];

      if (!documento || !proveedor || !fecha || !invoiceItems.length) {
        return res.status(400).json({ error: "Campos invÃ¡lidos. Documento, proveedor, fecha e items son obligatorios." });
      }

      const parsedDate = new Date(fecha);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: "La fecha de la compra no es vÃ¡lida." });
      }

      const normalizedPaymentType = String(paymentType || "").trim().toLowerCase();
      const normalizedPaymentMethod = String(paymentMethod || "").trim();

      if (!normalizedPaymentType || !normalizedPaymentMethod) {
        return res.status(400).json({ error: "Tipo de pago y mÃ©todo de pago son obligatorios." });
      }

      if (!["credito", "contado"].includes(normalizedPaymentType)) {
        return res.status(400).json({ error: "El tipo de pago debe ser credito o contado." });
      }

      if (normalizedPaymentType === "credito" && !dueDate) {
        return res.status(400).json({ error: "Fecha de vencimiento obligatoria para compras a crÃ©dito." });
      }

      const normalizedCashOut = cashOut === null || cashOut === undefined || cashOut === ""
        ? (cashReceived === null || cashReceived === undefined || cashReceived === "" ? null : Number(cashReceived))
        : Number(cashOut);
      const normalizedPaymentReference = String(paymentReference || "").trim();

      if (normalizedPaymentType === "contado" && (normalizedCashOut === null || Number.isNaN(normalizedCashOut) || normalizedCashOut <= 0)) {
        return res.status(400).json({ error: "Monto de salida invÃ¡lido para compras de contado." });
      }

      if (normalizedPaymentType === "contado" && ["transferencia", "tarjeta"].includes(normalizedPaymentMethod) && !normalizedPaymentReference) {
        return res.status(400).json({ error: "La referencia es obligatoria para tarjeta o transferencia." });
      }

      const parsedDueDate = dueDate ? new Date(dueDate) : null;
      if (dueDate && Number.isNaN(parsedDueDate.getTime())) {
        return res.status(400).json({ error: "La fecha de vencimiento no es vÃ¡lida." });
      }

      const normalizedCashReceived = cashReceived === null || cashReceived === undefined || cashReceived === ""
        ? null
        : Number(cashReceived);

      const validatedItems = invoiceItems.map(item => {
        const itemId = item.id !== undefined && item.id !== null ? String(item.id) : "";
        const itemNombre = String(item.nombre || "").trim();
        const itemCantidad = Number(item.cantidad);
        const itemCosto = Number(item.costo);
        const itemFlavorId = item.flavorId !== undefined && item.flavorId !== null ? String(item.flavorId).trim() : "";
        const itemToppingId = item.toppingId !== undefined && item.toppingId !== null ? String(item.toppingId).trim() : "";
        const itemSauceId = item.sauceId !== undefined && item.sauceId !== null ? String(item.sauceId).trim() : "";

        if ((!itemId && !itemNombre) || Number.isNaN(itemCantidad) || itemCantidad <= 0 || Number.isNaN(itemCosto) || itemCosto < 0) {
          return null;
        }

        const producto = itemId
          ? productos.find(p => String(p.id) === itemId)
          : productos.find(p => p.nombre.toLowerCase() === itemNombre.toLowerCase());

        if (!producto || !isPurchasableProduct(producto)) {
          return null;
        }

        const linkedFlavors = sabores.filter(flavor => String(flavor.materiaPrimaId || "") === String(producto.id));
        const linkedToppings = toppings.filter(topping => String(topping.materiaPrimaId || "") === String(producto.id));
        const linkedSauces = salsas.filter(sauce => String(sauce.materiaPrimaId || "") === String(producto.id));
        let selectedFlavor = null;
        let selectedTopping = null;
        let selectedSauce = null;
        if (linkedFlavors.length || linkedToppings.length || linkedSauces.length) {
          const selectedLinksCount = [itemFlavorId, itemToppingId, itemSauceId].filter(Boolean).length;
          if (selectedLinksCount !== 1) {
            return null;
          }

          if (itemFlavorId) {
            selectedFlavor = linkedFlavors.find(flavor => String(flavor.id) === itemFlavorId) || null;
            if (!selectedFlavor) {
              return null;
            }
          }

          if (itemToppingId) {
            selectedTopping = linkedToppings.find(topping => String(topping.id) === itemToppingId) || null;
            if (!selectedTopping) {
              return null;
            }
          }

          if (itemSauceId) {
            selectedSauce = linkedSauces.find(sauce => String(sauce.id) === itemSauceId) || null;
            if (!selectedSauce) {
              return null;
            }
          }

          if (!selectedFlavor && !selectedTopping && !selectedSauce) {
            return null;
          }
        }

        return {
          id: producto.id,
          nombre: producto.nombre,
          cantidad: itemCantidad,
          costo: itemCosto,
          flavorId: selectedFlavor ? selectedFlavor.id : null,
          flavorName: selectedFlavor ? selectedFlavor.nombre : null,
          toppingId: selectedTopping ? selectedTopping.id : null,
          toppingName: selectedTopping ? selectedTopping.nombre : null,
          sauceId: selectedSauce ? selectedSauce.id : null,
          sauceName: selectedSauce ? selectedSauce.nombre : null
        };
      });

      if (validatedItems.some(item => item === null)) {
        return res.status(400).json({ error: "Cada item debe tener producto vÃ¡lido, cantidad, precio y un sabor, topping o salsa/aderezo vÃ¡lido cuando la materia prima estÃ© vinculada." });
      }

      validatedItems.forEach(item => {
        const producto = productos.find(p => String(p.id) === String(item.id));
        if (producto) {
          producto.stock += getMateriaPrimaStockIncrement(producto, item.cantidad);
        }
      });

      const totalAmount = validatedItems.reduce((sum, item) => sum + Number(item.costo || 0) * Number(item.cantidad || 0), 0);
      const initialPaymentHistory = normalizedPaymentType === "contado"
        ? [{
          id: crypto.randomUUID(),
          amount: totalAmount,
          date: parsedDate.toISOString(),
          paymentMethod: normalizedPaymentMethod,
          paymentReference: normalizedPaymentReference || null,
          note: "Pago inicial de compra",
          account: getAccountFromPaymentMethod(normalizedPaymentMethod),
          createdAt: parsedDate.toISOString()
        }]
        : [];

      const compra = {
        id: createDocId(collections.compras),
        documento: String(documento).trim(),
        proveedor: String(proveedor).trim(),
        fecha: parsedDate.toISOString(),
        paymentType: normalizedPaymentType,
        originalPaymentType: normalizedPaymentType,
        paymentMethod: normalizedPaymentMethod,
        paymentReference: normalizedPaymentType === "contado" ? (normalizedPaymentReference || null) : null,
        dueDate: normalizedPaymentType === "credito" && parsedDueDate ? parsedDueDate.toISOString() : null,
        cashOut: normalizedPaymentType === "contado" ? normalizedCashOut : null,
        cashReceived: normalizedPaymentType === "contado" ? (normalizedCashReceived ?? normalizedCashOut) : null,
        cashChange: null,
        paidAt: normalizedPaymentType === "contado" ? parsedDate.toISOString() : null,
        paymentHistory: initialPaymentHistory,
        totalAmount,
        totalPaid: normalizedPaymentType === "contado" ? totalAmount : 0,
        balanceDue: normalizedPaymentType === "credito" ? totalAmount : 0,
        status: normalizedPaymentType === "credito" ? "pendiente" : "pagada",
        items: validatedItems
      };
      ensurePurchaseFinancialState(compra);
      compras.push(compra);
      const purchaseOperations = [
        ...validatedItems.map(item => {
          const producto = productos.find(p => String(p.id) === String(item.id));
          return producto ? { type: "set", collection: collections.productos, id: producto.id, data: producto } : null;
        }),
        { type: "set", collection: collections.compras, id: compra.id, data: compra }
      ];
      if (normalizedPaymentType === "contado") {
        initialPaymentHistory.forEach(paymentEntry => {
          syncPurchaseCardPendingPaymentOperations(compra, paymentEntry, purchaseOperations);
        });
      }
      await commitBatch([
        ...purchaseOperations
      ]);
      res.status(201).json({ message: "Compra registrada.", compra });
    }));

    app.get("/compras", asyncHandler(async (req, res) => {
      await hydrateStore([collections.compras], { forceRefresh: true });
      res.json(getCompras().map(compra => ensurePurchaseFinancialState(compra)));
    }));

    app.post("/compras/:id/pagar", asyncHandler(async (req, res) => {
      await hydrateStore();
      const compras = getCompras();
      const { id } = req.params;
      if (!id || typeof id !== "string" || !id.trim()) {
        return res.status(400).json({ error: "ID invÃ¡lido" });
      }
      const compra = compras.find(item => String(item.id) === String(id));

      if (!compra) {
        return res.status(404).json({ error: "Compra no encontrada." });
      }

      const currentPaymentType = String(compra.paymentType || "").toLowerCase();
      const originalPaymentType = String(compra.originalPaymentType || compra.paymentType || "").toLowerCase();
      const isCreditPurchase = currentPaymentType === "credito" || originalPaymentType === "credito";
      const isCashPurchase = currentPaymentType === "contado" || originalPaymentType === "contado";

      if (!isCreditPurchase && !isCashPurchase) {
        return res.status(400).json({ error: "Solo se pueden aplicar o editar pagos de compras registradas a crÃ©dito o contado." });
      }

      const paymentMethod = String(req.body?.paymentMethod || "").trim().toLowerCase();
      const paymentReference = String(req.body?.paymentReference || "").trim();
      const paidAt = req.body?.paidAt ? new Date(req.body.paidAt) : new Date();

      if (!paymentMethod) {
        return res.status(400).json({ error: "El mÃ©todo de pago es obligatorio." });
      }
      if (!creditPaymentMethods.includes(paymentMethod)) {
        return res.status(400).json({ error: "MÃ©todo de pago invÃ¡lido" });
      }

      if (Number.isNaN(paidAt.getTime())) {
        return res.status(400).json({ error: "La fecha de pago no es vÃ¡lida." });
      }

      if (["transferencia", "tarjeta"].includes(paymentMethod) && !paymentReference) {
        return res.status(400).json({ error: "La referencia es obligatoria para tarjeta o transferencia." });
      }

      ensurePurchaseFinancialState(compra);
      const totalAmount = Number(compra.totalAmount || calculatePurchaseInvoiceTotal(compra));
      const existingPaymentHistory = Array.isArray(compra.paymentHistory) ? compra.paymentHistory : [];
      const requestedPaymentEntryId = String(req.body?.paymentEntryId || "").trim();
      const canEditSingleSettledCreditPayment = isCreditPurchase && Number(compra.balanceDue || 0) <= 0.0001 && existingPaymentHistory.length === 1;
      const existingPayment = isCreditPurchase
        ? (requestedPaymentEntryId
          ? existingPaymentHistory.find(entry => String(entry.id) === requestedPaymentEntryId) || null
          : (canEditSingleSettledCreditPayment ? existingPaymentHistory[0] : null))
        : null;
      const paymentAmount = isCreditPurchase
        ? Number(req.body?.amount)
        : totalAmount;

      if (requestedPaymentEntryId && isCreditPurchase && !existingPayment) {
        return res.status(404).json({ error: "No se encontrÃ³ el abono seleccionado para esta compra." });
      }

      if (isCreditPurchase) {
        if (Number.isNaN(paymentAmount) || paymentAmount <= 0) {
          return res.status(400).json({ error: "El monto del abono debe ser mayor a cero." });
        }
        const maxAllowedAmount = existingPayment
          ? Number(compra.balanceDue || 0) + Number(existingPayment.amount || 0)
          : Number(compra.balanceDue || 0);
        if (paymentAmount - maxAllowedAmount > 0.0001) {
          return res.status(400).json({ error: "El abono no puede ser mayor que el saldo pendiente." });
        }
      }

      const receiptNumber = paymentMethod === "efectivo"
        ? (existingPayment?.receiptNumber || buildNextOutgoingReceiptNumber())
        : null;
      const resolvedPaymentReference = paymentMethod === "efectivo"
        ? receiptNumber
        : (paymentReference || null);

      compra.originalPaymentType = originalPaymentType || (isCashPurchase ? "contado" : "credito");
      compra.paymentType = isCashPurchase ? "contado" : "credito";
      compra.cashOut = totalAmount;
      compra.cashReceived = totalAmount;
      compra.cashChange = 0;
      const cashPurchasePaymentId = existingPaymentHistory[0]?.id || crypto.randomUUID();
      compra.paymentHistory = isCashPurchase
        ? [{
          id: cashPurchasePaymentId,
          amount: totalAmount,
          date: paidAt.toISOString(),
          paymentMethod,
          paymentReference: resolvedPaymentReference,
          receiptNumber,
          note: "Pago actualizado de compra de contado",
          account: getAccountFromPaymentMethod(paymentMethod),
          createdAt: new Date().toISOString()
        }]
        : existingPayment
          ? existingPaymentHistory.map(entry => String(entry.id) === String(existingPayment.id)
            ? {
              id: existingPayment.id || crypto.randomUUID(),
              amount: paymentAmount,
              date: paidAt.toISOString(),
              paymentMethod,
              paymentReference: resolvedPaymentReference,
              receiptNumber,
              note: existingPayment.note || "Abono a compra a crÃ©dito",
              account: getAccountFromPaymentMethod(paymentMethod),
              createdAt: existingPayment.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
            : entry)
          : [
            ...(Array.isArray(compra.paymentHistory) ? compra.paymentHistory : []),
            {
              id: crypto.randomUUID(),
              amount: paymentAmount,
              date: paidAt.toISOString(),
              paymentMethod,
              paymentReference: resolvedPaymentReference,
              receiptNumber,
              note: "Abono a compra a crÃ©dito",
              account: getAccountFromPaymentMethod(paymentMethod),
              createdAt: new Date().toISOString()
            }
          ];

      ensurePurchaseFinancialState(compra);
      const purchaseOperations = [
        { type: "set", collection: collections.compras, id: compra.id, data: compra }
      ];
      const syncedPaymentEntries = Array.isArray(compra.paymentHistory) ? compra.paymentHistory : [];
      syncedPaymentEntries.forEach(paymentEntry => {
        syncPurchaseCardPendingPaymentOperations(compra, paymentEntry, purchaseOperations);
      });

      await commitBatch(purchaseOperations);
      res.json({
        message: isCashPurchase
          ? "Pago actualizado correctamente."
          : existingPayment
            ? compra.balanceDue <= 0
              ? "Abono actualizado y cuenta saldada correctamente."
              : "Abono actualizado correctamente."
            : compra.balanceDue <= 0
              ? "Abono aplicado y cuenta saldada correctamente."
              : "Abono aplicado correctamente.",
        compra
      });
    }));
  }

  return { registerPurchaseRoutes };
}

module.exports = { createPurchaseHandlers };
