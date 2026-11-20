'use strict';

/* ============================================================
   HEARTLAND 26 — Zero-Dependency HTTP + WebSocket Multiplayer Server
   Serves the game and hosts real-time multiplayer session rooms
   and proximity voice chat relay at ws://localhost:8080/ws
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = parseInt(process.env.PORT || '8080', 10);
const ROOT = __dirname;

function getLanAddresses() {
  const out = [];
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if ((net.family === 'IPv4' || net.family === 4) && !net.internal) {
          out.push(net.address);
        }
      }
    }
  } catch (e) {}
  return out;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const clients = new Set();

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (urlPath === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OK');
    return;
  }
  if (urlPath === '/api/host-info') {
    const rooms = {};
    for (const c of clients) {
      rooms[c.room] = (rooms[c.room] || 0) + 1;
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      port: PORT,
      lanIps: getLanAddresses(),
      onlinePlayers: clients.size,
      rooms
    }));
    return;
  }
  const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const fullPath = path.resolve(ROOT, relPath);
  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

function encodeWsFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function parseWsFrames(buffer, onMessage, onClose) {
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const byte0 = buffer[offset];
    const byte1 = buffer[offset + 1];
    const opcode = byte0 & 0x0f;
    if (opcode === 0x08) {
      onClose();
      return buffer.length;
    }
    const masked = (byte1 & 0x80) !== 0;
    let len = byte1 & 0x7f;
    let headerLen = 2;
    if (len === 126) {
      if (offset + 4 > buffer.length) break;
      len = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (len === 127) {
      if (offset + 10 > buffer.length) break;
      len = Number(buffer.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (offset + headerLen + maskLen + len > buffer.length) break;
    const payloadStart = offset + headerLen + maskLen;
    const payload = Buffer.alloc(len);
    if (masked) {
      const mask = buffer.subarray(offset + headerLen, payloadStart);
      for (let i = 0; i < len; i++) {
        payload[i] = buffer[payloadStart + i] ^ mask[i & 3];
      }
    } else {
      buffer.copy(payload, 0, payloadStart, payloadStart + len);
    }
    if (opcode === 0x01) {
      onMessage(payload.toString('utf8'));
    }
    offset = payloadStart + len;
  }
  return offset;
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );

  const u = new URL(req.url || '/ws', 'http://localhost');
  const client = {
    socket,
    room: (u.searchParams.get('room') || 'KC-2026').toUpperCase(),
    buf: Buffer.alloc(0)
  };
  clients.add(client);

  socket.on('data', (chunk) => {
    client.buf = Buffer.concat([client.buf, chunk]);
    const consumed = parseWsFrames(
      client.buf,
      (msgStr) => {
        try {
          const parsed = JSON.parse(msgStr);
          if (parsed.room) client.room = String(parsed.room).toUpperCase();
          const frame = encodeWsFrame(msgStr);
          for (const other of clients) {
            if (other !== client && other.room === client.room && !other.socket.destroyed) {
              other.socket.write(frame);
            }
          }
        } catch (e) {}
      },
      () => {
        clients.delete(client);
        socket.end();
      }
    );
    client.buf = client.buf.subarray(consumed);
  });

  socket.on('close', () => clients.delete(client));
  socket.on('error', () => clients.delete(client));
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('============================================================');
    console.log('HEARTLAND 26 — Kansas City Multiplayer Server Online');
    console.log('  Local Join URL : http://localhost:' + PORT + '/?room=KC-2026');
    const lanIps = getLanAddresses();
    for (const ip of lanIps) {
      console.log('  LAN Join URL   : http://' + ip + ':' + PORT + '/?room=KC-2026');
    }
    console.log('  Free Tunnel    : npx localtunnel --port ' + PORT);
    console.log('============================================================');
  });
}

module.exports = server;
