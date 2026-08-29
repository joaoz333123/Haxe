function getRedisConfig() {
  let url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  let token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if ((!url || !token) && process.env.REDIS_URL) {
    try {
      const parsed = new URL(process.env.REDIS_URL);
      token = parsed.password || token;
      const host = parsed.hostname;
      if (host && token) {
        url = `https://${host}`;
      }
    } catch (e) {
      console.warn('Error parsing REDIS_URL:', e);
    }
  }

  return { url, token };
}

module.exports = async function handler(req, res) {
  const { url, token } = getRedisConfig();
  const STORAGE_KEY = 'haxe_rateio_data';

  if (req.method === 'GET') {
    if (!url || !token) {
      return res.status(200).json({ _offlineFallback: true });
    }
    try {
      const response = await fetch(`${url}/get/${STORAGE_KEY}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!data || data.result === null || data.result === undefined) {
        return res.status(200).json(null);
      }
      const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
      return res.status(200).json(parsed);
    } catch (e) {
      return res.status(200).json({ _offlineFallback: true });
    }
  }

  if (req.method === 'POST') {
    if (!url || !token) {
      return res.status(200).json({ _offlineFallback: true });
    }
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      await fetch(`${url}/set/${STORAGE_KEY}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(JSON.stringify(body))
      });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
