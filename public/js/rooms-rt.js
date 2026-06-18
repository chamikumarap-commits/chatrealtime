/**
 * ChatNow – rooms-rt.js
 * Real-time Group Chat Rooms
 * FIXED: image send, typing, join flow, escaping
 */

const $r = id => document.getElementById(id);

/* ── State ── */
let currentRoom       = null;
let currentRoomLabel  = '';
let myNick            = '';
let myCountry         = '';
let roomTypingTimers  = {};
let roomTypingSent    = false;
let roomTypingTimeout = null;

/* ── Init user from session ── */
function initRoomsUser() {
  const saved  = ChatSocket.getUser();
  const urlP   = new URLSearchParams(location.search);
  myNick    = urlP.get('nickname') || saved.nickname || '';
  myCountry = urlP.get('country')  || saved.country  || '';
}

/* ── Safe text escape ── */
function escText(s) {
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function timeNow() {
  const d = new Date();
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

/* ═══════════════════════════════════
   WebSocket handlers
═══════════════════════════════════ */
ChatSocket
  .on('open', () => {
    const saved = ChatSocket.getUser();
    if (saved && saved.nickname) {
      myNick    = myNick    || saved.nickname;
      myCountry = myCountry || saved.country || '';
      ChatSocket.send({ type: 'set_user', ...saved });
    }
  })

  .on('online_count', (d) => {
    const el = $r('onlineCount');
    if (el) el.textContent = Number(d.count).toLocaleString();
  })

  .on('room_counts', (d) => {
    Object.entries(d.counts).forEach(([room, count]) => {
      document.querySelectorAll(`.rc[data-room="${room}"]`).forEach(el => {
        el.textContent = count > 0 ? `${count} online` : '0 online';
      });
    });
    if (currentRoom && d.counts[currentRoom] !== undefined) {
      const lc = document.querySelector('.rc-live');
      if (lc) lc.textContent = d.counts[currentRoom];
    }
  })

  .on('room_joined', (d) => {
    const overlay = $r('roomChatOverlay');
    overlay.style.display = 'flex';
    $r('roomMessages').innerHTML = '';
    addRoomSystem(`✅ You joined ${currentRoomLabel}. Say hello! 👋`);
  })

  .on('room_system', (d) => {
    addRoomSystem(d.message);
  })

  .on('room_message', (d) => {
    clearRoomTyping(d.author);
    addRoomMsgBubble(d.author, d.country || '', d.text, false);
  })

  .on('room_image', (d) => {
    clearRoomTyping(d.author);
    addRoomImgBubble(d.author, d.country || '', d.src, false);
  })

  .on('room_typing', (d) => {
    if (d.author === myNick) return; // don't show our own typing
    handleRoomTypingIndicator(d.author, d.isTyping);
  })

  .on('room_left', () => {
    currentRoom = null;
    $r('roomChatOverlay').style.display = 'none';
  });

/* ═══════════════════════════════════
   Message helpers
═══════════════════════════════════ */
function scrollRoomToBottom() {
  const m = $r('roomMessages');
  if (m) m.scrollTop = m.scrollHeight;
}

function addRoomSystem(text) {
  const div = document.createElement('div');
  div.className = 'message system';
  div.textContent = text;
  $r('roomMessages').appendChild(div);
  scrollRoomToBottom();
}

function makeAuthorLabel(author, country) {
  const el = document.createElement('div');
  el.style.cssText = 'font-size:.72rem;color:#7c8db5;padding:0 .5rem;font-weight:600;margin-bottom:2px;';
  el.textContent = country ? `${author} ${country}` : author;
  return el;
}

function addRoomMsgBubble(author, country, text, isMine) {
  const wrap  = document.createElement('div');
  wrap.style.cssText = `display:flex;flex-direction:column;align-items:${isMine?'flex-end':'flex-start'};gap:0;animation:msgIn .2s ease;margin-bottom:.25rem;`;

  if (!isMine) wrap.appendChild(makeAuthorLabel(author, country));

  const bubble = document.createElement('div');
  bubble.className = `message ${isMine ? 'sent' : 'received'}`;
  bubble.style.maxWidth = '70%';
  bubble.innerHTML = `${escText(text)}<div class="msg-time">${timeNow()}</div>`;
  wrap.appendChild(bubble);

  $r('roomMessages').appendChild(wrap);
  scrollRoomToBottom();
}

function addRoomImgBubble(author, country, src, isMine) {
  const wrap = document.createElement('div');
  wrap.style.cssText = `display:flex;flex-direction:column;align-items:${isMine?'flex-end':'flex-start'};gap:0;animation:msgIn .2s ease;margin-bottom:.25rem;`;

  if (!isMine) wrap.appendChild(makeAuthorLabel(author, country));

  const bubble = document.createElement('div');
  bubble.className = `message ${isMine ? 'sent' : 'received'}`;
  bubble.style.maxWidth = '70%';

  const img = document.createElement('img');
  img.src   = src;
  img.alt   = 'shared image';
  img.style.cssText = 'max-width:220px;border-radius:10px;display:block;margin-bottom:.25rem';
  img.loading = 'lazy';

  const time = document.createElement('div');
  time.className   = 'msg-time';
  time.textContent = timeNow();

  bubble.appendChild(img);
  bubble.appendChild(time);
  wrap.appendChild(bubble);
  $r('roomMessages').appendChild(wrap);
  scrollRoomToBottom();
}

/* ── Typing indicator (multiple users) ── */
function handleRoomTypingIndicator(author, isTyping) {
  clearTimeout(roomTypingTimers[author]);
  if (isTyping) {
    roomTypingTimers[author] = setTimeout(() => clearRoomTyping(author), 3500);
    $r('roomTypingName').textContent = author;
    $r('roomTyping').style.display = 'flex';
  } else {
    clearRoomTyping(author);
  }
}

function clearRoomTyping(author) {
  clearTimeout(roomTypingTimers[author]);
  delete roomTypingTimers[author];
  if (Object.keys(roomTypingTimers).length === 0) {
    const el = $r('roomTyping');
    if (el) el.style.display = 'none';
  }
}

/* ═══════════════════════════════════
   Join room
=══════════════════════════════════ */
function joinRoom(roomId, label) {
  currentRoom      = roomId;
  currentRoomLabel = label;
  $r('roomChatTitle').textContent = label;

  if (myNick) {
    doJoin();
  } else {
    $r('joinRoomTitle').textContent = `Join ${label}`;
    $r('joinModal').style.display = 'flex';
    setTimeout(() => $r('joinNickname').focus(), 100);
  }
}

function confirmJoin() {
  const nick = $r('joinNickname').value.trim();
  if (!nick) { showToast('Please enter a nickname!', 'warn'); return; }
  myNick = nick;

  const saved = ChatSocket.getUser();
  const user  = { ...saved, nickname: nick };
  ChatSocket.saveUser(user);
  ChatSocket.send({ type: 'set_user', ...user });

  closeModal('joinModal');
  doJoin();
}

function doJoin() {
  if (!ChatSocket.isOpen()) {
    showToast('Connecting... please wait a moment', 'warn');
    const handler = () => {
      ChatSocket.off('open', handler);
      setTimeout(doJoin, 200);
    };
    ChatSocket.on('open', handler);
    return;
  }
  ChatSocket.send({ type: 'join_room', room: currentRoom });
}

function leaveRoom() {
  ChatSocket.send({ type: 'leave_room' });
  currentRoom = null;
  $r('roomChatOverlay').style.display = 'none';
  Object.keys(roomTypingTimers).forEach(clearRoomTyping);
}

/* ═══════════════════════════════════
   Send messages
=══════════════════════════════════ */
function sendRoomMessage() {
  const inp  = $r('roomMsgInput');
  const text = inp.value.trim();
  if (!text) return;
  if (!currentRoom) { showToast('Join a room first!', 'warn'); return; }
  if (!ChatSocket.isOpen()) { showToast('Not connected to server', 'warn'); return; }

  ChatSocket.send({ type: 'room_message', text });
  addRoomMsgBubble(myNick, myCountry, text, true);
  inp.value = '';
  inp.focus();

  if (roomTypingSent) {
    ChatSocket.send({ type: 'room_typing', isTyping: false });
    roomTypingSent = false;
    clearTimeout(roomTypingTimeout);
  }
}

function sendRoomImage(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (!currentRoom) { showToast('Join a room first!', 'warn'); return; }
  if (!ChatSocket.isOpen()) { showToast('Not connected to server', 'warn'); return; }
  if (file.size > 4 * 1024 * 1024) { showToast('Image too large (max 4MB)', 'warn'); return; }

  const reader = new FileReader();
  reader.onload = (e) => {
    const src = e.target.result;
    addRoomImgBubble(myNick, myCountry, src, true);
    const ok = ChatSocket.send({ type: 'room_image', src });
    if (!ok) showToast('Failed to send image', 'warn');
  };
  reader.onerror = () => showToast('Could not read image', 'warn');
  reader.readAsDataURL(file);
}

/* ── Room typing indicator ── */
function handleRoomTyping() {
  if (!currentRoom || !ChatSocket.isOpen()) return;
  if (!roomTypingSent) {
    ChatSocket.send({ type: 'room_typing', isTyping: true });
    roomTypingSent = true;
  }
  clearTimeout(roomTypingTimeout);
  roomTypingTimeout = setTimeout(() => {
    ChatSocket.send({ type: 'room_typing', isTyping: false });
    roomTypingSent = false;
  }, 2000);
}

/* ── Filter rooms search ── */
function filterRooms() {
  const q = ($r('roomSearch')?.value || '').toLowerCase();
  document.querySelectorAll('.room-big-card').forEach(card => {
    card.style.display = (card.dataset.name || '').toLowerCase().includes(q) ? '' : 'none';
  });
}

/* ── Emoji picker ── */
const EMOJIS = ['😀','😂','😍','🥰','😎','🤔','😢','😡','👍','👎','❤️','🔥','✨','🎉','💯',
  '🙏','👏','💪','🤣','😭','😘','🤩','😏','🙄','😴','🤯','🥳','😇','🤗','😅',
  '💬','🌍','🌸','💕','🎮','⚽','🎵','💻','✈️','🍕','☕','🌙','⭐','🌈','🐶','🐱'];

function buildEmojiGrid(gridId, inputId) {
  const grid = $r(gridId);
  if (!grid || grid.children.length > 0) return;
  EMOJIS.forEach(em => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = em;
    btn.type = 'button';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const inp = $r(inputId);
      const pos = inp.selectionStart || inp.value.length;
      inp.value = inp.value.slice(0, pos) + em + inp.value.slice(pos);
      inp.focus();
      inp.selectionStart = inp.selectionEnd = pos + em.length;
      btn.closest('.emoji-picker').style.display = 'none';
    });
    grid.appendChild(btn);
  });
}

function toggleRoomEmoji() {
  buildEmojiGrid('roomEmojiGrid', 'roomMsgInput');
  const p = $r('roomEmojiPicker');
  if (p) p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none';
}

document.addEventListener('click', (e) => {
  const rp = $r('roomEmojiPicker');
  if (rp && !e.target.closest('#roomEmojiPicker') && !e.target.closest('.tool-btn')) {
    rp.style.display = 'none';
  }
});

/* ── Modals ── */
function closeModal(id) {
  const el = $r(id);
  if (el) el.style.display = 'none';
}

/* ── Key handler for room input ── */
document.addEventListener('DOMContentLoaded', () => {
  const inp = $r('roomMsgInput');
  if (inp) {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendRoomMessage(); }
    });
  }
  const joinInp = $r('joinNickname');
  if (joinInp) {
    joinInp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmJoin();
    });
  }

  initRoomsUser();

  // Auto-open room from URL param
  const urlRoom = new URLSearchParams(location.search).get('room');
  const roomLabelMap = {
    general:'💬 General Chat', singles:'💕 Singles Chat', gaming:'🎮 Gaming',
    travel:'✈️ Travel', music:'🎵 Music & Arts', tech:'💻 Tech Talk',
    sports:'⚽ Sports', adult:'🔞 18+ Adult',
  };
  if (urlRoom && roomLabelMap[urlRoom]) {
    setTimeout(() => joinRoom(urlRoom, roomLabelMap[urlRoom]), 600);
  }
});

/* ── Toast ── */
function showToast(msg, type = 'info') {
  document.querySelectorAll('.chatnow-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'chatnow-toast';
  Object.assign(t.style, {
    position:'fixed', bottom:'2rem', left:'50%',
    transform:'translateX(-50%) translateY(20px)',
    background: type === 'warn' ? '#f97316' : '#00e5ff',
    color:'#0a0b14', fontWeight:'700', padding:'.75rem 1.5rem',
    borderRadius:'50px', fontSize:'.88rem', zIndex:'9999',
    opacity:'0', transition:'all .3s ease', whiteSpace:'nowrap',
    boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
    pointerEvents:'none',
  });
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => {
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}
