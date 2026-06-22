/**
 * ChatNow – chat-rt.js
 * Real-time Random Chat (1-on-1 via WebSocket)
 * FIXED: connection race, disabled input, base64 escaping, image send
 */

/* ── DOM shortcuts ── */
const $ = id => document.getElementById(id);

/* ── Chat Sound Notification ── */
let chatSoundEnabled = localStorage.getItem('chatSoundEnabled') !== 'false'; // default ON

const _chatNotifAudio = new Audio('/sounds/notification.mp3');
function playChatSound() {
  if (!chatSoundEnabled) return;
  try {
    _chatNotifAudio.currentTime = 0;
    _chatNotifAudio.play().catch(() => {});
  } catch(e) {}
}

function toggleChatSound() {
  chatSoundEnabled = !chatSoundEnabled;
  localStorage.setItem('chatSoundEnabled', chatSoundEnabled);
  updateChatSoundBtn();
  if (chatSoundEnabled) playChatSound();
}

function updateChatSoundBtn() {
  const btn = document.getElementById('chatSoundBtn');
  if (!btn) return;
  if (chatSoundEnabled) {
    btn.innerHTML = '<i class="fa-solid fa-bell"></i>';
    btn.title = 'Notification sound: ON';
    btn.style.color = '';
  } else {
    btn.innerHTML = '<i class="fa-solid fa-bell-slash"></i>';
    btn.title = 'Notification sound: OFF';
    btn.style.color = 'var(--muted)';
  }
}

document.addEventListener('DOMContentLoaded', updateChatSoundBtn);


/* ── State ── */
let connected     = false;
let typingTimeout = null;
let isTypingSent  = false;
let myNick        = '';
let myGender      = '';
let myAge         = '';
let myCountry     = '';

/* ── Read URL params / saved user (after DOM ready) ── */
function initUser() {
  const urlP   = new URLSearchParams(location.search);
  const saved  = ChatSocket.getUser();
  myNick    = urlP.get('nickname') || saved.nickname || 'Anonymous';
  myGender  = urlP.get('gender')   || saved.gender   || '';
  myAge     = urlP.get('age')      || saved.age       || '';
  myCountry = urlP.get('country')  || saved.country   || '';

  $('myName').textContent   = myNick;
  $('myAvatar').textContent = avatarFor(myGender);
}

/* ── Avatar helper ── */
function avatarFor(gender) {
  if (gender === 'female') return ['🌸','💫','✨','🌻','💕'][Math.floor(Math.random()*5)];
  if (gender === 'male')   return ['😎','🙌','🧐','🤙','👾'][Math.floor(Math.random()*5)];
  return '🌍';
}

/* ── WS status bar ── */
function setWsStatus(state) {
  const el = $('wsStatus');
  if (!el) return;
  const map = {
    connecting: ['fa-circle-notch fa-spin', 'Connecting...',  '#f97316'],
    connected:  ['fa-circle',               'Connected',      '#22c55e'],
    searching:  ['fa-circle-notch fa-spin', 'Searching...',   '#00e5ff'],
    error:      ['fa-circle-xmark',         'Disconnected',   '#ef4444'],
  };
  const [icon, text, color] = map[state] || map.connecting;
  el.innerHTML = `<i class="fa-solid ${icon}" style="color:${color}"></i> ${text}`;
}

/* ── Time helper ── */
function timeNow() {
  const d = new Date();
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

/* ── Safe HTML escape (does NOT escape base64 & = %26) ── */
function escText(s) {
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

/* ── Message rendering ── */
function clearInitMsg() {
  const el = $('initMsg');
  if (el) el.remove();
}

function addMessage(text, type, isSystem) {
  clearInitMsg();
  const area = $('messagesArea');
  const div  = document.createElement('div');
  if (isSystem) {
    div.className = 'message system';
    div.textContent = text;
  } else {
    div.className = `message ${type}`;
    div.innerHTML  = `${escText(text)}<div class="msg-time">${timeNow()}</div>`;
  }
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function addImageMsg(src, type) {
  clearInitMsg();
  const area = $('messagesArea');
  const div  = document.createElement('div');
  div.className = `message ${type}`;
  // Use DOM to set src safely (avoids any attribute injection, preserves base64)
  const img  = document.createElement('img');
  img.src    = src;
  img.alt    = 'shared image';
  img.style.cssText = 'max-width:220px;border-radius:10px;display:block;margin-bottom:.25rem';
  img.loading = 'lazy';
  const time = document.createElement('div');
  time.className   = 'msg-time';
  time.textContent = timeNow();
  div.appendChild(img);
  div.appendChild(time);
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function addSystemMsg(text) { addMessage(text, '', true); }

/* ── Stranger state ── */
function setStranger(name, country, gender) {
  $('strangerName').textContent   = name ? `${name}${country ? ' '+country : ''}` : 'Stranger';
  $('strangerStatus').textContent = 'Connected — say hello!';
  $('strangerAvatar').textContent = avatarFor(gender);
  connected = true;
  enableInput(true);
  $('msgInput').focus();
}

function resetStranger() {
  $('strangerName').textContent   = 'Not connected';
  $('strangerStatus').textContent = 'Click "New Chat" to start';
  $('strangerAvatar').textContent = '🌍';
  connected = false;
  enableInput(false);
  $('typingIndicator').style.display = 'none';
}

function enableInput(on) {
  $('msgInput').disabled = !on;
  $('sendBtn').disabled  = !on;
  if (on) $('msgInput').placeholder = 'Type a message... (Enter to send)';
  else    $('msgInput').placeholder = 'Connect to a stranger first...';
}

/* ═══════════════════════════════════
   WebSocket event handlers
═══════════════════════════════════ */
ChatSocket
  .on('open', () => {
    setWsStatus('connected');
    ChatSocket.send({ type: 'set_user', nickname: myNick, gender: myGender, age: myAge, country: myCountry });
    ChatSocket.saveUser({ nickname: myNick, gender: myGender, age: myAge, country: myCountry });
  })

  .on('close', () => {
    setWsStatus('error');
    if (connected) {
      addSystemMsg('Connection lost. Reconnecting...');
      resetStranger();
    }
  })

  .on('reconnecting', () => setWsStatus('connecting'))

  .on('online_count', (d) => {
    const el = $('onlineCount');
    if (el) el.textContent = Number(d.count).toLocaleString();
  })

  .on('waiting', () => {
    setWsStatus('searching');
    $('strangerName').textContent   = 'Searching...';
    $('strangerStatus').textContent = 'Looking for a stranger...';
    $('strangerAvatar').textContent = '⏳';
  })

  .on('connected', (d) => {
    setWsStatus('connected');
    $('messagesArea').innerHTML = '';
    setStranger(d.stranger.name, d.stranger.country, d.stranger.gender);
    addSystemMsg(`🎉 Connected with ${d.stranger.name}. Say hello!`);
  })

  .on('message', (d) => {
    $('typingIndicator').style.display = 'none';
    addMessage(d.text, 'received', false);
    playChatSound();
  })

  .on('image', (d) => {
    $('typingIndicator').style.display = 'none';
    addImageMsg(d.src, 'received');
    playChatSound();
  })

  .on('typing', (d) => {
    const ti = $('typingIndicator');
    ti.style.display = d.isTyping ? 'flex' : 'none';
    if (d.isTyping) $('messagesArea').scrollTop = $('messagesArea').scrollHeight;
  })

  .on('stranger_left', () => {
    $('typingIndicator').style.display = 'none';
    addSystemMsg('Stranger has disconnected.');
    resetStranger();
    showReconnectPrompt();
  })

  .on('stopped', () => {
    addSystemMsg('Chat stopped.');
    resetStranger();
    showReconnectPrompt();
  });

/* ═══════════════════════════════════
   Actions
═══════════════════════════════════ */
function newChat() {
  $('messagesArea').innerHTML = '';
  resetStranger();
  if (!ChatSocket.isOpen()) {
    addSystemMsg('Connecting to server...');
    // Try again once open
    ChatSocket.on('open', function handler() {
      ChatSocket.off('open', handler);
      doStartRandom();
    });
    return;
  }
  doStartRandom();
}

function doStartRandom() {
  addSystemMsg('🔍 Finding someone to chat with...');
  ChatSocket.send({ type: 'start_random' });
  $('strangerStatus').textContent = 'Searching...';
}

function skipStranger() {
  if (!connected) { newChat(); return; }
  addSystemMsg('Skipping to next stranger...');
  connected = false;
  enableInput(false);
  ChatSocket.send({ type: 'skip' });
  $('strangerName').textContent   = 'Searching...';
  $('strangerStatus').textContent = 'Looking for a new stranger...';
  $('typingIndicator').style.display = 'none';
}

function stopChat() {
  ChatSocket.send({ type: 'stop' });
  addSystemMsg('You ended the chat.');
  resetStranger();
  showReconnectPrompt();
}

function showReconnectPrompt() {
  const area = $('messagesArea');
  const div  = document.createElement('div');
  div.className = 'message system';
  div.style.cssText = 'flex-direction:column;gap:.75rem;padding:1.25rem;text-align:center';
  const btn = document.createElement('button');
  btn.className = 'btn-hero';
  btn.style.cssText = 'margin:0 auto';
  btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Find New Stranger';
  btn.onclick = newChat;
  div.appendChild(document.createTextNode('Chat ended.'));
  div.appendChild(btn);
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

/* ── Send text message ── */
function sendMessage() {
  const input = $('msgInput');
  const text  = input.value.trim();
  if (!text) return;
  if (!connected) { showToast('Connect to a stranger first!', 'warn'); return; }
  if (!ChatSocket.isOpen()) { showToast('Not connected to server', 'warn'); return; }

  ChatSocket.send({ type: 'message', text });
  addMessage(text, 'sent', false);
  input.value = '';
  input.focus();

  if (isTypingSent) {
    ChatSocket.send({ type: 'typing', isTyping: false });
    isTypingSent = false;
    clearTimeout(typingTimeout);
  }
}

/* ── Send image ── */
function sendImage(event) {
  const file = event.target.files[0];
  event.target.value = '';           // reset so same file can be re-sent
  if (!file) return;
  if (!connected) { showToast('Connect to a stranger first!', 'warn'); return; }
  if (!ChatSocket.isOpen()) { showToast('Not connected to server', 'warn'); return; }
  if (file.size > 4 * 1024 * 1024) { showToast('Image too large (max 4MB)', 'warn'); return; }

  const reader = new FileReader();
  reader.onload = (e) => {
    const src = e.target.result;
    // Show immediately on sender side
    addImageMsg(src, 'sent');
    // Send over WebSocket
    const ok = ChatSocket.send({ type: 'image', src });
    if (!ok) showToast('Failed to send image', 'warn');
  };
  reader.onerror = () => showToast('Could not read image file', 'warn');
  reader.readAsDataURL(file);
}

/* ── Key handler ── */
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

/* ── Typing indicator ── */
function handleTyping() {
  if (!connected || !ChatSocket.isOpen()) return;
  if (!isTypingSent) {
    ChatSocket.send({ type: 'typing', isTyping: true });
    isTypingSent = true;
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    ChatSocket.send({ type: 'typing', isTyping: false });
    isTypingSent = false;
  }, 2000);
}

/* ── Report / Block ── */
function openReport() {
  if (!connected) return;
  $('reportModal').style.display = 'flex';
}
function submitReport(reason) {
  ChatSocket.send({ type: 'report', reason });
  closeModal('reportModal');
  showToast('User reported. Thanks! 🛡️', 'info');
  skipStranger();
}
function blockUser() {
  if (!connected) return;
  addSystemMsg('User blocked.');
  skipStranger();
}
function closeModal(id) { $(id).style.display = 'none'; }

/* ── Emoji picker ── */
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
      inp.selectionStart = inp.selectionEnd = pos + em.length;
      // Close picker
      const picker = btn.closest('.emoji-picker');
      if (picker) picker.style.display = 'none';
    });
    grid.appendChild(btn);
  });
}

function toggleEmojiPicker() {
  buildEmojiGrid('emojiGrid', 'msgInput');
  const p = $('emojiPicker');
  p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none';
}

document.addEventListener('click', (e) => {
  const picker = $('emojiPicker');
  if (picker && !e.target.closest('#emojiPicker') && !e.target.closest('.tool-btn')) {
    picker.style.display = 'none';
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
    pointerEvents: 'none',
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

/* ═══════════════════════════════════
   Init on DOM ready
=══════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initUser();
  setWsStatus('connecting');
  enableInput(false);
});
