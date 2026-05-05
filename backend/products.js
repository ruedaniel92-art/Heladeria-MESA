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
      const hasRecipeIngredients = Array.isArray(ingredientes) && ingredientes.length > 0;
      const shouldUseRecipe = normalizedMode === "receta" || normalizedMode === "mixto" || (normalizedMode === "personalizado" && hasRecipeIngredients);
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

      if (normalizedMode === "personalizado" && normalizedType !== "productos") {
        return res.status(400).json({ error: "Los productos personalizados libres deben registrarse como productos." });
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
        if ((normalizedMode === "receta" || normalizedMode === "mixto") && !hasRecipeIngredients) {
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

      const normalizedIngredientes = shouldUseRecipe
        ? ingredientes.map(ing => {
            const materia = (ing.id !== undefined && ing.id !== null)
              ? productos.find(p => String(p.id) === String(ing.id))
              : productos.find(p => p.nombre.toLowerCase() === ing.nombre.trim().toLowerCase());
            const linkedFlavors = getSabores().filter(flavor => String(flavor.materiaPrimaId || "") === String(materia?.id || ""));
            const linkedToppings = getToppings().filter(topping => String(topping.materiaPrimaId || "") === String(materia?.id || ""));
            const linkedSauces = getSalsas().filter(sauce => String(sauce.materiaPrimaId || "") === String(materia?.id || ""));
            const linkedType = ing.linkedType !== undefined && ing.linkedType !== null ? String(ing.linkedType).trim() : "";
            const linkedId = ing.linkedId !== undefined && ing.linkedId !== null ? String(ing.linkedId).trim() : "";
            const flavorId = ing.flavorId !== undefined && ing.flavorId !== null ? String(ing.flavorId).trim() : linkedType === "flavor" ? linkedId : "";
            const toppingId = ing.toppingId !== undefined && ing.toppingId !== null ? String(ing.toppingId).trim() : linkedType === "topping" ? linkedId : "";
            const sauceId = ing.sauceId !== undefined && ing.sauceId !== null ? String(ing.sauceId).trim() : linkedType === "sauce" ? linkedId : "";
            const selectedLinksCount = [flavorId, toppingId, sauceId].filter(Boolean).length;
            const flavor = flavorId ? linkedFlavors.find(item => String(item.id) === flavorId) : null;
            const topping = toppingId ? linkedToppings.find(item => String(item.id) === toppingId) : null;
            const sauce = sauceId ? linkedSauces.find(item => String(item.id) === sauceId) : null;
            if ((linkedFlavors.length > 0 || linkedToppings.length > 0 || linkedSauces.length > 0)
              && (selectedLinksCount !== 1 || (!flavor && !topping && !sauce))) {
              return null;
            }
            const normalizedLink = flavor
              ? { type: "flavor", id: flavor.id, name: flavor.nombre }
              : topping
                ? { type: "topping", id: topping.id, name: topping.nombre }
                : sauce
                  ? { type: "sauce", id: sauce.id, name: sauce.nombre }
                  : null;
            return {
              id: materia.id,
              nombre: materia.nombre,
              cantidad: Number(ing.cantidad),
              linkedType: normalizedLink ? normalizedLink.type : undefined,
              linkedId: normalizedLink ? normalizedLink.id : undefined,
              linkedName: normalizedLink ? normalizedLink.name : undefined,
              flavorId: flavor ? flavor.id : undefined,
              flavorName: flavor ? flavor.nombre : undefined,
              toppingId: topping ? topping.id : undefined,
              toppingName: topping ? topping.nombre : undefined,
              sauceId: sauce ? sauce.id : undefined,
              sauceName: sauce ? sauce.nombre : undefined
            };
          })
        : undefined;
      if (Array.isArray(normalizedIngredientes) && normalizedIngredientes.some(ing => ing === null)) {
        return res.status(400).json({ error: "Selecciona el vinculo que aplica para cada materia prima vinculada a sabores, toppings o salsas." });
      }

      const newProductData = {
        id: null,
        nombre: nombre.trim(),
        precio: normalizedType === "materia prima" ? undefined : computedPrecio,
        tipo: normalizedType,
        modoControl: normalizedMode,
        stockMin: computedStockMin,
        medida: normalizedType === "materia prima" ? medida : undefined,
        ingredientes: normalizedIngredientes,
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
      await hydrateStore([collections.productos], { forceRefresh: true });
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
      const hasSale = getVentas().some(venta => Array.isArray(venta.items) && venta.items.some(item => String(item.id) === String(id) || (Array.isArray(item.ingredientes) && item.ingredientes.some(ingredient => String(ingredient.id) === String(id))) || (Array.isArray(item.componentes) && item.componentes.some(component => String(component.id) === String(id))) || (Array.isArray(item.sabores) && item.sabores.some(flavor => String(flavor.materiaPrimaId) === String(id))) || (Array.isArray(item.adicionales) && item.adicionales.some(adicional => String(adicional.materiaPrimaId) === String(id)))));
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
