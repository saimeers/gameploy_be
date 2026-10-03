/**
 * In-memory stand-in for the few ioredis commands the API uses, with expiry
 * driven by Date.now() so tests can move time with jest fake timers.
 * `failing = true` makes every command reject, like a Redis outage.
 */
const createFakeRedis = () => {
  const data = new Map(); // key -> { value: string, expires: number | null }
  const fake = { failing: false, data };

  const live = (key) => {
    const entry = data.get(key);
    if (entry && entry.expires !== null && entry.expires <= Date.now()) {
      data.delete(key);
      return undefined;
    }
    return entry;
  };

  const commands = {
    get: (key) => live(key)?.value ?? null,
    set: (key, value, ...args) => {
      let expires = null;
      let nx = false;
      for (let i = 0; i < args.length; i++) {
        const arg = String(args[i]).toUpperCase();
        if (arg === 'EX') expires = Date.now() + Number(args[++i]) * 1000;
        else if (arg === 'PX') expires = Date.now() + Number(args[++i]);
        else if (arg === 'NX') nx = true;
      }
      if (nx && live(key)) return null;
      data.set(key, { value: String(value), expires });
      return 'OK';
    },
    incr: (key) => commands.incrby(key, 1),
    decr: (key) => commands.incrby(key, -1),
    incrby: (key, by) => {
      const entry = live(key);
      const value = Number(entry?.value ?? 0) + by;
      data.set(key, { value: String(value), expires: entry?.expires ?? null });
      return value;
    },
    expire: (key, seconds) => {
      const entry = live(key);
      if (!entry) return 0;
      entry.expires = Date.now() + seconds * 1000;
      return 1;
    },
    pttl: (key) => {
      const entry = live(key);
      if (!entry) return -2;
      return entry.expires === null ? -1 : entry.expires - Date.now();
    },
    del: (key) => (data.delete(key) ? 1 : 0),
  };

  const run = (name, args) => {
    if (fake.failing) return Promise.reject(new Error('Connection is closed.'));
    return Promise.resolve(commands[name](...args));
  };

  for (const name of Object.keys(commands)) {
    fake[name] = jest.fn((...args) => run(name, args));
  }

  fake.multi = () => {
    const queued = [];
    const chain = {
      exec: () => {
        if (fake.failing) return Promise.reject(new Error('Connection is closed.'));
        return Promise.resolve(queued.map(([name, args]) => [null, commands[name](...args)]));
      },
    };
    for (const name of Object.keys(commands)) {
      chain[name] = (...args) => { queued.push([name, args]); return chain; };
    }
    return chain;
  };

  return fake;
};

module.exports = { createFakeRedis };
