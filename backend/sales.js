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
  getFlavorAvailableStock,
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
  function isCancelledSale(venta) {
    return String(venta?.status || "").trim().toLowerCase() === "anulada";
  }

  function addStock(productos, productId, quantity, affectedProducts) {
    const producto = productos.find(entry => String(entry.id) === String(productId));
    const amount = Number(quantity || 0);
    if (!producto || amount <= 0) {
      return;
    }
    producto.stock = Number(producto.stock || 0) + amount;
    affectedProducts.set(String(producto.id), producto);
  }

  function decrementControlMetric(collection, controlId, metric, amount, affectedControls) {
    const id = String(controlId || "");
    const quantity = Number(amount || 0);
    if (!id || quantity <= 0) {
      return;
    }
    const control = collection.find(entry => String(entry.id) === id);
    if (!control) {
      return;
    }
    control[metric] = Math.max(Number(control[metric] || 0) - quantity, 0);
    affectedControls.set(String(control.id), control);
  }

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
        const requiresRecipeControl = inventoryMode === "receta" || inventoryMode === "mixto" || (inventoryMode === "personalizado" && Array.isArray(producto.ingredientes) && producto.ingredientes.length > 0);
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
          const sourceCategory = String(component?.sourceCategory || "").trim().toLowerCase();
          const sourceId = component?.sourceId !== undefined && component?.sourceId !== null ? String(component.sourceId) : "";
          let componentProduct = componentId
            ? productos.find(entry => String(entry.id) === componentId)
            : productos.find(entry => String(entry.nombre || "").trim().toLowerCase() === componentName.toLowerCase());
          let normalizedSourceCategory = sourceCategory === "sabor" || sourceCategory === "flavor"
            ? "sabor"
            : sourceCategory === "topping"
              ? "topping"
              : sourceCategory === "salsa" || sourceCategory === "sauce"
                ? "salsa"
                : "producto";
          let normalizedSourceId = sourceId;
          let baldeControlId = null;
          let toppingControlId = null;
          let sauceControlId = null;

          if (normalizedSourceCategory === "sabor") {
            const registeredFlavor = sourceId
              ? sabores.find(entry => String(entry.id) === sourceId)
              : sabores.find(entry => entry.nombre.toLowerCase() === componentName.toLowerCase());
            const activeBucket = registeredFlavor ? getActiveBucketForFlavor(registeredFlavor.id) : null;
            componentProduct = registeredFlavor
              ? productos.find(entry => String(entry.id) === String(registeredFlavor.materiaPrimaId))
              : null;
            normalizedSourceId = registeredFlavor ? registeredFlavor.id : "";
            baldeControlId = activeBucket ? activeBucket.id : null;
          }

          if (normalizedSourceCategory === "topping") {
            const registeredTopping = sourceId
              ? toppings.find(entry => String(entry.id) === sourceId)
              : toppings.find(entry => entry.nombre.toLowerCase() === componentName.toLowerCase());
            const activeToppingControl = registeredTopping ? getActiveToppingControlForTopping(registeredTopping.id) : null;
            componentProduct = registeredTopping
              ? productos.find(entry => String(entry.id) === String(registeredTopping.materiaPrimaId))
              : null;
            normalizedSourceId = registeredTopping ? registeredTopping.id : "";
            toppingControlId = activeToppingControl ? activeToppingControl.id : null;
          }

          if (normalizedSourceCategory === "salsa") {
            const registeredSauce = sourceId
              ? salsas.find(entry => String(entry.id) === sourceId)
              : salsas.find(entry => entry.nombre.toLowerCase() === componentName.toLowerCase());
            const activeSauceControl = registeredSauce ? getActiveSauceControlForSauce(registeredSauce.id) : null;
            componentProduct = registeredSauce
              ? productos.find(entry => String(entry.id) === String(registeredSauce.materiaPrimaId))
              : null;
            normalizedSourceId = registeredSauce ? registeredSauce.id : "";
            sauceControlId = activeSauceControl ? activeSauceControl.id : null;
          }

          const componentMode = getProductInventoryMode(componentProduct);
          const cantidad = Number(component?.cantidad);
          const precio = component?.precio === undefined || component?.precio === null || component?.precio === "" ? 0 : Number(component.precio);

          if (!componentProduct || !["materia-prima", "directo"].includes(componentMode) || Number.isNaN(cantidad) || cantidad <= 0 || Number.isNaN(precio) || precio < 0) {
            return null;
          }

          if ((normalizedSourceCategory === "sabor" && !baldeControlId)
            || (normalizedSourceCategory === "topping" && !toppingControlId)
            || (normalizedSourceCategory === "salsa" && !sauceControlId)) {
            return null;
          }

          const cantidadTotal = cantidad * itemCantidad;
          if (Number(componentProduct.stock || 0) < cantidadTotal) {
            return null;
          }

          return {
            id: componentProduct.id,
            nombre: componentName || componentProduct.nombre,
            tipo: componentMode,
            cantidad,
            cantidadTotal,
            precio,
            stockDisponible: Number(componentProduct.stock || 0),
            sourceCategory: normalizedSourceCategory,
            sourceId: normalizedSourceId || componentProduct.id,
            sourceNombre: componentName || componentProduct.nombre,
            materiaPrimaId: componentProduct.id,
            materiaPrimaNombre: componentProduct.nombre,
            baldeControlId,
            toppingControlId,
            sauceControlId
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
            const flavorId = ingredient.flavorId !== undefined && ingredient.flavorId !== null ? String(ingredient.flavorId).trim() : "";
            if (!materiaPrima || Number.isNaN(consumoUnitario) || consumoUnitario <= 0) {
              return null;
            }
            const linkedFlavor = flavorId
              ? sabores.find(flavor => String(flavor.id) === flavorId && String(flavor.materiaPrimaId || "") === String(materiaPrima.id))
              : null;
            if (flavorId && !linkedFlavor) {
              return null;
            }
            const cantidad = consumoUnitario * itemCantidad;
            const activeBucket = linkedFlavor ? getActiveBucketForFlavor(linkedFlavor.id) : null;
            if (linkedFlavor && (!activeBucket || getFlavorAvailableStock(linkedFlavor.id) < cantidad)) {
              return null;
            }
            const bucketControl = activeBucket ? ensureConsumableControlSnapshot("bucket", activeBucket) : null;
            const provisionalCosts = bucketControl ? getControlCostValues(bucketControl, false) : null;
            return {
              id: materiaPrima.id,
              nombre: materiaPrima.nombre,
              cantidad,
              flavorId: linkedFlavor ? linkedFlavor.id : null,
              flavorName: linkedFlavor ? linkedFlavor.nombre : null,
              baldeControlId: activeBucket ? activeBucket.id : null,
              costoUnitarioProvisional: provisionalCosts ? provisionalCosts.unitCost : null,
              costoTotalProvisional: provisionalCosts ? provisionalCosts.totalForQuantity(cantidad) : null,
              costoUnitarioFinal: null,
              costoTotalFinal: null,
              costoEstado: linkedFlavor ? "provisional" : null
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
          if (!materiaPrimaExtra) {
            return null;
          }

          const materiaPrimaMode = getProductInventoryMode(materiaPrimaExtra);
          if (materiaPrimaMode !== "materia-prima" || Number(materiaPrimaExtra.stock || 0) < cantidad) {
            return null;
          }

          const linkedFlavors = sabores.filter(flavor => String(flavor.materiaPrimaId || "") === String(materiaPrimaExtra.id));
          const linkedToppings = toppings.filter(topping => String(topping.materiaPrimaId || "") === String(materiaPrimaExtra.id));
          const linkedSauces = salsas.filter(sauce => String(sauce.materiaPrimaId || "") === String(materiaPrimaExtra.id));
          const selectedFlavorId = adicional?.flavorId !== undefined && adicional?.flavorId !== null ? String(adicional.flavorId).trim() : "";
          const selectedToppingId = adicional?.toppingId !== undefined && adicional?.toppingId !== null ? String(adicional.toppingId).trim() : "";
          const selectedSauceId = adicional?.sauceId !== undefined && adicional?.sauceId !== null ? String(adicional.sauceId).trim() : "";
          const requiresLink = linkedFlavors.length || linkedToppings.length || linkedSauces.length;
          const selectedLinksCount = [selectedFlavorId, selectedToppingId, selectedSauceId].filter(Boolean).length;

          if (requiresLink && selectedLinksCount !== 1) {
            return null;
          }

          const selectedFlavor = selectedFlavorId
            ? linkedFlavors.find(flavor => String(flavor.id) === selectedFlavorId) || null
            : null;
          const selectedTopping = selectedToppingId
            ? linkedToppings.find(topping => String(topping.id) === selectedToppingId) || null
            : null;
          const selectedSauce = selectedSauceId
            ? linkedSauces.find(sauce => String(sauce.id) === selectedSauceId) || null
            : null;

          if ((selectedFlavorId && !selectedFlavor)
            || (selectedToppingId && !selectedTopping)
            || (selectedSauceId && !selectedSauce)) {
            return null;
          }

          const activeBucket = selectedFlavor ? getActiveBucketForFlavor(selectedFlavor.id) : null;
          if (selectedFlavor && (!activeBucket || getFlavorAvailableStock(selectedFlavor.id) < cantidad)) {
            return null;
          }

          const activeToppingControl = selectedTopping ? getActiveToppingControlForTopping(selectedTopping.id) : null;
          if (selectedTopping && (!activeToppingControl || getToppingAvailableStock(selectedTopping.id) < cantidad)) {
            return null;
          }

          const activeSauceControl = selectedSauce ? getActiveSauceControlForSauce(selectedSauce.id) : null;
          if (selectedSauce && (!activeSauceControl || getSauceAvailableStock(selectedSauce.id) < cantidad)) {
            return null;
          }

          if (activeToppingControl) {
            ensureConsumableControlSnapshot("topping", activeToppingControl);
          }
          if (activeSauceControl) {
            ensureConsumableControlSnapshot("sauce", activeSauceControl);
          }

          const linkedType = selectedFlavor ? "flavor" : selectedTopping ? "topping" : selectedSauce ? "sauce" : null;
          const linkedId = selectedFlavor ? selectedFlavor.id : selectedTopping ? selectedTopping.id : selectedSauce ? selectedSauce.id : null;
          const linkedName = selectedFlavor ? selectedFlavor.nombre : selectedTopping ? selectedTopping.nombre : selectedSauce ? selectedSauce.nombre : null;
          const toppingCosts = activeToppingControl ? getControlCostValues(activeToppingControl, false) : null;
          const sauceCosts = activeSauceControl ? getControlCostValues(activeSauceControl, false) : null;

          return {
            id: selectedTopping ? selectedTopping.id : selectedSauce ? selectedSauce.id : null,
            tipo,
            nombre,
            cantidad,
            precio,
            materiaPrimaId: materiaPrimaExtra.id,
            materiaPrimaNombre: materiaPrimaExtra.nombre,
            flavorId: selectedFlavor ? selectedFlavor.id : null,
            flavorName: selectedFlavor ? selectedFlavor.nombre : null,
            toppingId: selectedTopping ? selectedTopping.id : null,
            toppingName: selectedTopping ? selectedTopping.nombre : null,
            sauceId: selectedSauce ? selectedSauce.id : null,
            sauceName: selectedSauce ? selectedSauce.nombre : null,
            linkedType,
            linkedId,
            linkedName,
            baldeControlId: activeBucket ? activeBucket.id : null,
            toppingControlId: activeToppingControl ? activeToppingControl.id : null,
            sauceControlId: activeSauceControl ? activeSauceControl.id : null,
            addonCategory: selectedFlavor ? "flavor" : selectedTopping ? "topping" : selectedSauce ? "sauce" : "materia-prima",
            costoUnitarioProvisional: toppingCosts ? toppingCosts.unitCost : sauceCosts ? sauceCosts.unitCost : null,
            costoTotalProvisional: toppingCosts
              ? toppingCosts.totalForQuantity(cantidad)
              : sauceCosts
                ? sauceCosts.totalForQuantity(cantidad)
                : null,
            costoUnitarioFinal: null,
            costoTotalFinal: null,
            costoEstado: toppingCosts || sauceCosts ? "provisional" : "pendiente"
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

        if (inventoryMode === "receta" || inventoryMode === "mixto" || (inventoryMode === "personalizado" && Array.isArray(item.ingredientes) && item.ingredientes.length > 0)) {
          (item.ingredientes || []).forEach(ingredient => {
            const materiaPrima = productos.find(entry => String(entry.id) === String(ingredient.id));
            if (materiaPrima) {
              materiaPrima.stock -= Number(ingredient.cantidad || 0);
            }
            const activeBucket = ingredient.baldeControlId
              ? baldesControl.find(bucket => String(bucket.id) === String(ingredient.baldeControlId) && bucket.estado === "abierto")
              : null;
            if (activeBucket) {
              activeBucket.porcionesVendidas += Number(ingredient.cantidad || 0);
            }
          });
          [...new Set((item.ingredientes || []).map(ingredient => String(ingredient.baldeControlId || "")).filter(Boolean))].forEach(controlId => {
            const activeBucket = baldesControl.find(bucket => String(bucket.id) === controlId && bucket.estado === "abierto");
            if (activeBucket) {
              activeBucket.ventasAsociadas += 1;
            }
          });
        }

        if (inventoryMode === "personalizado") {
          (item.componentes || []).forEach(component => {
            const componentProduct = productos.find(entry => String(entry.id) === String(component.id));
            if (componentProduct) {
              componentProduct.stock -= Number(component.cantidadTotal || 0);
            }
            const activeBucket = component.baldeControlId
              ? baldesControl.find(bucket => String(bucket.id) === String(component.baldeControlId) && bucket.estado === "abierto")
              : null;
            if (activeBucket) {
              activeBucket.porcionesVendidas += Number(component.cantidadTotal || 0);
            }
            const activeToppingControl = component.toppingControlId
              ? toppingControls.find(control => String(control.id) === String(component.toppingControlId) && control.estado === "abierto")
              : null;
            if (activeToppingControl) {
              activeToppingControl.porcionesVendidas += Number(component.cantidadTotal || 0);
            }
            const activeSauceControl = component.sauceControlId
              ? sauceControls.find(control => String(control.id) === String(component.sauceControlId) && control.estado === "abierto")
              : null;
            if (activeSauceControl) {
              activeSauceControl.porcionesVendidas += Number(component.cantidadTotal || 0);
            }
          });

          [...new Set((item.componentes || []).map(component => String(component.baldeControlId || "")).filter(Boolean))].forEach(controlId => {
            const activeBucket = baldesControl.find(bucket => String(bucket.id) === controlId && bucket.estado === "abierto");
            if (activeBucket) {
              activeBucket.ventasAsociadas += 1;
            }
          });

          [...new Set((item.componentes || []).map(component => String(component.toppingControlId || "")).filter(Boolean))].forEach(controlId => {
            const activeToppingControl = toppingControls.find(control => String(control.id) === controlId && control.estado === "abierto");
            if (activeToppingControl) {
              activeToppingControl.ventasAsociadas += 1;
            }
          });

          [...new Set((item.componentes || []).map(component => String(component.sauceControlId || "")).filter(Boolean))].forEach(controlId => {
            const activeSauceControl = sauceControls.find(control => String(control.id) === controlId && control.estado === "abierto");
            if (activeSauceControl) {
              activeSauceControl.ventasAsociadas += 1;
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

          const activeBucket = adicional.baldeControlId
            ? baldesControl.find(bucket => String(bucket.id) === String(adicional.baldeControlId) && bucket.estado === "abierto")
            : (adicional.flavorId ? getActiveBucketForFlavor(adicional.flavorId) : null);
          if (activeBucket) {
            activeBucket.porcionesVendidas += Number(adicional.cantidad || 0);
          }
        });

        const bucketControlIds = [...new Set((item.adicionales || []).map(adicional => String(adicional.baldeControlId || "")).filter(Boolean))];
        bucketControlIds.forEach(controlId => {
          const activeBucket = baldesControl.find(bucket => String(bucket.id) === controlId && bucket.estado === "abierto");
          if (activeBucket) {
            activeBucket.ventasAsociadas += 1;
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
      if (isCancelledSale(venta)) {
        return res.status(400).json({ error: "No se puede aplicar pago a una venta anulada." });
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

    app.post("/ventas/:id/anular", asyncHandler(async (req, res) => {
      await hydrateStore();
      const { id } = req.params;
      if (!id || typeof id !== "string" || !id.trim()) {
        return res.status(400).json({ error: "ID invÃ¡lido" });
      }

      const productos = getProductos();
      const baldesControl = getBaldesControl();
      const toppingControls = getToppingControls();
      const sauceControls = getSauceControls();
      const venta = getVentas().find(item => String(item.id) === String(id));

      if (!venta) {
        return res.status(404).json({ error: "Venta no encontrada." });
      }
      if (isCancelledSale(venta)) {
        return res.status(400).json({ error: "La venta ya fue anulada." });
      }

      const affectedProducts = new Map();
      const affectedBuckets = new Map();
      const affectedToppingControls = new Map();
      const affectedSauceControls = new Map();

      (Array.isArray(venta.items) ? venta.items : []).forEach(item => {
        const producto = productos.find(entry => String(entry.id) === String(item.id));
        const inventoryMode = item.modoControl || getProductInventoryMode(producto);
        const itemQuantity = Number(item.cantidad || 0);

        if (producto && inventoryMode === "directo") {
          addStock(productos, producto.id, itemQuantity, affectedProducts);
        }

        if (inventoryMode === "receta" || inventoryMode === "mixto" || (inventoryMode === "personalizado" && Array.isArray(item.ingredientes) && item.ingredientes.length > 0)) {
          (item.ingredientes || []).forEach(ingredient => {
            addStock(productos, ingredient.id, Number(ingredient.cantidad || 0), affectedProducts);
            decrementControlMetric(baldesControl, ingredient.baldeControlId, "porcionesVendidas", Number(ingredient.cantidad || 0), affectedBuckets);
          });
          [...new Set((item.ingredientes || []).map(ingredient => String(ingredient.baldeControlId || "")).filter(Boolean))]
            .forEach(controlId => decrementControlMetric(baldesControl, controlId, "ventasAsociadas", 1, affectedBuckets));
        }

        if (inventoryMode === "personalizado") {
          (item.componentes || []).forEach(component => {
            const quantity = Number(component.cantidadTotal || 0);
            addStock(productos, component.id, quantity, affectedProducts);
            decrementControlMetric(baldesControl, component.baldeControlId, "porcionesVendidas", quantity, affectedBuckets);
            decrementControlMetric(toppingControls, component.toppingControlId, "porcionesVendidas", quantity, affectedToppingControls);
            decrementControlMetric(sauceControls, component.sauceControlId, "porcionesVendidas", quantity, affectedSauceControls);
          });

          [...new Set((item.componentes || []).map(component => String(component.baldeControlId || "")).filter(Boolean))]
            .forEach(controlId => decrementControlMetric(baldesControl, controlId, "ventasAsociadas", 1, affectedBuckets));
          [...new Set((item.componentes || []).map(component => String(component.toppingControlId || "")).filter(Boolean))]
            .forEach(controlId => decrementControlMetric(toppingControls, controlId, "ventasAsociadas", 1, affectedToppingControls));
          [...new Set((item.componentes || []).map(component => String(component.sauceControlId || "")).filter(Boolean))]
            .forEach(controlId => decrementControlMetric(sauceControls, controlId, "ventasAsociadas", 1, affectedSauceControls));
        }

        if (inventoryMode === "helado-sabores" || inventoryMode === "mixto") {
          (item.sabores || []).forEach(flavor => {
            const quantity = Number(flavor.porciones || 0);
            addStock(productos, flavor.materiaPrimaId, quantity, affectedProducts);
            decrementControlMetric(baldesControl, flavor.baldeControlId, "porcionesVendidas", quantity, affectedBuckets);
          });

          [...new Set((item.sabores || []).map(flavor => String(flavor.baldeControlId || "")).filter(Boolean))]
            .forEach(controlId => decrementControlMetric(baldesControl, controlId, "ventasAsociadas", 1, affectedBuckets));
        }

        (item.adicionales || []).forEach(adicional => {
          const quantity = Number(adicional.cantidad || 0);
          addStock(productos, adicional.materiaPrimaId, quantity, affectedProducts);
          decrementControlMetric(toppingControls, adicional.toppingControlId, "porcionesVendidas", quantity, affectedToppingControls);
          decrementControlMetric(sauceControls, adicional.sauceControlId, "porcionesVendidas", quantity, affectedSauceControls);
          decrementControlMetric(baldesControl, adicional.baldeControlId, "porcionesVendidas", quantity, affectedBuckets);
        });

        [...new Set((item.adicionales || []).map(adicional => String(adicional.baldeControlId || "")).filter(Boolean))]
          .forEach(controlId => decrementControlMetric(baldesControl, controlId, "ventasAsociadas", 1, affectedBuckets));
        [...new Set((item.adicionales || []).map(adicional => String(adicional.toppingControlId || "")).filter(Boolean))]
          .forEach(controlId => decrementControlMetric(toppingControls, controlId, "ventasAsociadas", 1, affectedToppingControls));
        [...new Set((item.adicionales || []).map(adicional => String(adicional.sauceControlId || "")).filter(Boolean))]
          .forEach(controlId => decrementControlMetric(sauceControls, controlId, "ventasAsociadas", 1, affectedSauceControls));
      });

      venta.status = "anulada";
      venta.cancelledAt = new Date().toISOString();
      venta.cancelledReason = String(req.body?.reason || "").trim() || "Anulada desde la app";
      venta.paymentHistory = [];
      venta.totalPaid = 0;
      venta.balanceDue = 0;
      venta.paidAt = null;
      venta.paymentReference = null;
      ensureSaleFinancialState(venta);

      await commitBatch([
        ...Array.from(affectedProducts.values()).map(producto => ({ type: "set", collection: collections.productos, id: producto.id, data: producto })),
        ...Array.from(affectedBuckets.values()).map(bucket => ({ type: "set", collection: collections.baldesControl, id: bucket.id, data: bucket })),
        ...Array.from(affectedToppingControls.values()).map(control => ({ type: "set", collection: collections.toppingControls, id: control.id, data: control })),
        ...Array.from(affectedSauceControls.values()).map(control => ({ type: "set", collection: collections.sauceControls, id: control.id, data: control })),
        { type: "set", collection: collections.ventas, id: venta.id, data: venta }
      ]);
      res.json({ message: "Venta anulada y stock restaurado correctamente.", venta });
    }));
  }

  return {
    registerSalesRoutes
  };
}

module.exports = {
  createSalesHandlers
};
