# ChatNow – Real-Time Chat Website

A fully real-time chat platform built with **Node.js**, **Express**, and **WebSockets** (ws library).

## Features

- ✅ **Real-time 1-on-1 Random Chat** — instantly paired with a live stranger
- ✅ **Real-time Group Chat Rooms** — 8 themed rooms (General, Singles, Gaming, Travel, Music, Tech, Sports, Adult)
- ✅ **Typing Indicators** — see when the other person is typing
- ✅ **Image Sharing** — send images in chat (up to 5MB)
- ✅ **Emoji Picker** — built-in emoji panel
- ✅ **Live Online Count** — real-time user count broadcast to all clients
- ✅ **Live Room Counts** — see how many people are in each room
- ✅ **Auto Reconnect** — client auto-reconnects if connection drops
- ✅ **Report & Block** — safety features for random chat
- ✅ **Skip / Stop** — skip to next stranger or stop chat
- ✅ **Responsive Design** — works on mobile, tablet, and desktop

---

## Quick Start

### 1. Install Node.js
Download and install Node.js (v16+) from https://nodejs.org

### 2. Install dependencies
```bash
cd chatnow-realtime
npm install
```

### 3. Start the server
```bash
npm start
```

### 4. Open in browser
```
http://localhost:3000
```

---

## Project Structure

```
chatnow-realtime/
├── server.js              ← Node.js WebSocket + Express server
├── package.json
└── public/
    ├── index.html         ← Landing page
    ├── start.html         ← Onboarding / profile setup
    ├── chat.html          ← Random 1-on-1 chat
    ├── rooms.html         ← Group chat rooms
<<<<<<< HEAD
    ├── dm.html            ← Direct Messages
    ├── about.html         ← About Us
    ├── contact.html       ← Contact Us (form + FAQ)
    ├── privacy.html       ← Privacy Policy
    ├── terms.html         ← Terms & Conditions
    ├── css/
    │   ├── style.css      ← Full dark theme stylesheet
    │   ├── dm.css         ← Direct Messages styles
    │   └── pages.css      ← About / Contact / Privacy / Terms styles
=======
    ├── css/
    │   └── style.css      ← Full dark theme stylesheet
>>>>>>> 89db5f14dcb822e3d094ba727cb6381951cae03c
    └── js/
        ├── socket.js      ← Shared WebSocket client (auto-reconnect)
        ├── chat-rt.js     ← Random chat real-time logic
        ├── rooms-rt.js    ← Rooms real-time logic
<<<<<<< HEAD
        ├── dm.js          ← Direct Messages real-time logic
=======
>>>>>>> 89db5f14dcb822e3d094ba727cb6381951cae03c
        └── main.js        ← Landing page animations
```

---

## How It Works

### WebSocket Message Protocol

**Client → Server:**
| type | payload | description |
|------|---------|-------------|
| `set_user` | `{nickname, gender, age, country}` | Set user profile |
| `start_random` | — | Start random chat pairing |
| `skip` | — | Skip current stranger |
| `stop` | — | End current chat |
| `message` | `{text}` | Send message to partner |
| `image` | `{src}` | Send image (base64) |
| `typing` | `{isTyping}` | Typing indicator |
| `join_room` | `{room}` | Join a chat room |
| `room_message` | `{text}` | Send message to room |
| `room_image` | `{src}` | Send image to room |
| `room_typing` | `{isTyping}` | Room typing indicator |
| `leave_room` | — | Leave current room |
| `report` | `{reason}` | Report current partner |
| `ping` | — | Heartbeat |

**Server → Client:**
| type | payload | description |
|------|---------|-------------|
| `online_count` | `{count}` | Total users online |
| `room_counts` | `{counts}` | Users per room |
| `waiting` | — | In pairing queue |
| `connected` | `{stranger}` | Paired with stranger |
| `message` | `{text, time}` | Incoming message |
| `image` | `{src, time}` | Incoming image |
| `typing` | `{isTyping}` | Partner typing |
| `stranger_left` | — | Partner disconnected |
| `room_joined` | `{room, count}` | Joined room successfully |
| `room_message` | `{author, text, time}` | Room message |
| `room_system` | `{message}` | Room system notice |
| `room_typing` | `{author, isTyping}` | Room typing |

---

## Deploy to Production

### Deploy on Render (Free)
1. Push to GitHub
2. Go to https://render.com → New Web Service
3. Connect your repo
4. Build command: `npm install`
5. Start command: `npm start`

### Deploy on Railway
```bash
npm install -g railway
railway login
railway init
railway up
```

### Deploy on VPS (Ubuntu)
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (process manager)
npm install -g pm2

# Start app
pm2 start server.js --name chatnow
pm2 save
pm2 startup
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |

---

## Safety & Moderation

- All reports are logged server-side with the reporter's client ID
- Users who are reported can be blocked by the reporting user
- The server does not store any messages — all chat is ephemeral
- No user data is persisted beyond the active session

---

## License

MIT License — free to use and modify for personal and commercial projects.
