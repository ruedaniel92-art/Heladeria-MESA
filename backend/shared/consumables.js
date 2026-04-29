function createConsumableHelpers({
  collections,
  findProductoByIdOrName,
  getBaldesControl,
  getCompras,
  getInventoryMovements,
  getMateriaPrimaStockIncrement,
  getProductos,
  getSalsas,
  getSauceControls,
  getSabores,
  getToppingControls,
  getToppings,
  getVentas,
  setInventoryMovements
}) {
  function getActiveBucketForFlavor(flavorId) {
    return getBaldesControl().find(bucket => String(bucket.saborId) === String(flavorId) && bucket.estado === 'abierto');
  }
  
  function getActiveToppingControlForTopping(toppingId) {
    return getToppingControls().find(control => String(control.toppingId) === String(toppingId) && control.estado === 'abierto');
  }
  
  function getActiveSauceControlForSauce(sauceId) {
    return getSauceControls().find(control => String(control.sauceId) === String(sauceId) && control.estado === 'abierto');
  }
  
  function getFlavorPurchasedStock(flavorId) {
    const normalizedFlavorId = String(flavorId || '').trim();
    if (!normalizedFlavorId) {
      return 0;
    }
  
    const flavor = getSabores().find(item => String(item.id) === normalizedFlavorId);
    if (!flavor) {
      return 0;
    }
  
    const linkedFlavors = getSabores().filter(item => String(item.materiaPrimaId || '') === String(flavor.materiaPrimaId));
  
    return getCompras().reduce((total, compra) => {
      const items = Array.isArray(compra.items) ? compra.items : [];
      return total + items.reduce((sum, item) => {
        if (String(item.id || '') !== String(flavor.materiaPrimaId)) {
          return sum;
        }
  
        const matchesFlavor = String(item.flavorId || '') === normalizedFlavorId;
        const isSingleFlavorRawMaterial = !item.flavorId && linkedFlavors.length === 1;
        if (!matchesFlavor && !isSingleFlavorRawMaterial) {
          return sum;
        }
  
        const materiaPrima = getProductos().find(producto => String(producto.id) === String(item.id)) || findProductoByIdOrName({ id: item.id, nombre: item.nombre });
        if (!materiaPrima) {
          return sum;
        }
  
        return sum + getMateriaPrimaStockIncrement(materiaPrima, Number(item.cantidad || 0));
      }, 0);
    }, 0);
  }
  
  function getFlavorConsumedStock(flavorId) {
    const normalizedFlavorId = String(flavorId || '').trim();
    if (!normalizedFlavorId) {
      return 0;
    }
  
    return getVentas().reduce((total, venta) => {
      const items = Array.isArray(venta.items) ? venta.items : [];
      return total + items.reduce((sum, item) => {
        const flavors = Array.isArray(item.getSabores()) ? item.getSabores() : [];
        return sum + flavors.reduce((flavorSum, flavor) => {
          return String(flavor.id || '') === normalizedFlavorId
            ? flavorSum + Number(flavor.porciones || 0)
            : flavorSum;
        }, 0);
      }, 0);
    }, 0);
  }
  
  function getFlavorAvailableStock(flavorId) {
    return Math.max(getFlavorPurchasedStock(flavorId) - getFlavorConsumedStock(flavorId), 0);
  }
  
  function getToppingPurchasedStock(toppingId) {
    const normalizedToppingId = String(toppingId || '').trim();
    if (!normalizedToppingId) {
      return 0;
    }
  
    const topping = getToppings().find(item => String(item.id) === normalizedToppingId);
    if (!topping) {
      return 0;
    }
  
    const linkedToppings = getToppings().filter(item => String(item.materiaPrimaId || '') === String(topping.materiaPrimaId));
    return getCompras().reduce((total, compra) => {
      const items = Array.isArray(compra.items) ? compra.items : [];
      return total + items.reduce((sum, item) => {
        if (String(item.id || '') !== String(topping.materiaPrimaId)) {
          return sum;
        }
  
        const matchesTopping = String(item.toppingId || '') === normalizedToppingId;
        const isSingleToppingRawMaterial = !item.toppingId && linkedToppings.length === 1;
        if (!matchesTopping && !isSingleToppingRawMaterial) {
          return sum;
        }
  
        const materiaPrima = getProductos().find(producto => String(producto.id) === String(item.id)) || findProductoByIdOrName({ id: item.id, nombre: item.nombre });
        if (!materiaPrima) {
          return sum;
        }
  
        return sum + getMateriaPrimaStockIncrement(materiaPrima, Number(item.cantidad || 0));
      }, 0);
    }, 0);
  }
  
  function getToppingConsumedStock(toppingId) {
    const normalizedToppingId = String(toppingId || '').trim();
    if (!normalizedToppingId) {
      return 0;
    }
  
    return getVentas().reduce((total, venta) => {
      const items = Array.isArray(venta.items) ? venta.items : [];
      return total + items.reduce((sum, item) => {
        const adicionales = Array.isArray(item.adicionales) ? item.adicionales : [];
        return sum + adicionales.reduce((addonsSum, adicional) => {
          return String(adicional.id || '') === normalizedToppingId
            ? addonsSum + Number(adicional.cantidad || 0)
            : addonsSum;
        }, 0);
      }, 0);
    }, 0);
  }
  
  function getToppingAvailableStock(toppingId) {
    return Math.max(getToppingPurchasedStock(toppingId) - getToppingConsumedStock(toppingId), 0);
  }
  
  function getSaucePurchasedStock(sauceId) {
    const normalizedSauceId = String(sauceId || '').trim();
    if (!normalizedSauceId) {
      return 0;
    }
  
    const sauce = getSalsas().find(item => String(item.id) === normalizedSauceId);
    if (!sauce) {
      return 0;
    }
  
    const linkedSauces = getSalsas().filter(item => String(item.materiaPrimaId || '') === String(sauce.materiaPrimaId));
    return getCompras().reduce((total, compra) => {
      const items = Array.isArray(compra.items) ? compra.items : [];
      return total + items.reduce((sum, item) => {
        if (String(item.id || '') !== String(sauce.materiaPrimaId)) {
          return sum;
        }
  
        const matchesSauce = String(item.sauceId || '') === normalizedSauceId;
        const isSingleSauceRawMaterial = !item.sauceId && linkedSauces.length === 1;
        if (!matchesSauce && !isSingleSauceRawMaterial) {
          return sum;
        }
  
        const materiaPrima = getProductos().find(producto => String(producto.id) === String(item.id)) || findProductoByIdOrName({ id: item.id, nombre: item.nombre });
        if (!materiaPrima) {
          return sum;
        }
  
        return sum + getMateriaPrimaStockIncrement(materiaPrima, Number(item.cantidad || 0));
      }, 0);
    }, 0);
  }
  
  function getSauceConsumedStock(sauceId) {
    const normalizedSauceId = String(sauceId || '').trim();
    if (!normalizedSauceId) {
      return 0;
    }
  
    return getVentas().reduce((total, venta) => {
      const items = Array.isArray(venta.items) ? venta.items : [];
      return total + items.reduce((sum, item) => {
        const adicionales = Array.isArray(item.adicionales) ? item.adicionales : [];
        return sum + adicionales.reduce((addonsSum, adicional) => {
          return String(adicional.id || '') === normalizedSauceId
            ? addonsSum + Number(adicional.cantidad || 0)
            : addonsSum;
        }, 0);
      }, 0);
    }, 0);
  }
  
  function getSauceAvailableStock(sauceId) {
    return Math.max(getSaucePurchasedStock(sauceId) - getSauceConsumedStock(sauceId), 0);
  }
  
  function sortRecordsByDate(records, dateField = 'fecha') {
    return records.slice().sort((left, right) => {
      const leftDate = new Date(left?.[dateField] || left?.createdAt || 0).getTime();
      const rightDate = new Date(right?.[dateField] || right?.createdAt || 0).getTime();
      if (leftDate !== rightDate) {
        return leftDate - rightDate;
      }
      return String(left?.id || '').localeCompare(String(right?.id || ''));
    });
  }
  
  function getConsumableConfig(kind) {
    if (kind === 'bucket') {
      return {
        entityList: getSabores(),
        controlList: getBaldesControl(),
        entityIdField: 'saborId',
        entityNameField: 'saborNombre',
        rawMaterialIdField: 'materiaPrimaId',
        rawMaterialNameField: 'materiaPrimaNombre',
        purchaseLinkField: 'flavorId',
        purchaseLinkNameField: 'flavorName',
        controlLinkField: 'baldeControlId',
        controlCollection: collections.baldesControl,
        label: 'balde'
      };
    }
  
    if (kind === 'topping') {
      return {
        entityList: getToppings(),
        controlList: getToppingControls(),
        entityIdField: 'toppingId',
        entityNameField: 'toppingNombre',
        rawMaterialIdField: 'materiaPrimaId',
        rawMaterialNameField: 'materiaPrimaNombre',
        purchaseLinkField: 'toppingId',
        purchaseLinkNameField: 'toppingName',
        controlLinkField: 'toppingControlId',
        controlCollection: collections.toppingControls,
        label: 'topping'
      };
    }
  
    if (kind === 'sauce') {
      return {
        entityList: getSalsas(),
        controlList: getSauceControls(),
        entityIdField: 'sauceId',
        entityNameField: 'sauceNombre',
        rawMaterialIdField: 'materiaPrimaId',
        rawMaterialNameField: 'materiaPrimaNombre',
        purchaseLinkField: 'sauceId',
        purchaseLinkNameField: 'sauceName',
        controlLinkField: 'sauceControlId',
        controlCollection: collections.sauceControls,
        label: 'salsa/aderezo'
      };
    }
  
    return null;
  }
  
  function getConsumableEntity(kind, entityId) {
    const config = getConsumableConfig(kind);
    if (!config) return null;
    return config.entityList.find(item => String(item.id) === String(entityId)) || null;
  }
  
  function getConsumableEntitiesByRawMaterial(kind, rawMaterialId) {
    const config = getConsumableConfig(kind);
    if (!config) return [];
    return config.entityList.filter(item => String(item[config.rawMaterialIdField] || '') === String(rawMaterialId || ''));
  }
  
  function buildConsumablePurchaseUnitLayers(kind, entityId) {
    const config = getConsumableConfig(kind);
    const entity = getConsumableEntity(kind, entityId);
    if (!config || !entity) {
      return [];
    }
  
    const rawMaterial = getProductos().find(producto => String(producto.id) === String(entity[config.rawMaterialIdField]));
    if (!rawMaterial) {
      return [];
    }
  
    const linkedEntities = getConsumableEntitiesByRawMaterial(kind, rawMaterial.id);
    const theoreticalYieldPerUnit = getMateriaPrimaStockIncrement(rawMaterial, 1);
    if (Number.isNaN(theoreticalYieldPerUnit) || theoreticalYieldPerUnit <= 0) {
      return [];
    }
  
    const layers = [];
    sortRecordsByDate(getCompras()).forEach(compra => {
      const items = Array.isArray(compra.items) ? compra.items : [];
      items.forEach((item, itemIndex) => {
        if (String(item.id || '') !== String(rawMaterial.id)) {
          return;
        }
  
        const linkedId = String(item[config.purchaseLinkField] || '').trim();
        const matchesEntity = linkedId === String(entity.id) || (!linkedId && linkedEntities.length === 1);
        if (!matchesEntity) {
          return;
        }
  
        let remainingUnits = Number(item.cantidad || 0);
        const unitCost = Number(item.costo || 0);
        let sequence = 1;
        while (remainingUnits > 0.0000001) {
          const consumedUnits = remainingUnits >= 1 ? 1 : remainingUnits;
          const totalCost = unitCost * consumedUnits;
          const theoreticalYield = theoreticalYieldPerUnit * consumedUnits;
          layers.push({
            key: `${String(compra.id || 'purchase')}:${itemIndex}:${sequence}`,
            compraId: compra.id,
            documentoCompra: compra.documento || '',
            fechaCompra: compra.fecha || null,
            entidadId: entity.id,
            entidadNombre: entity.nombre || '',
            purchasedUnits: consumedUnits,
            costoTotal: totalCost,
            costoUnitarioTeorico: theoreticalYield > 0 ? totalCost / theoreticalYield : 0,
            rendimientoTeorico: theoreticalYield
          });
          remainingUnits -= consumedUnits;
          sequence += 1;
        }
      });
    });
  
    return layers;
  }
  
  function getAssignedConsumableLayer(kind, control) {
    const config = getConsumableConfig(kind);
    if (!config || !control) {
      return null;
    }
  
    const controlsForEntity = sortRecordsByDate(
      config.controlList.filter(item => String(item[config.entityIdField] || '') === String(control[config.entityIdField] || '')),
      'fechaApertura'
    );
    const controlIndex = controlsForEntity.findIndex(item => String(item.id) === String(control.id));
    if (controlIndex < 0) {
      return null;
    }
  
    const layers = buildConsumablePurchaseUnitLayers(kind, control[config.entityIdField]);
    return layers[controlIndex] || null;
  }
  
  function getNextConsumableLayer(kind, entityId) {
    const config = getConsumableConfig(kind);
    if (!config) {
      return null;
    }
  
    const controlsForEntity = config.controlList.filter(item => String(item[config.entityIdField] || '') === String(entityId || ''));
    const layers = buildConsumablePurchaseUnitLayers(kind, entityId);
    return layers[controlsForEntity.length] || null;
  }
  
  function applyConsumableCostSnapshot(control, layer) {
    if (!control || !layer) {
      return control;
    }
  
    control.capaCostoKey = layer.key;
    control.compraId = layer.compraId || null;
    control.documentoCompra = layer.documentoCompra || null;
    control.fechaCompra = layer.fechaCompra || null;
    control.unidadesApertura = Number(layer.purchasedUnits || 0);
    control.rendimientoTeorico = Number(layer.rendimientoTeorico || 0);
    control.costoAperturaTotal = Number(layer.costoTotal || 0);
    control.costoPorcionProvisional = Number(layer.costoUnitarioTeorico || 0);
    control.costoPorcionFinal = control.costoPorcionFinal === null || control.costoPorcionFinal === undefined
      ? null
      : Number(control.costoPorcionFinal || 0);
    control.rendimientoReal = control.rendimientoReal === null || control.rendimientoReal === undefined
      ? null
      : Number(control.rendimientoReal || 0);
    control.mermaReal = control.mermaReal === null || control.mermaReal === undefined
      ? null
      : Number(control.mermaReal || 0);
    control.costoEstado = control.costoPorcionFinal !== null ? 'final' : 'provisional';
    return control;
  }
  
  function ensureConsumableControlSnapshot(kind, control) {
    if (!control) {
      return null;
    }
    if (control.capaCostoKey && control.costoAperturaTotal !== undefined && control.costoAperturaTotal !== null) {
      return control;
    }
    const assignedLayer = getAssignedConsumableLayer(kind, control);
    if (!assignedLayer) {
      return control;
    }
    return applyConsumableCostSnapshot(control, assignedLayer);
  }
  
  function getControlCostValues(control, finalCost = false) {
    const finalUnitCost = Number(control?.costoPorcionFinal);
    const provisionalUnitCost = Number(control?.costoPorcionProvisional);
    const unitCost = finalCost && Number.isFinite(finalUnitCost) && finalUnitCost >= 0
      ? finalUnitCost
      : Number.isFinite(provisionalUnitCost) && provisionalUnitCost >= 0
        ? provisionalUnitCost
        : 0;
    return {
      unitCost,
      totalForQuantity(quantity) {
        return unitCost * Number(quantity || 0);
      }
    };
  }
  
  function applyFinalCostToSalesForControl(kind, control) {
    const config = getConsumableConfig(kind);
    if (!config || !control) {
      return [];
    }
  
    const affectedSales = [];
    getVentas().forEach(venta => {
      let saleTouched = false;
      const items = Array.isArray(venta.items) ? venta.items : [];
      items.forEach(item => {
        if (kind === 'bucket') {
          const saboresItem = Array.isArray(item.getSabores()) ? item.getSabores() : [];
          saboresItem.forEach(flavor => {
            if (String(flavor[config.controlLinkField] || '') !== String(control.id)) {
              return;
            }
            const costValues = getControlCostValues(control, true);
            flavor.costoUnitarioFinal = costValues.unitCost;
            flavor.costoTotalFinal = costValues.totalForQuantity(flavor.porciones);
            if (flavor.costoUnitarioProvisional === undefined || flavor.costoUnitarioProvisional === null) {
              const provisionalValues = getControlCostValues(control, false);
              flavor.costoUnitarioProvisional = provisionalValues.unitCost;
              flavor.costoTotalProvisional = provisionalValues.totalForQuantity(flavor.porciones);
            }
            flavor.costoEstado = 'final';
            saleTouched = true;
          });
          return;
        }
  
        const addons = Array.isArray(item.adicionales) ? item.adicionales : [];
        addons.forEach(addon => {
          if (String(addon[config.controlLinkField] || '') !== String(control.id)) {
            return;
          }
          const costValues = getControlCostValues(control, true);
          addon.costoUnitarioFinal = costValues.unitCost;
          addon.costoTotalFinal = costValues.totalForQuantity(addon.cantidad);
          if (addon.costoUnitarioProvisional === undefined || addon.costoUnitarioProvisional === null) {
            const provisionalValues = getControlCostValues(control, false);
            addon.costoUnitarioProvisional = provisionalValues.unitCost;
            addon.costoTotalProvisional = provisionalValues.totalForQuantity(addon.cantidad);
          }
          addon.costoEstado = 'final';
          saleTouched = true;
        });
      });
  
      if (saleTouched) {
        affectedSales.push(venta);
      }
    });
  
    return affectedSales;
  }
  
  function findExistingConsumableCloseMovements(kind, control) {
    const config = getConsumableConfig(kind);
    if (!config || !control) {
      return [];
    }
  
    const closeDate = control.fechaCierre ? new Date(control.fechaCierre) : null;
    const closeTime = closeDate && !Number.isNaN(closeDate.getTime()) ? closeDate.getTime() : null;
    const expectedObservation = `Merma por cierre de ${config.label} ${control[config.entityNameField] || ''}`.trim();
  
    return getInventoryMovements().filter(movement => {
      if (String(movement.tipo || '') !== 'cierre-control' || String(movement.direccion || '') !== 'salida') {
        return false;
      }
      if (String(movement.controlKind || '') === String(kind) && String(movement.controlId || '') === String(control.id)) {
        return true;
      }
      if (String(movement.productoId || '') !== String(control[config.rawMaterialIdField] || '')) {
        return false;
      }
      if (String(movement.observacion || '').trim() !== expectedObservation) {
        return false;
      }
      if (Number(movement.cantidad || 0) !== Number(control.mermaReal || 0)) {
        return false;
      }
      if (closeTime === null) {
        return true;
      }
      const movementTime = movement.fecha ? new Date(movement.fecha).getTime() : null;
      return movementTime === closeTime;
    });
  }
  
  function removeConsumableCloseInventoryMovements(kind, control) {
    const config = getConsumableConfig(kind);
    if (!config || !control) {
      return { removedMovements: [], affectedProduct: null, restoredQuantity: 0 };
    }
  
    const existingMovements = findExistingConsumableCloseMovements(kind, control);
    if (!existingMovements.length) {
      return { removedMovements: [], affectedProduct: null, restoredQuantity: 0 };
    }
  
    const producto = getProductos().find(item => String(item.id) === String(control[config.rawMaterialIdField] || ''));
    const restoredQuantity = existingMovements.reduce((sum, movement) => sum + Math.max(Number(movement.cantidad || 0), 0), 0);
  
    if (producto && restoredQuantity > 0) {
      producto.stock = Number(producto.stock || 0) + restoredQuantity;
    }
  
    const removedIds = new Set(existingMovements.map(movement => String(movement.id)));
    setInventoryMovements(getInventoryMovements().filter(movement => !removedIds.has(String(movement.id))));
  
    return {
      removedMovements: existingMovements,
      affectedProduct: producto || null,
      restoredQuantity
    };
  }
  
  function repairConsumableControls(kind) {
    const config = getConsumableConfig(kind);
    if (!config) {
      return { repairedControls: 0, createdMovements: 0, updatedSales: 0, updatedProducts: 0 };
    }
  
    let repairedControls = 0;
    let removedMovements = 0;
    const affectedSaleIds = new Set();
    const affectedProductIds = new Set();
    const removedMovementIds = new Set();
  
    sortRecordsByDate(config.controlList, 'fechaApertura').forEach(control => {
      ensureConsumableControlSnapshot(kind, control);
      if (String(control.estado || '') !== 'cerrado') {
        return;
      }
  
      const soldPortions = Number(control.porcionesVendidas || 0);
      const theoreticalYield = Number(control.rendimientoTeorico || 0);
      const rendimientoReal = Math.max(soldPortions, 0);
      const mermaReal = Math.max(theoreticalYield - rendimientoReal, 0);
  
      control.rendimientoReal = rendimientoReal;
      control.mermaReal = mermaReal;
      control.costoPorcionFinal = rendimientoReal > 0 ? Number(control.costoAperturaTotal || 0) / rendimientoReal : 0;
      control.costoEstado = 'final';
      repairedControls += 1;
  
      const affectedSales = applyFinalCostToSalesForControl(kind, control);
      affectedSales.forEach(venta => affectedSaleIds.add(String(venta.id)));
  
      const cleanupResult = removeConsumableCloseInventoryMovements(kind, control);
      if (cleanupResult.affectedProduct) {
        affectedProductIds.add(String(cleanupResult.affectedProduct.id));
      }
      removedMovements += cleanupResult.removedMovements.length;
      cleanupResult.removedMovements.forEach(movement => removedMovementIds.add(String(movement.id)));
    });
  
    return {
      repairedControls,
      removedMovements,
      removedMovementIds: Array.from(removedMovementIds),
      updatedSales: affectedSaleIds.size,
      updatedProducts: affectedProductIds.size
    };
  }

  return {
    applyConsumableCostSnapshot,
    applyFinalCostToSalesForControl,
    ensureConsumableControlSnapshot,
    getActiveBucketForFlavor,
    getActiveSauceControlForSauce,
    getActiveToppingControlForTopping,
    getControlCostValues,
    getFlavorAvailableStock,
    getNextConsumableLayer,
    getSauceAvailableStock,
    getToppingAvailableStock,
    removeConsumableCloseInventoryMovements,
    repairConsumableControls
  };
}

module.exports = {
  createConsumableHelpers
};
