const clone = value => structuredClone(value);
const get = (object, key) => key.split('.').reduce((value, part) => value?.[part], object);
function set(object, key, value) {
  const parts = key.split('.'); let target = object;
  for (const part of parts.slice(0, -1)) target = target[part] ||= {};
  target[parts.at(-1)] = clone(value);
}
const equal = (a, b) => a instanceof Date || b instanceof Date ? new Date(a).getTime() === new Date(b).getTime() : a === b;
function matches(doc, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return condition.some(item => matches(doc, item));
    const value = get(doc, key);
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('$exists' in condition) return condition.$exists === (value !== undefined);
      if ('$in' in condition) return condition.$in.some(item => equal(value, item));
      if ('$regex' in condition) return typeof value === 'string' && new RegExp(condition.$regex, condition.$options).test(value);
      throw new Error('Unsupported fixture filter');
    }
    return equal(value, condition);
  });
}
function createMemoryMongo() {
  const collections = new Map(), databases = new Set();
  let offline = false;
  const check = () => { if (offline) throw Object.assign(new Error('private connection credentials'), { code: 'OFFLINE' }); };
  function collection(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    const docs = collections.get(name);
    return {
      seed(doc) { docs.set(doc._id, clone(doc)); },
      all: () => [...docs.values()].map(clone),
      createIndex: async () => { check(); },
      countDocuments: async filter => { check(); return [...docs.values()].filter(doc => matches(doc, filter)).length; },
      findOne: async filter => { check(); return clone([...docs.values()].find(doc => matches(doc, filter)) || null); },
      find(filter, { projection } = {}) {
        let sort = {}, skip = 0, limit = Infinity;
        const cursor = {
          sort(value) { sort = value; return cursor; }, skip(value) { skip = value; return cursor; }, limit(value) { limit = value; return cursor; },
          async toArray() {
            check();
            const rows = [...docs.values()].filter(doc => matches(doc, filter)).sort((a, b) => {
              for (const [key, direction] of Object.entries(sort)) {
                const av = get(a, key), bv = get(b, key);
                if (av < bv) return -direction;
                if (av > bv) return direction;
              }
              return 0;
            }).slice(skip, skip + limit);
            return rows.map(doc => {
              if (!projection) return clone(doc);
              const row = { _id: doc._id };
              for (const [key, included] of Object.entries(projection)) if (included && get(doc, key) !== undefined) set(row, key, get(doc, key));
              return row;
            });
          }
        };
        return cursor;
      },
      async updateOne(filter, update, options = {}) {
        check();
        const existing = [...docs.values()].find(doc => matches(doc, filter));
        if (!existing && !options.upsert) return { matchedCount: 0, modifiedCount: 0 };
        const doc = existing ? clone(existing) : Object.fromEntries(Object.entries(filter).filter(([, value]) => value === null || typeof value !== 'object'));
        if (!existing) for (const [key, value] of Object.entries(update.$setOnInsert || {})) set(doc, key, value);
        for (const [key, value] of Object.entries(update.$set || {})) set(doc, key, value);
        if (!doc._id) throw new Error('Fixture upsert needs an _id');
        if (name === 'pages' && [...docs.values()].some(other => other._id !== doc._id && other.platform_key === doc.platform_key && other.name_key === doc.name_key)) throw Object.assign(new Error('duplicate key'), { code: 11000 });
        docs.set(doc._id, doc);
        return { matchedCount: existing ? 1 : 0, modifiedCount: existing ? 1 : 0, upsertedCount: existing ? 0 : 1 };
      }
    };
  }
  const db = { collection, command: async () => { check(); return { ok: 1 }; } };
  return { db, databases, setOffline: value => { offline = value; }, client: { db: name => { databases.add(name); return db; }, close: async () => {} } };
}
module.exports = { createMemoryMongo };
