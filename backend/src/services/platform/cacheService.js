class CacheService {
  constructor(client, defaultTtl = 120) {
    this.client = client;
    this.defaultTtl = defaultTtl;
  }

  buildKey(userId, resource, params = {}) {
    const suffix = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");

    return suffix ? `app:${userId}:${resource}:${suffix}` : `app:${userId}:${resource}`;
  }

  async getJson(key) {
    try {
      const raw = await this.client.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async setJson(key, value, ttl = this.defaultTtl) {
    try {
      await this.client.set(key, JSON.stringify(value), "EX", ttl);
      return true;
    } catch {
      return false;
    }
  }

  async deleteKey(key) {
    try {
      await this.client.del(key);
      return true;
    } catch {
      return false;
    }
  }

  async invalidatePattern(pattern) {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.unlink(...keys);
      }
      return keys.length;
    } catch {
      return 0;
    }
  }
}

module.exports = CacheService;