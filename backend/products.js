function createProductHandlers({
  app,
  asyncHandler,
  collections,
  createDocId,
  deleteRecord,
  findProductoByIdOrName,
  getCompras,
  getInventoryMovements,
  getProductos,
  getSalsas,
  getSabores,
  getToppings,
  getVentas,
  hydrateStore,
  normalizeInventoryMode,
  normalizeNonNegativeNumber,
  normalizeProductType,
  productIdentityKey,
  saveRecord,
  setProductos
}) {
  function registerProductRoutes() {
    app.post("/productos", asyncHandler(async (req, res) => {
      await hydrateStore();
      const productos = getProductos();
      const { nombre, precio, tipo, type, stockMin, medida, ingredientes, stock, originalId, originalName, controlSabores, rendimientoPorCompra, pelotasPorUnidad, modoControl, inventoryMode } = req.body;
      const rawType = (tipo || type || "").trim();
      const normalizedType = normalizeProductType(rawType);
      let normalizedMode = normalizeInventoryMode(modoControl || inventoryMode);
      const computedStockMin = !isNaN(Number(stockMin)) ? Number(stockMin) : (stock !== undefined ? Number(stock) : NaN);
      const computedPrecio = normalizedType === "materia prima" ? undefined : (!isNaN(Number(precio)) ? Number(precio) : NaN);
      if (normalizedType === "materia prima") {
        normalizedMode = "materia-prima";
      }
      const shouldUseRecipe = normalizedMode === "receta" || normalizedMode === "mixto";
      const shouldControlFlavors = normalizedMode === "helado-sabores" || normalizedMode === "mixto" || Boolean(controlSabores);
      const computedYield = normalizedType === "materia prima" ? normalizeNonNegativeNumber(rendimientoPorCompra) : 0;
      const computedScoops = shouldControlFlavors ? Number(pelotasPorUnidad) : 0;
      if (!nombre || typeof nombre !== "string" || !normalizedType || isNaN(computedStockMin) || (normalizedType !== "materia prima" && isNaN(computedPrecio))) {
        return res.status(400).json({ error: "Campos invÃ¡lidos. nombre, tipo y stockMin son obligatorios. Precio de venta es obligatorio para producto terminado y productos." });
      }

      if (normalizedType !== "materia prima" && !normalizedMode) {
        return res.status(400).json({ error: "Selecciona el modo de control del producto." });
      }

      if (normalizedMode === "directo" && normalizedType !== "productos") {
        return res.status(400).json({ error: "Los productos de control directo deben registrarse como productos." });
      }

      if ((normalizedMode === "receta" || normalizedMode === "mixto") && normalizedType !== "producto terminado") {
        return res.status(400).json({ error: "Los productos con receta o mixtos deben registrarse como producto terminado." });
      }

      if (normalizedMode === "helado-sabores" && normalizedType !== "productos") {
        return res.status(400).json({ error: "Los productos de helado por sabores deben registrarse como productos." });
      }

      if (normalizedType === "materia prima" && (!medida || typeof medida !== "string")) {
        return res.status(400).json({ error: "Materia prima necesita una mediciÃ³n." });
      }

      if (normalizedType === "materia prima" && (Number.isNaN(computedYield) || computedYield <= 0)) {
        return res.status(400).json({ error: "La materia prima debe indicar cuÃ¡ntas porciones rinde cada unidad comprada." });
      }

      if (shouldControlFlavors && (!Number.isInteger(computedScoops) || computedScoops <= 0)) {
        return res.status(400).json({ error: "El producto con sabores debe indicar cuÃ¡ntas porciones o pelotas lleva por unidad." });
      }

      if (shouldUseRecipe) {
        if (!Array.isArray(ingredientes) || ingredientes.length === 0) {
          return res.status(400).json({ error: "Producto terminado necesita ingredientes." });
        }
        const invalidIngredient = ingredientes.find(ing => !ing || !ing.nombre || typeof ing.nombre !== "string" || isNaN(Number(ing.cantidad)) || Number(ing.cantidad) <= 0);
        if (invalidIngredient) {
          return res.status(400).json({ error: "Cada ingrediente debe tener nombre y cantidad vÃ¡lidos." });
        }
        const missingMateriaPrima = ingredientes.find(ing => {
          const materia = (ing.id !== undefined && ing.id !== null)
            ? productos.find(p => String(p.id) === String(ing.id))
            : productos.find(p => p.nombre.toLowerCase() === ing.nombre.trim().toLowerCase());
          const materiaTipo = String(materia?.tipo || materia?.type || "").trim().toLowerCase();
          return !materia || materiaTipo !== "materia prima";
        });
        if (missingMateriaPrima) {
          return res.status(400).json({ error: `La materia prima ${missingMateriaPrima.nombre} no estÃ¡ registrada.` });
        }
      }

      const newProductData = {
        id: null,
        nombre: nombre.trim(),
        precio: normalizedType === "materia prima" ? undefined : computedPrecio,
        tipo: normalizedType,
        modoControl: normalizedMode,
        stockMin: computedStockMin,
        medida: normalizedType === "materia prima" ? medida : undefined,
        ingredientes: shouldUseRecipe ? ingredientes : undefined,
        controlSabores: shouldControlFlavors,
        rendimientoPorCompra: normalizedType === "materia prima" ? computedYield : undefined,
        pelotasPorUnidad: shouldControlFlavors ? computedScoops : undefined,
        stock: 0
      };

      const newProductKey = productIdentityKey(newProductData);
      const exactDuplicate = productos.find(p => productIdentityKey(p) === newProductKey);
      const editingProduct = findProductoByIdOrName({ id: originalId, nombre: originalName });

      if (editingProduct) {
        if (exactDuplicate && String(exactDuplicate.id) !== String(editingProduct.id)) {
          return res.status(400).json({ error: "Ya existe un producto idÃ©ntico con las mismas caracterÃ­sticas." });
        }
        editingProduct.nombre = newProductData.nombre;
        editingProduct.precio = newProductData.precio;
        editingProduct.tipo = newProductData.tipo;
        editingProduct.modoControl = newProductData.modoControl;
        editingProduct.stockMin = newProductData.stockMin;
        editingProduct.medida = newProductData.medida;
        editingProduct.ingredientes = newProductData.ingredientes;
        editingProduct.controlSabores = newProductData.controlSabores;
        editingProduct.rendimientoPorCompra = newProductData.rendimientoPorCompra;
        editingProduct.pelotasPorUnidad = newProductData.pelotasPorUnidad;
        await saveRecord(collections.productos, editingProduct);
        return res.status(200).json({ message: "Producto actualizado.", producto: editingProduct });
      }

      if (exactDuplicate) {
        return res.status(400).json({ error: "Ya existe un producto idÃ©ntico con las mismas caracterÃ­sticas." });
      }

      const producto = {
        ...newProductData,
        id: createDocId(collections.productos)
      };
      productos.push(producto);
      await saveRecord(collections.productos, producto);
      res.status(201).json({ message: "Producto creado.", producto });
    }));

    app.get("/productos", asyncHandler(async (req, res) => {
      await hydrateStore([collections.productos]);
      res.json(getProductos());
    }));

    app.delete("/productos/:id", asyncHandler(async (req, res) => {
      await hydrateStore();
      const { id } = req.params;
      const productos = getProductos();
      const producto = productos.find(p => String(p.id) === String(id));
      if (!producto) {
        return res.status(404).json({ error: "Producto no encontrado." });
      }

      const hasPurchase = getCompras().some(compra => Array.isArray(compra.items) && compra.items.some(item => String(item.id) === String(id)));
      const hasSale = getVentas().some(venta => Array.isArray(venta.items) && venta.items.some(item => String(item.id) === String(id) || (Array.isArray(item.sabores) && item.sabores.some(flavor => String(flavor.materiaPrimaId) === String(id))) || (Array.isArray(item.adicionales) && item.adicionales.some(adicional => String(adicional.materiaPrimaId) === String(id)))));
      const hasInventoryMovement = getInventoryMovements().some(movement => String(movement.productoId) === String(id));
      const linkedFlavor = getSabores().some(flavor => String(flavor.materiaPrimaId) === String(id));
      const linkedTopping = getToppings().some(topping => String(topping.materiaPrimaId) === String(id));
      const linkedSauce = getSalsas().some(sauce => String(sauce.materiaPrimaId) === String(id));
      if (hasPurchase || hasSale || hasInventoryMovement || linkedFlavor || linkedTopping || linkedSauce) {
        return res.status(400).json({ error: "No se puede eliminar un producto con movimientos vinculados." });
      }

      setProductos(productos.filter(p => String(p.id) !== String(id)));
      await deleteRecord(collections.productos, id);
      res.json({ message: "Producto eliminado con Ã©xito." });
    }));
  }

  return { registerProductRoutes };
}

module.exports = { createProductHandlers };
