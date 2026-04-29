function createFirestoreStore({
  db,
  collections,
  assignCollectionData,
  collectionCacheMs = {},
  defaultCollectionCacheMs = 2 * 60 * 1000
}) {
  const collectionCacheState = Object.values(collections).reduce((accumulator, collectionName) => {
    accumulator[collectionName] = { loadedAt: 0, hasLoaded: false };
    return accumulator;
  }, {});

  function getCollectionCacheDuration(collectionName) {
    return Number(collectionCacheMs[collectionName] || defaultCollectionCacheMs);
  }

  function markCollectionCache(collectionName, timestamp = Date.now()) {
    if (!collectionCacheState[collectionName]) {
      collectionCacheState[collectionName] = { loadedAt: 0, hasLoaded: false };
    }
    collectionCacheState[collectionName].loadedAt = timestamp;
    collectionCacheState[collectionName].hasLoaded = true;
  }

  function shouldHydrateCollection(collectionName, forceRefresh = false) {
    if (forceRefresh) {
      return true;
    }

    const cacheEntry = collectionCacheState[collectionName];
    if (!cacheEntry?.hasLoaded) {
      return true;
    }

    return Date.now() - Number(cacheEntry.loadedAt || 0) >= getCollectionCacheDuration(collectionName);
  }

  function sanitizeFirestoreValue(value) {
    if (Array.isArray(value)) {
      return value.map(sanitizeFirestoreValue);
    }

    if (value && typeof value === "object") {
      return Object.entries(value).reduce((accumulator, [key, nestedValue]) => {
        if (nestedValue !== undefined) {
          accumulator[key] = sanitizeFirestoreValue(nestedValue);
        }
        return accumulator;
      }, {});
    }

    return value;
  }

  async function loadCollection(collectionName) {
    const snapshot = await db.collection(collectionName).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async function hydrateStore(collectionNames = null, options = {}) {
    const { forceRefresh = false } = options;
    const targetCollections = Array.isArray(collectionNames) && collectionNames.length
      ? collectionNames
      : Object.values(collections);

    const uniqueCollections = [...new Set(targetCollections)].filter(collectionName => shouldHydrateCollection(collectionName, forceRefresh));
    if (!uniqueCollections.length) {
      return;
    }

    const loadedCollections = await Promise.all(uniqueCollections.map(async collectionName => ({
      collectionName,
      records: await loadCollection(collectionName)
    })));

    loadedCollections.forEach(({ collectionName, records }) => {
      assignCollectionData(collectionName, records);
      markCollectionCache(collectionName);
    });
  }

  function createDocId(collectionName) {
    return db.collection(collectionName).doc().id;
  }

  async function saveRecord(collectionName, record) {
    const id = String(record.id || createDocId(collectionName));
    const payload = sanitizeFirestoreValue({ ...record, id });
    await db.collection(collectionName).doc(id).set(payload);
    markCollectionCache(collectionName);
    return payload;
  }

  async function deleteRecord(collectionName, id) {
    await db.collection(collectionName).doc(String(id)).delete();
    markCollectionCache(collectionName);
  }

  async function commitBatch(operations) {
    const batch = db.batch();
    const touchedCollections = new Set();

    operations.forEach(operation => {
      if (!operation) return;
      touchedCollections.add(operation.collection);

      const docRef = db.collection(operation.collection).doc(String(operation.id));
      if (operation.type === "delete") {
        batch.delete(docRef);
        return;
      }

      batch.set(docRef, sanitizeFirestoreValue({ ...operation.data, id: String(operation.id) }));
    });

    await batch.commit();
    const commitTime = Date.now();
    touchedCollections.forEach(collectionName => markCollectionCache(collectionName, commitTime));
  }

  return {
    commitBatch,
    createDocId,
    deleteRecord,
    hydrateStore,
    sanitizeFirestoreValue,
    saveRecord
  };
}

module.exports = {
  createFirestoreStore
};
