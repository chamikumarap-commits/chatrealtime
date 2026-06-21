/**
 * ChatNow – dm.js
 * Direct Messages – full real-time client
 */

/* ── DOM ── */
const $ = id => document.getElementById(id);

/* ── State ── */
let myId         = null;    // server-assigned clientId
let myNick       = '';
let myGender     = '';
let myCountry    = '';
let activeDM     = null;    // { id, nickname, country, online }
let dmTypingTimeout = null;
let dmTypingSent = false;

// conversations: Map<userId, { messages: [], unread: 0, nickname, country, online }>
const conversations = new Map();

/* ═══════════════════════════════════════
   Init
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const saved = ChatSocket.getUser();
  myNick    = saved.nickname || '';
  myGender  = saved.gender   || '';
  myCountry = saved.country  || '';

  if (myNick) {
    $('myNickname').textContent   = myNick;
    $('myAvatar').textContent     = avatarFor(myGender);
  } else {
    // Prompt for nickname
    setTimeout(() => { $('nickModal').style.display = 'flex'; $('nickInput').focus(); }, 400);
  }
  setWsPill('connecting');
});

/* ── Save nickname from modal ── */
function saveNickname() {
  const nick = $('nickInput').value.trim();
  if (!nick) { showToast('Please enter a nickname', 'warn'); return; }
  myNick = nick;
  ChatSocket.saveUser({ nickname: nick, gender: myGender, country: myCountry });
  $('myNickname').textContent = nick;
  $('myAvatar').textContent   = avatarFor(myGender);
  $('nickModal').style.display = 'none';
  ChatSocket.send({ type: 'set_user', nickname: nick, gender: myGender, country: myCountry });
  ChatSocket.send({ type: 'get_user_list' });
}
$('nickInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveNickname(); });
function showTopAlert(message) {
  const alertBox = document.getElementById("topAlert");
  if (!alertBox) return;

  alertBox.textContent = message;
  alertBox.style.display = "block";

  setTimeout(() => {
    alertBox.style.display = "none";
  }, 3000); // 3 seconds
}
/* ── Avatar helper ── */
function avatarFor(gender) {
  if (gender === 'female') return ['🌸','💫','✨','🌻','💕'][Math.floor(Math.random()*5)];
  if (gender === 'male')   return ['😎','🙌','🧐','🤙','👾'][Math.floor(Math.random()*5)];
  return ['🌍','🌎','🌏','😊','✨'][Math.floor(Math.random()*5)];
}

function countryFlag(country) {
  return country || '🌍';
}

/* ── WS pill status ── */
function setWsPill(state) {
  const el = $('wsPill');
  if (!el) return;
  const map = {
    connecting: ['fa-circle-notch fa-spin','Connecting...','#f97316'],
    connected:  ['fa-circle','Online','#22c55e'],
    error:      ['fa-circle-xmark','Offline','#ef4444'],
  };
  const [icon, text, color] = map[state] || map.connecting;
  el.innerHTML = `<i class="fa-solid ${icon}" style="color:${color};margin-right:.3rem"></i>${text}`;
}

/* ═══════════════════════════════════════
   WebSocket Handlers
═══════════════════════════════════════ */
ChatSocket
  .on('open', () => {
    setWsPill('connected');
    if (myNick) {
      ChatSocket.send({ type: 'set_user', nickname: myNick, gender: myGender, country: myCountry });
      ChatSocket.send({ type: 'get_user_list' });
    }
  })
  .on('close',       () => setWsPill('error'))
  .on('reconnecting',() => setWsPill('connecting'))

  .on('user_set', (d) => {
    myId = d.myId;
    ChatSocket.send({ type: 'get_user_list' });
  })

  .on('user_list', (d) => {
    renderUserList(d.users || []);
  })

  .on('online_count', (d) => {
    /* optional: show in header */
  })

  /* ── Incoming DM text ── */
  .on('dm_message', (d) => {
    const fromId   = d.from;
    const isSent   = !!d.sent; // echo back to sender

    ensureConversation(fromId, d.fromNick, d.fromCountry);
    const conv = conversations.get(fromId);
    if (!conv) return;

    const msg = { type: 'text', text: d.text, time: d.time, sent: isSent };
    conv.messages.push(msg);
    conv.lastText = d.text;
    conv.lastTime = d.time;

    if (activeDM && activeDM.id === fromId) {
      appendDMBubble(msg, isSent);
    } else if (!isSent) {
      // Unread from someone we're not looking at
      conv.unread = (conv.unread || 0) + 1;
      showToast(`💬 ${d.fromNick}: ${d.text.slice(0, 40)}`, 'info');
    }

    updateRecentList();
    updateUserRowUnread(fromId, conv.unread || 0);
  })

  /* ── Incoming DM image ── */
  .on('dm_image', (d) => {
    const fromId = d.from;
    const isSent = !!d.sent;

    ensureConversation(fromId, d.fromNick, d.fromCountry);
    const conv = conversations.get(fromId);
    if (!conv) return;

    const msg = { type: 'image', src: d.src, time: d.time, sent: isSent };
    conv.messages.push(msg);
    conv.lastText = '📷 Image';
    conv.lastTime = d.time;

    if (activeDM && activeDM.id === fromId) {
      appendDMBubble(msg, isSent);
    } else if (!isSent) {
      conv.unread = (conv.unread || 0) + 1;
      showToast(`📷 ${d.fromNick} sent an image`, 'info');
    }

    updateRecentList();
    updateUserRowUnread(fromId, conv.unread || 0);
  })

  /* ── DM typing ── */
  .on('dm_typing', (d) => {
    if (!activeDM || activeDM.id !== d.from) return;
    const el = $('dmTyping');
    $('dmTypingName').textContent = d.fromNick;
    el.style.display = d.isTyping ? 'flex' : 'none';
    if (d.isTyping) $('dmMessages').scrollTop = $('dmMessages').scrollHeight;
  })

  /* ── Online status change ── */
  .on('dm_online_status', (d) => {
    // Update conversation map
    if (conversations.has(d.userId)) {
      conversations.get(d.userId).online = d.online;
    }
    // Update user row dot
    updateUserRowStatus(d.userId, d.online);
    // Update active conversation header
    if (activeDM && activeDM.id === d.userId) {
      activeDM.online = d.online;
      updateConvHeader();
      if (!d.online) {
        addDMSysMsg(`${d.nickname || 'User'} went offline.`);
      }
    }
  })

  .on('dm_error', (d) => {
    showToast(d.message || 'Could not deliver message', 'warn');
    if (activeDM && activeDM.id === d.to) {
      addDMSysMsg('⚠️ ' + (d.message || 'Message not delivered.'));
      activeDM.online = false;
      updateConvHeader();
    }
  });

/* ═══════════════════════════════════════
   User List Rendering
═══════════════════════════════════════ */
function renderUserList(users) {
  const list  = $('userList');
  const count = $('userCount');
  const empty = $('emptyUsers');

  // Update conversation online states
  const onlineIds = new Set(users.map(u => u.id));
  conversations.forEach((conv, id) => { conv.online = onlineIds.has(id); });

  if (users.length === 0) {
    if (empty) empty.style.display = 'flex';
    count.textContent = '0';
    return;
  }
  if (empty) empty.style.display = 'none';
  count.textContent = users.length;

  // Preserve active selection
  const query = ($('userSearch')?.value || '').toLowerCase();

  list.innerHTML = '';
  users
    .filter(u => !query || u.nickname.toLowerCase().includes(query))
    .sort((a,b) => a.nickname.localeCompare(b.nickname))
    .forEach(u => {
      const row = buildUserRow(u);
      list.appendChild(row);
    });
}

function buildUserRow(u) {
  const conv   = conversations.get(u.id);
  const unread = conv?.unread || 0;

  const row  = document.createElement('div');
  row.className = 'dm-user-row' +
    (activeDM?.id === u.id ? ' active' : '') +
    (unread > 0 ? ' unread' : '');
  row.dataset.userId = u.id;
  row.onclick = () => openDM(u);

  const av   = document.createElement('div');
  av.className   = 'dm-avatar sm';
  av.textContent = avatarFor(u.gender);

  const meta = document.createElement('div');
  meta.className = 'dm-user-meta';
  meta.innerHTML = `<strong>${escText(u.nickname)} <span style="font-weight:400;font-size:.72rem">${u.country || ''}</span></strong>
    <span><i class="fa-solid fa-circle" style="font-size:.45rem;color:var(--green)"></i> Online</span>`;

  row.appendChild(av);
  row.appendChild(meta);

  if (unread > 0) {
    const badge = document.createElement('div');
    badge.className   = 'dm-unread-badge';
    badge.textContent = unread > 99 ? '99+' : unread;
    row.appendChild(badge);
  }

  return row;
}

function updateUserRowUnread(userId, count) {
  const row = document.querySelector(`.dm-user-row[data-user-id="${userId}"]`);
  if (!row) return;
  let badge = row.querySelector('.dm-unread-badge');
  if (count > 0) {
    if (!badge) { badge = document.createElement('div'); badge.className = 'dm-unread-badge'; row.appendChild(badge); }
    badge.textContent = count > 99 ? '99+' : count;
    row.classList.add('unread');
  } else {
    badge?.remove();
    row.classList.remove('unread');
  }
}

function updateUserRowStatus(userId, online) {
  const row = document.querySelector(`.dm-user-row[data-user-id="${userId}"]`);
  if (!row) return;
  const dot = row.querySelector('.fa-circle');
  if (dot) dot.style.color = online ? 'var(--green)' : 'var(--muted)';
  const statusSpan = row.querySelector('.dm-user-meta span');
  if (statusSpan) statusSpan.innerHTML =
    `<i class="fa-solid fa-circle" style="font-size:.45rem;color:${online ? 'var(--green)' : 'var(--muted)'}"></i> ${online ? 'Online' : 'Offline'}`;
}

function filterUsers() {
  const q = $('userSearch').value.toLowerCase();
  document.querySelectorAll('.dm-user-row').forEach(row => {
    const nick = (row.querySelector('strong')?.textContent || '').toLowerCase();
    row.style.display = nick.includes(q) ? '' : 'none';
  });
}

/* ═══════════════════════════════════════
   Open / Close DM
═══════════════════════════════════════ */
function openDM(user) {
  activeDM = { id: user.id, nickname: user.nickname, country: user.country || '', gender: user.gender || '', online: true };

  // Clear unread
  if (conversations.has(user.id)) {
    conversations.get(user.id).unread = 0;
  }
  updateUserRowUnread(user.id, 0);

  // Highlight active row
  document.querySelectorAll('.dm-user-row').forEach(r => r.classList.remove('active'));
  const row = document.querySelector(`.dm-user-row[data-user-id="${user.id}"]`);
  if (row) row.classList.add('active');

  // Update conv header
  updateConvHeader();

  // Render message history
  renderDMHistory(user.id);

  // Show conversation panel
  $('dmWelcome').style.display      = 'none';
  $('dmConversation').style.display = 'flex';

  // Mobile: hide sidebar
  $('dmSidebar')?.classList.add('hidden');

  $('dmInput').focus();

  // Check online status
  ChatSocket.send({ type: 'dm_check_online', targetId: user.id });
}

function closeDM() {
  activeDM = null;
  $('dmConversation').style.display = 'none';
  $('dmWelcome').style.display      = 'flex';
  // Mobile: show sidebar
  document.querySelector('.dm-sidebar')?.classList.remove('hidden');
  document.querySelectorAll('.dm-user-row').forEach(r => r.classList.remove('active'));
}

function updateConvHeader() {
  if (!activeDM) return;
  $('convName').textContent   = activeDM.nickname + (activeDM.country ? ' ' + activeDM.country : '');
  $('convAvatar').textContent = avatarFor(activeDM.gender);
  const statusEl = $('convStatus');
  if (activeDM.online) {
    statusEl.className = 'dm-conv-status online';
    statusEl.innerHTML = '<i class="fa-solid fa-circle"></i> Online';
  } else {
    statusEl.className = 'dm-conv-status offline';
    statusEl.innerHTML = '<i class="fa-solid fa-circle"></i> Offline';
  }
}

/* ═══════════════════════════════════════
   Conversation History
═══════════════════════════════════════ */
function ensureConversation(userId, nickname, country) {
  if (!conversations.has(userId)) {
    conversations.set(userId, { messages: [], unread: 0, nickname, country, online: true });
    updateRecentList();
  } else {
    const c = conversations.get(userId);
    if (nickname) c.nickname = nickname;
    if (country)  c.country  = country;
  }
}

function renderDMHistory(userId) {
  const area = $('dmMessages');
  area.innerHTML = '';

  // Conv start marker
  const start = document.createElement('div');
  start.className = 'dm-conv-start';
  start.innerHTML = '<i class="fa-solid fa-lock"></i><p>This is the beginning of your private conversation.</p>';
  area.appendChild(start);

  const conv = conversations.get(userId);
  if (conv && conv.messages.length > 0) {
    conv.messages.forEach(msg => appendDMBubble(msg, msg.sent));
  }
  area.scrollTop = area.scrollHeight;
}

function appendDMBubble(msg, isSent) {
  const area = $('dmMessages');
  const wrap = document.createElement('div');
  wrap.className = `dm-msg-wrap ${isSent ? 'sent' : 'received'}`;

  const bubble = document.createElement('div');
  bubble.className = `dm-bubble ${isSent ? 'sent' : 'received'}`;

  if (msg.type === 'image') {
    const img     = document.createElement('img');
    img.src       = msg.src;
    img.alt       = 'image';
    img.loading   = 'lazy';
    bubble.appendChild(img);
  } else {
    const textNode = document.createTextNode(msg.text);
    bubble.appendChild(textNode);
  }

  const time = document.createElement('div');
  time.className   = 'msg-time';
  time.textContent = msg.time || timeNow();
  bubble.appendChild(time);

  wrap.appendChild(bubble);
  area.appendChild(wrap);
  area.scrollTop = area.scrollHeight;
}

function addDMSysMsg(text) {
  const area = $('dmMessages');
  const div  = document.createElement('div');
  div.className   = 'dm-sys-msg';
  div.textContent = text;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

/* ── Recent list (sidebar bottom) ── */
function updateRecentList() {
  const list  = $('recentList');
  const label = $('recentLabel');
  if (!list) return;

  const recents = [...conversations.entries()]
    .filter(([, c]) => c.messages.length > 0)
    .sort((a, b) => (b[1].lastTime || '').localeCompare(a[1].lastTime || ''));

  if (recents.length === 0) {
    label.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  label.style.display = 'flex';
  list.innerHTML = '';

  recents.slice(0, 8).forEach(([userId, conv]) => {
    const row  = document.createElement('div');
    row.className = 'dm-user-row' + (activeDM?.id === userId ? ' active' : '');
    row.onclick   = () => openDM({ id: userId, nickname: conv.nickname, country: conv.country, gender: '' });

    const av   = document.createElement('div');
    av.className   = 'dm-avatar sm';
    av.textContent = '💬';

    const meta = document.createElement('div');
    meta.className = 'dm-user-meta';
    meta.innerHTML = `<strong>${escText(conv.nickname)}</strong>
      <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;display:block">${escText(conv.lastText || '')}</span>`;

    row.appendChild(av);
    row.appendChild(meta);

    if (conv.unread > 0) {
      const badge = document.createElement('div');
      badge.className   = 'dm-unread-badge';
      badge.textContent = conv.unread;
      row.appendChild(badge);
    }

    list.appendChild(row);
  });
}

/* ═══════════════════════════════════════
   Send DM
═══════════════════════════════════════ */
function sendDM() {
  const input = $('dmInput');
  const text  = input.value.trim();
  if (!text) return;
  if (!activeDM) { showToast('Select a user first', 'warn'); return; }
  if (!ChatSocket.isOpen()) { showToast('Not connected', 'warn'); return; }

  ChatSocket.send({ type: 'dm_message', to: activeDM.id, text });

  // Optimistically show in UI (server will echo back with sent:true, but we handle dedup via sent flag)
  ensureConversation(activeDM.id, activeDM.nickname, activeDM.country);
  const msg = { type: 'text', text, time: timeNow(), sent: true };
  conversations.get(activeDM.id).messages.push(msg);
  conversations.get(activeDM.id).lastText = text;
  conversations.get(activeDM.id).lastTime = msg.time;
  appendDMBubble(msg, true);
  updateRecentList();

  input.value = '';
  input.focus();

  if (dmTypingSent) {
    ChatSocket.send({ type: 'dm_typing', to: activeDM.id, isTyping: false });
    dmTypingSent = false;
    clearTimeout(dmTypingTimeout);
  }
}

function sendDMImage(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (!activeDM) { showToast('Select a user first', 'warn'); return; }
  if (!ChatSocket.isOpen()) { showToast('Not connected', 'warn'); return; }
  if (file.size > 4 * 1024 * 1024) { showToast('Image too large (max 4MB)', 'warn'); return; }

  const reader = new FileReader();
  reader.onload = (e) => {
    const src = e.target.result;
    ChatSocket.send({ type: 'dm_image', to: activeDM.id, src });

    ensureConversation(activeDM.id, activeDM.nickname, activeDM.country);
    const msg = { type: 'image', src, time: timeNow(), sent: true };
    conversations.get(activeDM.id).messages.push(msg);
    conversations.get(activeDM.id).lastText = '📷 Image';
    conversations.get(activeDM.id).lastTime = msg.time;
    appendDMBubble(msg, true);
    updateRecentList();
  };
  reader.onerror = () => showToast('Could not read image', 'warn');
  reader.readAsDataURL(file);
}

/* ── Key handler ── */
function dmHandleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDM(); }
}

/* ── Typing indicator ── */
function dmHandleTyping() {
  if (!activeDM || !ChatSocket.isOpen()) return;
  if (!dmTypingSent) {
    ChatSocket.send({ type: 'dm_typing', to: activeDM.id, isTyping: true });
    dmTypingSent = true;
  }
  clearTimeout(dmTypingTimeout);
  dmTypingTimeout = setTimeout(() => {
    if (activeDM) ChatSocket.send({ type: 'dm_typing', to: activeDM.id, isTyping: false });
    dmTypingSent = false;
  }, 2000);
}

/* ── Clear & block ── */
function clearDMHistory() {
  if (!activeDM) return;
  if (!confirm('Clear this conversation? (Local only)')) return;
  if (conversations.has(activeDM.id)) {
    conversations.get(activeDM.id).messages = [];
    conversations.get(activeDM.id).unread   = 0;
  }
  renderDMHistory(activeDM.id);
  updateRecentList();
}

function blockDMUser() {
  if (!activeDM) return;
  if (!confirm(`Block ${activeDM.nickname}? You won't receive messages from them.`)) return;
  conversations.delete(activeDM.id);
  closeDM();
  updateRecentList();
  showToast(`${activeDM.nickname} blocked.`, 'info');
}

/* ═══════════════════════════════════════
   Emoji Picker
═══════════════════════════════════════ */
const EMOJIS = ['😀','😂','😍','🥰','😎','🤔','😢','😡','👍','👎','❤️','🔥','✨','🎉','💯',
  '🙏','👏','💪','🤣','😭','😘','🤩','😏','🙄','😴','🤯','🥳','😇','🤗','😅',
  '💬','🌍','🌸','💕','🎮','⚽','🎵','💻','✈️','🍕','☕','🌙','⭐','🌈','🐶','🐱'];

function buildEmojiGrid(gridId, inputId) {
  const grid = $(gridId);
  if (!grid || grid.children.length > 0) return;
  EMOJIS.forEach(em => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = em;
    btn.type = 'button';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const inp = $(inputId);
      const pos = inp.selectionStart || inp.value.length;
      inp.value = inp.value.slice(0, pos) + em + inp.value.slice(pos);
      inp.focus();
      btn.closest('.emoji-picker').style.display = 'none';
    });
    grid.appendChild(btn);
  });
}

function toggleDMEmoji() {
  buildEmojiGrid('dmEmojiGrid', 'dmInput');
  const p = $('dmEmojiPicker');
  if (p) p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none';
}

document.addEventListener('click', (e) => {
  const p = $('dmEmojiPicker');
  if (p && !e.target.closest('#dmEmojiPicker') && !e.target.closest('.tool-btn')) {
    p.style.display = 'none';
  }
});

/* ═══════════════════════════════════════
   Helpers
═══════════════════════════════════════ */
function timeNow() {
  const d = new Date();
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

function escText(s) {
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

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
    boxShadow:'0 8px 32px rgba(0,0,0,.5)', pointerEvents:'none',
  });
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity='1'; t.style.transform='translateX(-50%) translateY(0)'; });
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(-50%) translateY(20px)'; setTimeout(()=>t.remove(),300); }, 3500);
}
