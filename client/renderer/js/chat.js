function initChat() {
  const panel = document.querySelector('#chat');
  const title = document.querySelector('#chat-title');
  const note = document.querySelector('#chat-note');
  const thread = document.querySelector('#thread');
  const form = document.querySelector('#compose');
  const input = document.querySelector('#message-text');
  const send = document.querySelector('#send-message');
  const error = document.querySelector('#send-error');
  const conversations = new Map();
  let me = null;
  let peer = null;
  let online = false;
  let pending = null;

  function conversation(name) {
    if (!conversations.has(name)) {
      conversations.set(name, { messages: [], draft: '', error: '', unread: false });
    }
    return conversations.get(name);
  }

  function appendMessage(packet) {
    const bubble = document.createElement('div');
    bubble.className = packet.from === me ? 'bubble mine' : 'bubble';
    const sender = document.createElement('strong');
    sender.textContent = packet.from;
    const time = document.createElement('time');
    const date = new Date(packet.time);
    time.dateTime = packet.time;
    const today = date.toDateString() === new Date().toDateString();
    time.textContent = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (!today) time.textContent += ' · ' + date.toLocaleDateString('vi-VN');
    time.title = date.toLocaleString('vi-VN');
    const text = document.createElement('p');
    text.textContent = packet.content;
    bubble.append(sender, time, text);
    thread.append(bubble);
  }

  function refresh() {
    panel.hidden = !me;
    title.textContent = peer || 'Tin nhắn riêng';
    thread.hidden = form.hidden = !peer;
    note.textContent = peer
      ? (online ? 'Online' : 'Offline · Có thể gửi tin khi người này online trở lại.')
      : 'Chọn một người trong danh sách để mở hội thoại.';
    input.disabled = !online;
    input.readOnly = Boolean(peer && pending?.to === peer);
    send.disabled = !online || Boolean(pending) || !input.value.trim();
    error.textContent = peer ? conversation(peer).error : '';
  }

  function open(name, status) {
    peer = name;
    online = status === 'online';
    const current = conversation(name);
    current.unread = false;
    input.value = current.draft;
    thread.replaceChildren();
    refresh();
    for (const packet of current.messages) appendMessage(packet);
    thread.scrollTop = thread.scrollHeight;
  }

  input.addEventListener('input', () => {
    if (!peer) return;
    conversation(peer).draft = input.value;
    conversation(peer).error = '';
    refresh();
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!send.disabled) form.requestSubmit();
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!peer || !online || pending || !input.value.trim()) return;
    const attempt = { to: peer, content: input.value };
    pending = attempt;
    refresh();
    try {
      await window.tcp.message(attempt.to, attempt.content);
    } catch {
      if (pending !== attempt) return;
      pending = null;
      conversation(attempt.to).error = 'Gửi thất bại. Hãy kiểm tra kết nối.';
      refresh();
    }
  });

  function onEvent(event) {
    const packet = event.packet;
    if (event.kind === 'state' || (event.kind === 'received' && ['LOGIN', 'LOGOUT'].includes(packet.type))) {
      me = packet?.type === 'LOGIN' ? packet.from : null;
      peer = pending = null;
      online = false;
      conversations.clear();
      input.value = '';
      thread.replaceChildren();
      refresh();
      return;
    }
    if (!me || event.kind !== 'received') return;
    if (packet.type === 'ERROR' && packet.requestType === 'MSG' && pending) {
      conversation(pending.to).error = packet.content;
      pending = null;
      refresh();
      return;
    }
    if (packet.type !== 'MSG' || (packet.from !== me && packet.to !== me)) return;
    const other = packet.from === me ? packet.to : packet.from;
    const current = conversation(other);
    current.messages.push(packet);
    if (packet.from === me && pending?.to === other) {
      current.draft = current.error = '';
      pending = null;
      if (peer === other) input.value = '';
    }
    if (!peer) return open(other, 'online');
    if (peer === other) {
      appendMessage(packet);
      thread.scrollTop = thread.scrollHeight;
    } else if (packet.from !== me) current.unread = true;
    refresh();
  }
  return {
    onEvent, open, selected: () => peer, hasUnread: name => conversations.get(name)?.unread,
    updatePresence(name, status) {
      if (name !== peer) return;
      online = status === 'online';
      refresh();
    }
  };
}
