export function createInitialState({
  getSavedActiveTab,
  getSavedAuthToken,
  getSavedAuthUser
}) {
  return {
    productos: [],
    purchases: [],
    sales: [],
    payments: [],
    paymentCategories: [],
    fundTransfers: [],
    fundSettings: null,
    externalDebts: [],
    sabores: [],
    toppings: [],
    sauces: [],
    inventoryMovements: [],
    bucketControls: [],
    toppingControls: [],
    sauceControls: [],
    activeTab: getSavedActiveTab(),
    productSearch: "",
    runtimeEnvironment: { mode: "unknown", label: "Detectando entorno..." },
    auth: {
      token: getSavedAuthToken(),
      user: getSavedAuthUser(),
      users: [],
      configured: true,
      bootstrapSecretRequired: false,
      mode: "login"
    }
  };
}
