/**
 * ChatNow – Real-Time Server
 * Node.js + Express + WebSocket (ws)
 *
 * Features:
 *  - Random 1-on-1 pairing (stranger chat)
 *  - Multiple named chat rooms (group chat)
 *  - Direct Messages (DM) between any online users
 *  - Typing indicators (1-on-1, room, DM)
 *  - Online user list broadcast
 *  - Image/file sharing (base64)
 *  - Report / Block / Skip
 *  - Graceful reconnection handling
 */

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path      = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server, maxPayload: 6 * 1024 * 1024 });

const PORT = process.env.PORT || 3000;

/* ─── Static files ─── */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/chat',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));
app.get('/rooms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rooms.html')));
app.get('/start', (req, res) => res.sendFile(path.join(__dirname, 'public', 'start.html')));
app.get('/dm',    (req, res) => res.sendFile(path.join(__dirname, 'public', 'dm.html')));

app.get('/about',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/terms',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));



/* ═══════════════════════════════════════
   Server State
═══════════════════════════════════════ */
// clients: Map<clientId, { ws, user, room, partner, dmSessions: Set<clientId> }>
const clients      = new Map();
const waitingQueue = [];

const rooms = new Map([
  ['general', new Set()], ['singles', new Set()], ['gaming',  new Set()],
  ['travel',  new Set()], ['music',   new Set()], ['tech',    new Set()],
  ['sports',  new Set()], ['adult',   new Set()],
]);

/* ═══════════════════════════════════════
   Helpers
═══════════════════════════════════════ */
function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(data)); } catch {}
  }
}

function timestamp() {
  const d = new Date();
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

function broadcastOnlineCount() {
  const count = clients.size;
  const msg   = JSON.stringify({ type: 'online_count', count });
  wss.clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
}

function broadcastToRoom(roomId, data, excludeId = null) {
  const roomSet = rooms.get(roomId);
  if (!roomSet) return;
  roomSet.forEach(cid => {
    if (cid === excludeId) return;
    const c = clients.get(cid);
    if (c) send(c.ws, data);
  });
}

function getRoomCount(roomId) { return rooms.get(roomId)?.size || 0; }

function broadcastRoomCounts() {
  const counts = {};
  rooms.forEach((set, id) => { counts[id] = set.size; });
  const msg = JSON.stringify({ type: 'room_counts', counts });
  wss.clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
}

/* ── Build public user list (everyone online with a nickname) ── */
function getUserList(excludeId) {
  const list = [];
  clients.forEach((c, id) => {
    if (id === excludeId) return;
    if (!c.user || !c.user.nickname) return;
    list.push({
      id:       id,
      nickname: c.user.nickname,
      gender:   c.user.gender  || '',
      country:  c.user.country || '',
      online:   true,
    });
  });
  return list;
}

/* ── Broadcast updated user list to everyone ── */
function broadcastUserList() {
  clients.forEach((c, id) => {
    if (!c.user || !c.user.nickname) return;
    send(c.ws, { type: 'user_list', users: getUserList(id) });
  });
}

/* ═══════════════════════════════════════
   Random Chat Pairing
═══════════════════════════════════════ */
function tryPairRandom(clientId) {
  const me = clients.get(clientId);
  if (!me || me.partner) return;

  const idx = waitingQueue.findIndex(id => {
    if (id === clientId) return false;
    const other = clients.get(id);
    return other && !other.partner && other.ws.readyState === WebSocket.OPEN;
  });

  if (idx === -1) {
    if (!waitingQueue.includes(clientId)) waitingQueue.push(clientId);
    send(me.ws, { type: 'waiting' });
    return;
  }

  const partnerId = waitingQueue.splice(idx, 1)[0];
  const partner   = clients.get(partnerId);
  const myIdx     = waitingQueue.indexOf(clientId);
  if (myIdx !== -1) waitingQueue.splice(myIdx, 1);

  me.partner      = partnerId;
  partner.partner = clientId;

  send(me.ws,      { type: 'connected', stranger: { name: partner.user.nickname, country: partner.user.country, gender: partner.user.gender } });
  send(partner.ws, { type: 'connected', stranger: { name: me.user.nickname,      country: me.user.country,      gender: me.user.gender      } });
}

function disconnectPartner(clientId) {
  const me = clients.get(clientId);
  if (!me || !me.partner) return;
  const partner = clients.get(me.partner);
  if (partner) {
    partner.partner = null;
    send(partner.ws, { type: 'stranger_left' });
  }
  me.partner = null;
}

/* ═══════════════════════════════════════
   WebSocket Connection Handler
═══════════════════════════════════════ */
wss.on('connection', (ws) => {
  const clientId = uuidv4();
  clients.set(clientId, { ws, user: {}, room: null, partner: null, dmSessions: new Set() });

  console.log(`[+] ${clientId} connected | Total: ${clients.size}`);
  broadcastOnlineCount();
  broadcastRoomCounts();

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    const client = clients.get(clientId);
    if (!client) return;

    switch (data.type) {

      /* ─── Profile ─── */
      case 'set_user': {
        client.user = {
          nickname: (data.nickname || 'Anonymous').slice(0, 24),
          gender:   data.gender  || '',
          age:      data.age     || '',
          country:  data.country || '',
        };
        send(ws, { type: 'user_set', user: client.user, myId: clientId });
        broadcastUserList();
        break;
      }

      /* ─── Get user list (for DM page) ─── */
      case 'get_user_list': {
        send(ws, { type: 'user_list', users: getUserList(clientId) });
        break;
      }

      /* ─── Random chat ─── */
      case 'start_random': {
        leaveRoom(clientId);
        client.partner = null;
        tryPairRandom(clientId);
        break;
      }

      case 'skip': {
        disconnectPartner(clientId);
        const qi = waitingQueue.indexOf(clientId);
        if (qi !== -1) waitingQueue.splice(qi, 1);
        setTimeout(() => tryPairRandom(clientId), 300);
        break;
      }

      case 'stop': {
        disconnectPartner(clientId);
        const qi2 = waitingQueue.indexOf(clientId);
        if (qi2 !== -1) waitingQueue.splice(qi2, 1);
        send(ws, { type: 'stopped' });
        break;
      }

      case 'message': {
        if (!client.partner) return;
        const p = clients.get(client.partner);
        if (p) send(p.ws, { type: 'message', text: data.text, time: timestamp(), from: 'stranger' });
        break;
      }

      case 'image': {
        if (!client.partner) return;
        const p = clients.get(client.partner);
        if (p) send(p.ws, { type: 'image', src: data.src, time: timestamp(), from: 'stranger' });
        break;
      }

      case 'typing': {
        if (!client.partner) return;
        const p = clients.get(client.partner);
        if (p) send(p.ws, { type: 'typing', isTyping: data.isTyping });
        break;
      }

      /* ─── Rooms ─── */
      case 'join_room': {
        const roomId = data.room;
        if (!rooms.has(roomId)) return;
        leaveRoom(clientId);
        disconnectPartner(clientId);
        client.room = roomId;
        rooms.get(roomId).add(clientId);
        send(ws, { type: 'room_joined', room: roomId, count: getRoomCount(roomId) });
        broadcastToRoom(roomId, { type: 'room_system', message: `${client.user.nickname || 'Someone'} joined.`, time: timestamp() }, clientId);
        broadcastRoomCounts();
        break;
      }

      case 'room_message': {
        const rid = client.room;
        if (!rid) return;
        broadcastToRoom(rid, { type: 'room_message', text: data.text, author: client.user.nickname || 'Anonymous', country: client.user.country || '', time: timestamp() }, clientId);
        break;
      }

      case 'room_image': {
        const rid = client.room;
        if (!rid) return;
        broadcastToRoom(rid, { type: 'room_image', src: data.src, author: client.user.nickname || 'Anonymous', country: client.user.country || '', time: timestamp() }, clientId);
        break;
      }

      case 'room_typing': {
        const rid = client.room;
        if (!rid) return;
        broadcastToRoom(rid, { type: 'room_typing', isTyping: data.isTyping, author: client.user.nickname || 'Someone' }, clientId);
        break;
      }

      case 'leave_room': {
        leaveRoom(clientId);
        send(ws, { type: 'room_left' });
        break;
      }

      /* ═══════════════════════════════════
         DIRECT MESSAGES
      ═══════════════════════════════════ */

      /* ─── Send DM text ─── */
      case 'dm_message': {
        const toId    = data.to;      // recipient clientId
        const toClient = clients.get(toId);
        if (!toClient) {
          send(ws, { type: 'dm_error', to: toId, message: 'User is no longer online.' });
          return;
        }
        const payload = {
          type:     'dm_message',
          from:     clientId,
          fromNick: client.user.nickname || 'Anonymous',
          fromCountry: client.user.country || '',
          to:       toId,
          text:     data.text,
          time:     timestamp(),
        };
        send(toClient.ws, payload);          // deliver to recipient
        send(ws, { ...payload, sent: true }); // echo back to sender (confirmed)
        // Track DM session on both sides
        client.dmSessions.add(toId);
        toClient.dmSessions.add(clientId);
        break;
      }

      /* ─── Send DM image ─── */
      case 'dm_image': {
        const toId     = data.to;
        const toClient = clients.get(toId);
        if (!toClient) {
          send(ws, { type: 'dm_error', to: toId, message: 'User is no longer online.' });
          return;
        }
        const payload = {
          type:     'dm_image',
          from:     clientId,
          fromNick: client.user.nickname || 'Anonymous',
          fromCountry: client.user.country || '',
          to:       toId,
          src:      data.src,
          time:     timestamp(),
        };
        send(toClient.ws, payload);
        send(ws, { ...payload, sent: true });
        client.dmSessions.add(toId);
        toClient.dmSessions.add(clientId);
        break;
      }

      /* ─── DM typing indicator ─── */
      case 'dm_typing': {
        const toId     = data.to;
        const toClient = clients.get(toId);
        if (!toClient) return;
        send(toClient.ws, {
          type:     'dm_typing',
          from:     clientId,
          fromNick: client.user.nickname || 'Someone',
          isTyping: data.isTyping,
        });
        break;
      }

      /* ─── Check if a user is still online ─── */
      case 'dm_check_online': {
        const targetId = data.targetId;
        const target   = clients.get(targetId);
        send(ws, {
          type:   'dm_online_status',
          userId: targetId,
          online: !!(target && target.ws.readyState === WebSocket.OPEN),
          nickname: target?.user?.nickname || '',
        });
        break;
      }

      /* ─── Misc ─── */
      case 'report': {
        console.log(`[REPORT] ${clientId} reported for: ${data.reason}`);
        send(ws, { type: 'report_ack' });
        break;
      }

      case 'ping': {
        send(ws, { type: 'pong' });
        break;
      }
    }
  });

  ws.on('close', () => {
    console.log(`[-] ${clientId} disconnected | Total: ${clients.size - 1}`);
    disconnectPartner(clientId);
    leaveRoom(clientId);

    // Notify all DM partners this user went offline
    const client = clients.get(clientId);
    if (client && client.dmSessions) {
      client.dmSessions.forEach(partnerId => {
        const partner = clients.get(partnerId);
        if (partner) {
          send(partner.ws, {
            type:   'dm_online_status',
            userId: clientId,
            online: false,
            nickname: client.user?.nickname || '',
          });
        }
      });
    }

    const qi = waitingQueue.indexOf(clientId);
    if (qi !== -1) waitingQueue.splice(qi, 1);

    clients.delete(clientId);
    broadcastOnlineCount();
    broadcastRoomCounts();
    broadcastUserList();
  });

  ws.on('error', (err) => console.error(`[WS Error] ${clientId}:`, err.message));
});

/* ── Leave room helper ── */
function leaveRoom(clientId) {
  const client = clients.get(clientId);
  if (!client || !client.room) return;
  const roomId = client.room;
  rooms.get(roomId)?.delete(clientId);
  broadcastToRoom(roomId, { type: 'room_system', message: `${client.user.nickname || 'Someone'} left.`, time: timestamp() });
  client.room = null;
  broadcastRoomCounts();
}

/* ── Start ── */
server.listen(PORT, () => {
  console.log(`\n🚀 ChatNow running at http://localhost:${PORT}`);
  console.log(`📡 WebSocket ready | 💬 DM system enabled\n`);
});
