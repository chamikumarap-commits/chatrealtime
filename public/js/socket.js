/**
 * ChatNow – socket.js
 * Shared WebSocket client with auto-reconnect
 * FIXED: deferred connect so page scripts can register handlers first
 */

const ChatSocket = (() => {
  let ws        = null;
  let handlers  = {};
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  let intentionalClose = false;
  let _pingInterval = null;

  function getWsUrl() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}`;
  }

  function connect() {
    intentionalClose = false;
    try {
      ws = new WebSocket(getWsUrl());
    } catch(e) {
      console.error('WS connect error:', e);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      reconnectDelay = 1000;
      clearTimeout(reconnectTimer);
      clearInterval(_pingInterval);

      // Heartbeat every 25s to keep connection alive
      _pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);

      // Restore user profile if stored
      const user = api.getUser();
      if (user && user.nickname) {
        api.send({ type: 'set_user', ...user });
      }

      trigger('open');
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        trigger(data.type, data);
        trigger('*', data);
      } catch(err) {
        console.warn('WS parse error:', err);
      }
    };

    ws.onclose = (evt) => {
      clearInterval(_pingInterval);
      trigger('close');
      if (!intentionalClose) {
        trigger('reconnecting', { delay: reconnectDelay });
        scheduleReconnect();
      }
    };

    ws.onerror = (err) => {
      console.warn('WS error:', err.message || err);
      trigger('error');
    };
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
      connect();
    }, reconnectDelay);
  }

  function trigger(event, data) {
    const list = handlers[event];
    if (list) list.forEach(fn => { try { fn(data); } catch(e) { console.error('Handler error:', e); } });
  }

  const api = {
    connect,

    on(event, fn) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(fn);
      return this;
    },

    off(event, fn) {
      if (handlers[event]) handlers[event] = handlers[event].filter(f => f !== fn);
      return this;
    },

    send(data) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(data));
          return true;
        } catch(e) {
          console.error('WS send error:', e);
        }
      }
      return false;
    },

    close() {
      intentionalClose = true;
      clearInterval(_pingInterval);
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    },

    isOpen() {
      return !!(ws && ws.readyState === WebSocket.OPEN);
    },

    saveUser(user) {
      try { sessionStorage.setItem('chatnow_user', JSON.stringify(user)); } catch(e) {}
    },

    getUser() {
      try { return JSON.parse(sessionStorage.getItem('chatnow_user')) || {}; }
      catch { return {}; }
    },
  };

  return api;
})();

// Defer connect so page scripts load and register handlers first
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => ChatSocket.connect(), 0);
});
