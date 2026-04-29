const crypto = require("crypto");

function createSalesHandlers({
  app,
  asyncHandler,
  buildNextDocumentNumber,
  buildNextOutgoingReceiptNumber,
  calculateSaleInvoiceTotal,
  collections,
  commitBatch,
  createDocId,
  creditPaymentMethods,
  ensureConsumableControlSnapshot,
  ensureSaleFinancialState,
  getAccountFromPaymentMethod,
  getActiveBucketForFlavor,
  getActiveSauceControlForSauce,
  getActiveToppingControlForTopping,
  getBaldesControl,
  getControlCostValues,
  getProductInventoryMode,
  getProductos,
  getSalsas,
  getSauceAvailableStock,
  getSauceControls,
  getSabores,
  getToppingAvailableStock,
  getToppingControls,
  getToppings,
  getVentas,
  hydrateStore,
  normalizeFlavorName,
  saveRecord
}) {
  function registerSalesRoutes() {
    app.post("/ventas", asyncHandler(async (req, res) => {
      await hydrateStore();
      const productos = getProductos();
      const ventas = getVentas();
      const sabores = getSabores();
      const toppings = getToppings();
      const salsas = getSalsas();
      const baldesControl = getBaldesControl();
      const toppingControls = getToppingControls();
      const sauceControls = getSauceControls();

      const { documento, cliente, fecha, items, id, nombre, cantidad, precio, paymentType, paymentMethod, dueDate, cashReceived, cashChange, paymentReference } = req.body;
      const invoiceItems = Array.isArray(items)
        ? items
        : (id || nombre || cantidad !== undefined || precio !== undefined)
          ? [{ id, nombre, cantidad, precio }]
          : [];

      if (!cliente || !fecha || !invoiceItems.length) {
        return res.status(400).json({ error: "Campos inválidos. Cliente, fecha e items son obligatorios." });
      }

      const normalizedDocument = String(documento || "").trim() || buildNextDocumentNumber(ventas, "FV");

      const parsedDate = new Date(fecha);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: "La fecha de la venta no es válida." });
      }

      const normalizedPaymentType = String(paymentType || "").trim().toLowerCase();
      const normalizedPaymentMethod = String(paymentMethod || "").trim();
      const normalizedPaymentReference = String(paymentReference || "").trim();

      if (!normalizedPaymentType || !normalizedPaymentMethod) {
        return res.status(400).json({ error: "Tipo de pago y método de pago son obligatorios." });
      }

      if (!["credito", "contado"].includes(normalizedPaymentType)) {
        return res.status(400).json({ error: "El tipo de pago debe ser credito o contado." });
      }

      if (normalizedPaymentType === "credito" && !dueDate) {
        return res.status(400).json({ error: "Fecha de vencimiento obligatoria para ventas a crédito." });
      }

      if (normalizedPaymentType === "contado" && ["transferencia", "tarjeta"].includes(normalizedPaymentMethod) && !normalizedPaymentReference) {
        return res.status(400).json({ error: "La referencia es obligatoria para tarjeta o transferencia." });
      }

      const parsedDueDate = dueDate ? new Date(dueDate) : null;
      if (dueDate && Number.isNaN(parsedDueDate.getTime())) {
        return res.status(400).json({ error: "La fecha de vencimiento no es válida." });
      }

      const normalizedCashReceived = cashReceived === null || cashReceived === undefined || cashReceived === "" ? null : Number(cashReceived);
      const normalizedCashChange = cashChange === null || cashChange === undefined || cashChange === "" ? null : Number(cashChange);

      if (normalizedPaymentType === "contado" && (normalizedCashReceived === null || Number.isNaN(normalizedCashReceived) || normalizedCashReceived < 0)) {
        return res.status(400).json({ error: "Monto recibido inválido para ventas de contado." });
      }

      const validatedItems = invoiceItems.map(item => {
        const itemId = item.id !== undefined && item.id !== null ? String(item.id) : "";
        const itemNombre = String(item.nombre || "").trim();
        const itemCantidad = Number(item.cantidad);
        const itemPrecio = Number(item.precio);
        const itemSabores = Array.isArray(item.sabores) ? item.sabores : [];
        const itemAdicionales = Array.isArray(item.adicionales) ? item.adicionales : [];
        const itemComponentes = Array.isArray(item.componentes) ? item.componentes : [];

        if ((!itemId && !itemNombre) || Number.isNaN(itemCantidad) || itemCantidad <= 0 || Number.isNaN(itemPrecio) || itemPrecio < 0) {
          return null;
        }

        const producto = itemId
          ? productos.find(p => String(p.id) === itemId)
          : productos.find(p => p.nombre.toLowerCase() === itemNombre.toLowerCase());

        if (!producto) {
          return null;
        }

        const inventoryMode = getProductInventoryMode(producto);
        const requiresFlavorControl = inventoryMode === "helado-sabores" || inventoryMode === "mixto";
        const requiresRecipeControl = inventoryMode === "receta" || inventoryMode === "mixto";
        const requiresFreeComponents = inventoryMode === "personalizado";
        const pelotasPorUnidad = requiresFlavorControl ? Number(producto.pelotasPorUnidad || 0) : 0;
        const totalPelotasRequeridas = requiresFlavorControl ? itemCantidad * pelotasPorUnidad : 0;

        const normalizedSabores = itemSabores.map(sabor => {
          const saborId = sabor?.id !== undefined && sabor?.id !== null ? String(sabor.id) : "";
          const saborNombre = normalizeFlavorName(sabor?.nombre);
          const porciones = Number(sabor?.porciones);
          const registeredFlavor = saborId
            ? sabores.find(entry => String(entry.id) === saborId)
            : sabores.find(entry => entry.nombre.toLowerCase() === saborNombre.toLowerCase());

          if (!registeredFlavor || !Number.isInteger(porciones) || porciones <= 0) {
            return null;
          }

          return {
            id: registeredFlavor.id,
            nombre: registeredFlavor.nombre,
            porciones,
            materiaPrimaId: registeredFlavor.materiaPrimaId,
            materiaPrimaNombre: registeredFlavor.materiaPrimaNombre
          };
        }).filter(Boolean);

        const groupedSabores = normalizedSabores.reduce((accumulator, flavor) => {
          const existingFlavor = accumulator.find(entry => String(entry.id) === String(flavor.id));
          if (existingFlavor) {
            existingFlavor.porciones += flavor.porciones;
          } else {
            accumulator.push({ ...flavor });
          }
          return accumulator;
        }, []);

        if (requiresFlavorControl && !groupedSabores.length) {
          return null;
        }

        if (requiresFlavorControl && (!Number.isInteger(pelotasPorUnidad) || pelotasPorUnidad <= 0)) {
          return null;
        }

        const totalPorcionesAsignadas = groupedSabores.reduce((sum, flavor) => sum + Number(flavor.porciones || 0), 0);
        if (requiresFlavorControl && totalPorcionesAsignadas !== totalPelotasRequeridas) {
          return null;
        }

        if (inventoryMode === "directo" && Number(producto.stock || 0) < itemCantidad) {
          return null;
        }

        const normalizedComponentes = itemComponentes.map(component => {
          const componentId = component?.id !== undefined && component?.id !== null ? String(component.id) : "";
          const componentName = String(component?.nombre || component?.name || "").trim();
          const componentProduct = componentId
            ? productos.find(entry => String(entry.id) === componentId)
            : productos.find(entry => String(entry.nombre || "").trim().toLowerCase() === componentName.toLowerCase());
          const componentMode = getProductInventoryMode(componentProduct);
          const cantidad = Number(component?.cantidad);
          const precio = component?.precio === undefined || component?.precio === null || component?.precio === "" ? 0 : Number(component.precio);

          if (!componentProduct || !["materia-prima", "directo"].includes(componentMode) || Number.isNaN(cantidad) || cantidad <= 0 || Number.isNaN(precio) || precio < 0) {
            return null;
          }

          const cantidadTotal = cantidad * itemCantidad;
          if (Number(componentProduct.stock || 0) < cantidadTotal) {
            return null;
          }

          return {
            id: componentProduct.id,
            nombre: componentProduct.nombre,
            tipo: componentMode,
            cantidad,
            cantidadTotal,
            precio,
            stockDisponible: Number(componentProduct.stock || 0)
          };
        });

        if (requiresFreeComponents && (!normalizedComponentes.length || normalizedComponentes.some(component => component === null))) {
          return null;
        }

        if (!requiresFreeComponents && normalizedComponentes.some(component => component === null)) {
          return null;
        }

        let normalizedIngredientes = [];
        if (requiresRecipeControl) {
          const ingredientesProducto = Array.isArray(producto.ingredientes) ? producto.ingredientes : [];
          if (!ingredientesProducto.length) {
            return null;
          }
          normalizedIngredientes = ingredientesProducto.map(ingredient => {
            const materiaPrima = ingredient.id
              ? productos.find(entry => String(entry.id) === String(ingredient.id))
              : productos.find(entry => entry.nombre.toLowerCase() === String(ingredient.nombre || "").trim().toLowerCase());
            const consumoUnitario = Number(ingredient.cantidad || 0);
            if (!materiaPrima || Number.isNaN(consumoUnitario) || consumoUnitario <= 0) {
              return null;
            }
            return {
              id: materiaPrima.id,
              nombre: materiaPrima.nombre,
              cantidad: consumoUnitario * itemCantidad
            };
          });

          if (normalizedIngredientes.some(ingredient => ingredient === null)) {
            return null;
          }

          const insufficientIngredient = normalizedIngredientes.find(ingredient => {
            const materiaPrima = productos.find(entry => String(entry.id) === String(ingredient.id));
            return !materiaPrima || Number(materiaPrima.stock || 0) < Number(ingredient.cantidad || 0);
          });
          if (insufficientIngredient) {
            return null;
          }
        }

        if (requiresFlavorControl) {
          const missingActiveBucket = groupedSabores.find(flavor => !getActiveBucketForFlavor(flavor.id));
          if (missingActiveBucket) {
            return null;
          }

          const insufficientFlavorStock = groupedSabores.find(flavor => {
            const materiaPrimaFlavor = productos.find(entry => String(entry.id) === String(flavor.materiaPrimaId));
            return !materiaPrimaFlavor || Number(materiaPrimaFlavor.stock || 0) < Number(flavor.porciones || 0);
          });

          if (insufficientFlavorStock) {
            return null;
          }
        }

        const normalizedAdicionales = itemAdicionales.map(adicional => {
          const tipoRaw = String(adicional?.tipo || "").trim().toLowerCase();
          const tipo = tipoRaw === "topping-incluido" ? "topping-incluido" : tipoRaw === "topping" ? "topping" : tipoRaw === "extra" ? "extra" : "";
          const adicionalId = adicional?.id !== undefined && adicional?.id !== null ? String(adicional.id) : "";
          const toppingRegistrado = tipo === "topping" || tipo === "topping-incluido" || tipo === "extra"
            ? (adicionalId
              ? toppings.find(entry => String(entry.id) === adicionalId)
              : toppings.find(entry => entry.nombre.toLowerCase() === String(adicional?.nombre || "").trim().toLowerCase()))
            : null;
          const sauceRegistrada = tipo === "extra"
            ? (adicionalId
              ? salsas.find(entry => String(entry.id) === adicionalId)
              : salsas.find(entry => entry.nombre.toLowerCase() === String(adicional?.nombre || "").trim().toLowerCase()))
            : null;
          const nombre = toppingRegistrado ? toppingRegistrado.nombre : sauceRegistrada ? sauceRegistrada.nombre : String(adicional?.nombre || "").trim();
          const cantidad = Number(adicional?.cantidad);
          const precio = tipo === "topping-incluido" ? 0 : Number(adicional?.precio);

          if (!tipo || !nombre || !Number.isInteger(cantidad) || cantidad <= 0 || Number.isNaN(precio) || precio < 0) {
            return null;
          }

          if ((tipo === "topping" || tipo === "topping-incluido") && !toppingRegistrado) {
            return null;
          }

          if (toppingRegistrado) {
            const activeToppingControl = getActiveToppingControlForTopping(toppingRegistrado.id);
            if (!activeToppingControl) {
              return null;
            }

            if (getToppingAvailableStock(toppingRegistrado.id) < cantidad) {
              return null;
            }

            ensureConsumableControlSnapshot("topping", activeToppingControl);
            const provisionalCosts = getControlCostValues(activeToppingControl, false);
            return {
              id: toppingRegistrado.id,
              tipo,
              nombre,
              cantidad,
              precio,
              materiaPrimaId: toppingRegistrado.materiaPrimaId,
              materiaPrimaNombre: toppingRegistrado.materiaPrimaNombre,
              toppingControlId: activeToppingControl.id,
              sauceControlId: null,
              addonCategory: "topping",
              costoUnitarioProvisional: provisionalCosts.unitCost,
              costoTotalProvisional: provisionalCosts.totalForQuantity(cantidad),
              costoUnitarioFinal: null,
              costoTotalFinal: null,
              costoEstado: "provisional"
            };
          }

          if (sauceRegistrada) {
            const activeSauceControl = getActiveSauceControlForSauce(sauceRegistrada.id);
            if (!activeSauceControl) {
              return null;
            }

            if (getSauceAvailableStock(sauceRegistrada.id) < cantidad) {
              return null;
            }

            ensureConsumableControlSnapshot("sauce", activeSauceControl);
            const provisionalCosts = getControlCostValues(activeSauceControl, false);
            return {
              id: sauceRegistrada.id,
              tipo,
              nombre,
              cantidad,
              precio,
              materiaPrimaId: sauceRegistrada.materiaPrimaId,
              materiaPrimaNombre: sauceRegistrada.materiaPrimaNombre,
              toppingControlId: null,
              sauceControlId: activeSauceControl.id,
              addonCategory: "sauce",
              costoUnitarioProvisional: provisionalCosts.unitCost,
              costoTotalProvisional: provisionalCosts.totalForQuantity(cantidad),
              costoUnitarioFinal: null,
              costoTotalFinal: null,
              costoEstado: "provisional"
            };
          }

          const materiaPrimaExtraId = adicional?.materiaPrimaId !== undefined && adicional?.materiaPrimaId !== null ? String(adicional.materiaPrimaId) : "";
          const materiaPrimaExtra = materiaPrimaExtraId
            ? productos.find(entry => String(entry.id) === materiaPrimaExtraId)
            : null;
          if (materiaPrimaExtra) {
            const materiaPrimaMode = getProductInventoryMode(materiaPrimaExtra);
            if (materiaPrimaMode !== "materia-prima" || Number(materiaPrimaExtra.stock || 0) < cantidad) {
              return null;
            }
          }

          return {
            id: null,
            tipo,
            nombre,
            cantidad,
            precio,
            materiaPrimaId: materiaPrimaExtra ? materiaPrimaExtra.id : null,
            materiaPrimaNombre: materiaPrimaExtra ? materiaPrimaExtra.nombre : null,
            toppingControlId: null,
            sauceControlId: null,
            addonCategory: materiaPrimaExtra ? "materia-prima" : null,
            costoUnitarioProvisional: null,
            costoTotalProvisional: null,
            costoUnitarioFinal: null,
            costoTotalFinal: null,
            costoEstado: "pendiente"
          };
        });

        if (normalizedAdicionales.some(adicional => adicional === null)) {
          return null;
        }

        return {
          id: producto.id,
          nombre: producto.nombre,
          modoControl: inventoryMode,
          cantidad: itemCantidad,
          precio: itemPrecio,
          componentes: requiresFreeComponents ? normalizedComponentes : [],
          ingredientes: normalizedIngredientes,
          pelotasPorUnidad: requiresFlavorControl ? pelotasPorUnidad : null,
          adicionales: normalizedAdicionales,
          sabores: groupedSabores.map(flavor => {
            const activeBucket = getActiveBucketForFlavor(flavor.id);
            const bucketControl = activeBucket ? ensureConsumableControlSnapshot("bucket", activeBucket) : null;
            const provisionalCosts = getControlCostValues(bucketControl, false);
            return {
              ...flavor,
              baldeControlId: activeBucket ? activeBucket.id : null,
              costoUnitarioProvisional: activeBucket ? provisionalCosts.unitCost : null,
              costoTotalProvisional: activeBucket ? provisionalCosts.totalForQuantity(flavor.porciones) : null,
              costoUnitarioFinal: null,
              costoTotalFinal: null,
              costoEstado: activeBucket ? "provisional" : "pendiente"
            };
          })
        };
      });

      if (validatedItems.some(item => item === null)) {
        return res.status(400).json({ error: "Cada item debe tener producto válido, stock suficiente, cantidad y precio." });
      }

      const componentConsumptionById = new Map();
      validatedItems.forEach(item => {
        (item.componentes || []).forEach(component => {
          const key = String(component.id || "");
          componentConsumptionById.set(key, (componentConsumptionById.get(key) || 0) + Number(component.cantidadTotal || 0));
        });
      });
      const invalidComponentStock = Array.from(componentConsumptionById.entries()).some(([componentId, totalQuantity]) => {
        const componentProduct = productos.find(entry => String(entry.id) === componentId);
        return !componentProduct || Number(componentProduct.stock || 0) < totalQuantity;
      });
      if (invalidComponentStock) {
        return res.status(400).json({ error: "Uno o más componentes personalizados no tienen stock suficiente." });
      }

      const totalFactura = validatedItems.reduce((sum, item) => {
        const addonsTotal = Array.isArray(item.adicionales)
          ? item.adicionales.reduce((addonsSum, adicional) => addonsSum + Number(adicional.cantidad || 0) * Number(adicional.precio || 0), 0)
          : 0;
        const componentsTotal = Array.isArray(item.componentes)
          ? item.componentes.reduce((componentSum, component) => componentSum + Number(component.cantidad || 0) * Number(component.precio || 0) * Number(item.cantidad || 0), 0)
          : 0;
        return sum + item.cantidad * item.precio + addonsTotal + componentsTotal;
      }, 0);
      if (normalizedPaymentType === "contado" && normalizedCashReceived < totalFactura) {
        return res.status(400).json({ error: "El monto recibido debe cubrir el total de la factura." });
      }

      validatedItems.forEach(item => {
        const producto = productos.find(p => String(p.id) === String(item.id));
        const inventoryMode = item.modoControl || getProductInventoryMode(producto);
        if (producto && inventoryMode === "directo") {
          producto.stock -= item.cantidad;
        }

        if (inventoryMode === "receta" || inventoryMode === "mixto") {
          (item.ingredientes || []).forEach(ingredient => {
            const materiaPrima = productos.find(entry => String(entry.id) === String(ingredient.id));
            if (materiaPrima) {
              materiaPrima.stock -= Number(ingredient.cantidad || 0);
            }
          });
        }

        if (inventoryMode === "personalizado") {
          (item.componentes || []).forEach(component => {
            const componentProduct = productos.find(entry => String(entry.id) === String(component.id));
            if (componentProduct) {
              componentProduct.stock -= Number(component.cantidadTotal || 0);
            }
          });
        }

        if (inventoryMode === "helado-sabores" || inventoryMode === "mixto") {
          item.sabores.forEach(flavor => {
            const materiaPrimaFlavor = productos.find(entry => String(entry.id) === String(flavor.materiaPrimaId));
            if (materiaPrimaFlavor) {
              materiaPrimaFlavor.stock -= Number(flavor.porciones || 0);
            }
            const activeBucket = flavor.baldeControlId
              ? baldesControl.find(bucket => String(bucket.id) === String(flavor.baldeControlId) && bucket.estado === "abierto")
              : getActiveBucketForFlavor(flavor.id);
            if (activeBucket) {
              activeBucket.porcionesVendidas += Number(flavor.porciones || 0);
            }
          });

          const bucketIds = [...new Set(item.sabores.map(flavor => String(flavor.baldeControlId || "")).filter(Boolean))];
          bucketIds.forEach(bucketId => {
            const activeBucket = baldesControl.find(bucket => String(bucket.id) === bucketId && bucket.estado === "abierto");
            if (activeBucket) {
              activeBucket.ventasAsociadas += 1;
            }
          });
        }

        (item.adicionales || []).forEach(adicional => {
          if (adicional.materiaPrimaId) {
            const materiaPrimaAdicional = productos.find(entry => String(entry.id) === String(adicional.materiaPrimaId));
            if (materiaPrimaAdicional) {
              materiaPrimaAdicional.stock -= Number(adicional.cantidad || 0);
            }
          }

          const activeToppingControl = adicional.toppingControlId
            ? toppingControls.find(control => String(control.id) === String(adicional.toppingControlId) && control.estado === "abierto")
            : (adicional.id ? getActiveToppingControlForTopping(adicional.id) : null);
          if (activeToppingControl) {
            activeToppingControl.porcionesVendidas += Number(adicional.cantidad || 0);
          }

          const activeSauceControl = adicional.sauceControlId
            ? sauceControls.find(control => String(control.id) === String(adicional.sauceControlId) && control.estado === "abierto")
            : (adicional.id ? getActiveSauceControlForSauce(adicional.id) : null);
          if (activeSauceControl) {
            activeSauceControl.porcionesVendidas += Number(adicional.cantidad || 0);
          }
        });

        const toppingControlIds = [...new Set((item.adicionales || []).map(adicional => String(adicional.toppingControlId || "")).filter(Boolean))];
        toppingControlIds.forEach(controlId => {
          const activeToppingControl = toppingControls.find(control => String(control.id) === controlId && control.estado === "abierto");
          if (activeToppingControl) {
            activeToppingControl.ventasAsociadas += 1;
          }
        });

        const sauceControlIds = [...new Set((item.adicionales || []).map(adicional => String(adicional.sauceControlId || "")).filter(Boolean))];
        sauceControlIds.forEach(controlId => {
          const activeSauceControl = sauceControls.find(control => String(control.id) === controlId && control.estado === "abierto");
          if (activeSauceControl) {
            activeSauceControl.ventasAsociadas += 1;
          }
        });
      });

      const venta = {
        id: createDocId(collections.ventas),
        documento: normalizedDocument,
        cliente: String(cliente).trim(),
        fecha: parsedDate.toISOString(),
        paymentType: normalizedPaymentType,
        originalPaymentType: normalizedPaymentType,
        paymentMethod: normalizedPaymentMethod,
        paymentReference: normalizedPaymentType === "contado" ? (normalizedPaymentReference || null) : null,
        dueDate: normalizedPaymentType === "credito" && parsedDueDate ? parsedDueDate.toISOString() : null,
        cashReceived: normalizedPaymentType === "contado" ? normalizedCashReceived : null,
        cashChange: normalizedPaymentType === "contado" ? (normalizedCashChange ?? (normalizedCashReceived - totalFactura)) : null,
        paidAt: normalizedPaymentType === "contado" ? parsedDate.toISOString() : null,
        paymentHistory: normalizedPaymentType === "contado"
          ? [{
            id: crypto.randomUUID(),
            amount: totalFactura,
            date: parsedDate.toISOString(),
            paymentMethod: normalizedPaymentMethod,
            paymentReference: normalizedPaymentReference || null,
            note: "Pago inicial de venta",
            account: getAccountFromPaymentMethod(normalizedPaymentMethod),
            createdAt: parsedDate.toISOString()
          }]
          : [],
        totalAmount: totalFactura,
        totalPaid: normalizedPaymentType === "contado" ? totalFactura : 0,
        balanceDue: normalizedPaymentType === "credito" ? totalFactura : 0,
        status: normalizedPaymentType === "credito" ? "pendiente" : "pagada",
        items: validatedItems
      };
      ensureSaleFinancialState(venta);
      ventas.push(venta);
      await commitBatch([
        ...productos.map(producto => ({ type: "set", collection: collections.productos, id: producto.id, data: producto })),
        ...baldesControl.map(bucket => ({ type: "set", collection: collections.baldesControl, id: bucket.id, data: bucket })),
        ...toppingControls.map(control => ({ type: "set", collection: collections.toppingControls, id: control.id, data: control })),
        ...sauceControls.map(control => ({ type: "set", collection: collections.sauceControls, id: control.id, data: control })),
        { type: "set", collection: collections.ventas, id: venta.id, data: venta }
      ]);
      res.status(201).json({ message: "Venta registrada.", venta });
    }));

    app.get("/ventas", asyncHandler(async (req, res) => {
      await hydrateStore([collections.ventas], { forceRefresh: true });
      res.json(getVentas().map(venta => ensureSaleFinancialState(venta)));
    }));

    app.post("/ventas/:id/pagar", asyncHandler(async (req, res) => {
      await hydrateStore();
      const { id } = req.params;
      if (!id || typeof id !== "string" || !id.trim()) {
        return res.status(400).json({ error: "ID inválido" });
      }
      const venta = getVentas().find(item => String(item.id) === String(id));

      if (!venta) {
        return res.status(404).json({ error: "Venta no encontrada." });
      }

      const currentPaymentType = String(venta.paymentType || "").toLowerCase();
      const originalPaymentType = String(venta.originalPaymentType || venta.paymentType || "").toLowerCase();
      const isCreditSale = currentPaymentType === "credito" || originalPaymentType === "credito";
      const isCashSale = currentPaymentType === "contado" || originalPaymentType === "contado";

      if (!isCreditSale && !isCashSale) {
        return res.status(400).json({ error: "Solo se pueden aplicar o editar pagos de ventas registradas a crédito o contado." });
      }

      const paymentMethod = String(req.body?.paymentMethod || "").trim().toLowerCase();
      const paymentReference = String(req.body?.paymentReference || "").trim();
      const paidAt = req.body?.paidAt ? new Date(req.body.paidAt) : new Date();

      if (!paymentMethod) {
        return res.status(400).json({ error: "El método de pago es obligatorio." });
      }
      if (!creditPaymentMethods.includes(paymentMethod)) {
        return res.status(400).json({ error: "Método de pago inválido" });
      }

      if (Number.isNaN(paidAt.getTime())) {
        return res.status(400).json({ error: "La fecha de pago no es válida." });
      }

      if (["transferencia", "tarjeta"].includes(paymentMethod) && !paymentReference) {
        return res.status(400).json({ error: "La referencia es obligatoria para tarjeta o transferencia." });
      }

      ensureSaleFinancialState(venta);
      const totalAmount = Number(venta.totalAmount || calculateSaleInvoiceTotal(venta));
      const existingPaymentHistory = Array.isArray(venta.paymentHistory) ? venta.paymentHistory : [];
      const requestedPaymentEntryId = String(req.body?.paymentEntryId || "").trim();
      const canEditSingleSettledCreditPayment = isCreditSale && Number(venta.balanceDue || 0) <= 0.0001 && existingPaymentHistory.length === 1;
      const existingPayment = isCreditSale
        ? (requestedPaymentEntryId
          ? existingPaymentHistory.find(entry => String(entry.id) === requestedPaymentEntryId) || null
          : (canEditSingleSettledCreditPayment ? existingPaymentHistory[0] : null))
        : null;
      const paymentAmount = isCreditSale
        ? Number(req.body?.amount)
        : totalAmount;

      if (requestedPaymentEntryId && isCreditSale && !existingPayment) {
        return res.status(404).json({ error: "No se encontró el abono seleccionado para esta venta." });
      }

      if (isCreditSale) {
        if (Number.isNaN(paymentAmount) || paymentAmount <= 0) {
          return res.status(400).json({ error: "El monto del abono debe ser mayor a cero." });
        }
        const maxAllowedAmount = existingPayment
          ? Number(venta.balanceDue || 0) + Number(existingPayment.amount || 0)
          : Number(venta.balanceDue || 0);
        if (paymentAmount - maxAllowedAmount > 0.0001) {
          return res.status(400).json({ error: "El abono no puede ser mayor que el saldo pendiente." });
        }
      }

      const currentCashReceived = Number(venta.cashReceived);
      const currentCashChange = Number(venta.cashChange);
      const receiptNumber = paymentMethod === "efectivo"
        ? (existingPayment?.receiptNumber || buildNextOutgoingReceiptNumber())
        : null;
      const resolvedPaymentReference = paymentMethod === "efectivo"
        ? receiptNumber
        : (paymentReference || null);

      venta.originalPaymentType = originalPaymentType || (isCashSale ? "contado" : "credito");
      venta.paymentType = isCashSale ? "contado" : "credito";
      venta.cashReceived = Number.isFinite(currentCashReceived) && currentCashReceived >= 0 ? currentCashReceived : totalAmount;
      venta.cashChange = Number.isFinite(currentCashChange) && currentCashChange >= 0 ? currentCashChange : 0;
      venta.paymentHistory = isCashSale
        ? [{
          id: crypto.randomUUID(),
          amount: totalAmount,
          date: paidAt.toISOString(),
          paymentMethod,
          paymentReference: resolvedPaymentReference,
          receiptNumber,
          note: "Pago actualizado de venta de contado",
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
              note: existingPayment.note || "Abono a venta a crédito",
              account: getAccountFromPaymentMethod(paymentMethod),
              createdAt: existingPayment.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
            : entry)
          : [
            ...(Array.isArray(venta.paymentHistory) ? venta.paymentHistory : []),
            {
              id: crypto.randomUUID(),
              amount: paymentAmount,
              date: paidAt.toISOString(),
              paymentMethod,
              paymentReference: resolvedPaymentReference,
              receiptNumber,
              note: "Abono a venta a crédito",
              account: getAccountFromPaymentMethod(paymentMethod),
              createdAt: new Date().toISOString()
            }
          ];

      ensureSaleFinancialState(venta);

      await saveRecord(collections.ventas, venta);
      res.json({
        message: isCashSale
          ? "Pago actualizado correctamente."
          : existingPayment
            ? venta.balanceDue <= 0
              ? "Abono actualizado y cuenta saldada correctamente."
              : "Abono actualizado correctamente."
            : venta.balanceDue <= 0
              ? "Abono aplicado y cuenta saldada correctamente."
              : "Abono aplicado correctamente.",
        venta
      });
    }));
  }

  return {
    registerSalesRoutes
  };
}

module.exports = {
  createSalesHandlers
};
