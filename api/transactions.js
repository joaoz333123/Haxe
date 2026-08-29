const net = require('net');

const STORAGE_KEY = 'haxe_rateio_data';
const RESET_PASSWORD = process.env.RESET_PASSWORD || '12';

function parseRedisUrl(redisUrl) {
  if (!redisUrl) return null;
  try {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 6379,
      password: parsed.password || null,
      username: parsed.username || 'default'
    };
  } catch (e) {
    return null;
  }
}

function executeRedisCommands(config, commandArrays) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: config.host,
      port: config.port,
      timeout: 5000
    });

    let buffer = Buffer.alloc(0);
    let stage = 'CONNECT';

    socket.on('connect', () => {
      if (config.password) {
        const authCmd = `*3\r\n$4\r\nAUTH\r\n$${Buffer.byteLength(config.username, 'utf8')}\r\n${config.username}\r\n$${Buffer.byteLength(config.password, 'utf8')}\r\n${config.password}\r\n`;
        socket.write(authCmd);
        stage = 'AUTH';
      } else {
        sendCommands();
      }
    });

    function sendCommands() {
      stage = 'EXEC';
      let payload = '';
      for (const cmdArgs of commandArrays) {
        payload += `*${cmdArgs.length}\r\n`;
        for (const arg of cmdArgs) {
          const str = String(arg);
          payload += `$${Buffer.byteLength(str, 'utf8')}\r\n${str}\r\n`;
        }
      }
      socket.write(payload);
    }

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const str = buffer.toString('utf8');

      if (stage === 'AUTH') {
        if (str.includes('+OK')) {
          buffer = Buffer.alloc(0);
          sendCommands();
        } else if (str.includes('-ERR') || str.includes('-WRONGPASS')) {
          socket.destroy();
          reject(new Error(`Redis Auth Error: ${str.trim()}`));
        }
      } else if (stage === 'EXEC') {
        socket.destroy();
        resolve(buffer);
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Redis Connection Timeout'));
    });

    socket.on('error', (err) => {
      reject(err);
    });
  });
}

function parseRespValue(buffer) {
  if (!buffer || buffer.length === 0) return null;
  const str = buffer.toString('utf8');
  if (str.startsWith('$-1')) {
    return null;
  }
  if (str.startsWith('$')) {
    const firstNewline = str.indexOf('\r\n');
    if (firstNewline === -1) return null;
    const length = parseInt(str.substring(1, firstNewline), 10);
    const content = str.substring(firstNewline + 2, firstNewline + 2 + length);
    return content;
  }
  if (str.startsWith('+OK')) {
    return 'OK';
  }
  return str.trim();
}

module.exports = async function handler(req, res) {
  // Ação de verificação de senha administrativa
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (body && body.action === 'verify-admin') {
      if (String(body.password).trim() === String(RESET_PASSWORD).trim()) {
        return res.status(200).json({ success: true, authorized: true });
      } else {
        return res.status(401).json({ success: false, authorized: false, error: 'Senha incorreta' });
      }
    }
  }

  const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
  const config = parseRedisUrl(redisUrl);

  if (!config) {
    return res.status(200).json({ _offlineFallback: true, message: 'REDIS_URL not found' });
  }

  if (req.method === 'GET') {
    try {
      const rawResp = await executeRedisCommands(config, [['GET', STORAGE_KEY]]);
      const rawValue = parseRespValue(rawResp);
      if (!rawValue) {
        return res.status(200).json(null);
      }
      const parsedData = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
      return res.status(200).json(parsedData);
    } catch (err) {
      console.error('Redis GET Error:', err.message);
      return res.status(200).json({ _offlineFallback: true, error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const jsonString = JSON.stringify(body);
      const rawResp = await executeRedisCommands(config, [['SET', STORAGE_KEY, jsonString]]);
      const status = parseRespValue(rawResp);
      if (status === 'OK' || status?.includes('OK')) {
        return res.status(200).json({ success: true });
      }
      return res.status(500).json({ error: 'Failed to save in Redis' });
    } catch (err) {
      console.error('Redis POST Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
