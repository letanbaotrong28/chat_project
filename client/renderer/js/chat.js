function initChat() {
  const panel = document.querySelector('#chat');
  const title = document.querySelector('#chat-title');
  const note = document.querySelector('#chat-note');
  const thread = document.querySelector('#thread');
  const form = document.querySelector('#compose');
  const input = document.querySelector('#message-text');
  const send = document.querySelector('#send-message');
  const error = document.querySelector('#send-error');
  const older = document.querySelector('#load-older');
  const historyNote = document.querySelector('#history-note');
  const tools = document.querySelector('#history-tools');
  const history = createHistoryRequests();
  const receipts = createMessageReceipts(thread);
  const conversations = new Map();
  let me = null;
  let peer = null;
  let online = false;
  let pending = null;

  function conversation(name) {
    if (!conversations.has(name)) {
      conversations.set(name, {
        messages: new Map(), draft: '', error: '', unread: false,
        loaded: false, loading: false, beforeId: null, historyError: ''
      });
    }
    return conversations.get(name);
  }

  function appendMessage(packet) {
    const bubble = document.createElement('div');
    bubble.dataset.id = packet.id;
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
    receipts.decorate(bubble, packet, me);
  }

  function refresh() {
    panel.hidden = !me;
    title.textContent = peer || 'Tin nhắn riêng';
    thread.hidden = form.hidden = !peer;
    note.textContent = peer
      ? (online ? 'Online' : 'Offline · Tin sẽ được chuyển khi người này đăng nhập.')
      : 'Chọn một người trong danh sách để mở hội thoại.';
    input.disabled = !peer;
    input.readOnly = Boolean(peer && pending?.to === peer);
    send.disabled = !peer || Boolean(pending) || !input.value.trim();
    error.textContent = peer ? conversation(peer).error : '';
    const current = conversations.get(peer);
    tools.hidden = !current;
    if (current) {
      older.hidden = current.loading || (current.loaded && current.beforeId === null);
      older.textContent = current.historyError ? 'Thử tải lại' : 'Tải tin cũ hơn';
      historyNote.textContent = current.loading ? 'Đang tải lịch sử…' : current.historyError;
    }
  }

  function renderMessages(current, atBottom) {
    // Neo theo mã tin đang đọc để việc thêm trang cũ không làm nhảy màn hình.
    const top = thread.getBoundingClientRect().top;
    const anchor = !atBottom && Array.from(thread.children).find(el => el.getBoundingClientRect().bottom > top);
    const offset = anchor ? anchor.getBoundingClientRect().top - top : 0;
    receipts.clearView();
    thread.replaceChildren();
    for (const item of Array.from(current.messages.values()).sort((a, b) => a.id - b.id)) appendMessage(item);
    if (atBottom) thread.scrollTop = thread.scrollHeight;
    else if (anchor) {
      const same = thread.querySelector('[data-id="' + anchor.dataset.id + '"]');
      if (same) thread.scrollTop += same.getBoundingClientRect().top - top - offset;
    }
  }

  async function loadPage(name) {
    if (!name) return;
    const current = conversation(name);
    if (current.loading || (current.loaded && current.beforeId === null)) return;
    current.loading = true;
    current.historyError = '';
    refresh();
    try {
      const page = await history.load(name, current.beforeId);
      if (conversations.get(name) !== current || page.peer !== name) return;
      const first = !current.loaded;
      for (const item of page.messages) {
        receipts.track(item, me);
        current.messages.set(item.id, item);
      }
      current.loaded = true;
      current.beforeId = page.nextBeforeId;
      if (peer === name) renderMessages(current, first);
    } catch (failure) {
      current.historyError = failure.message;
    } finally {
      current.loading = false;
      if (peer === name && conversations.get(name) === current) refresh();
    }
  }
  older.addEventListener('click', () => loadPage(peer));
  thread.addEventListener('scroll', () => {
    const current = conversations.get(peer);
    if (thread.scrollTop <= 1 && current?.loaded && !current.historyError) loadPage(peer);
  });

  function open(name, status) {
    peer = name;
    online = status === 'online';
    const current = conversation(name);
    current.unread = false;
    input.value = current.draft;
    refresh();
    renderMessages(current, true);
    if (!current.loaded) loadPage(name);
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
    if (!peer || pending || !input.value.trim()) return;
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
      history.reset();
      receipts.reset();
      input.value = '';
      thread.replaceChildren();
      refresh();
      return;
    }
    if (!me || event.kind !== 'received') return;
    history.receive(packet);
    receipts.onPacket(packet, me);
    if (packet.type === 'ERROR' && packet.requestType === 'MSG' && pending) {
      conversation(pending.to).error = packet.content;
      pending = null;
      refresh();
      return;
    }
    if (packet.type !== 'MSG' || (packet.from !== me && packet.to !== me)) return;
    receipts.track(packet, me);
    const other = packet.from === me ? packet.to : packet.from;
    const current = conversation(other);
    // Tin chờ đã có trong SQLite. Chỉ báo tin mới; trang lịch sử sẽ nạp nội dung
    // khi mở hội thoại, kể cả khi có hàng trăm tin đến trong thời gian offline.
    if (packet.backlog && packet.to === me) {
      if (peer !== other && !current.loaded) current.unread = true;
      return;
    }
    const exists = current.messages.has(packet.id);
    current.messages.set(packet.id, packet);
    if (packet.from === me && pending?.to === other) {
      current.draft = current.error = '';
      pending = null;
      if (peer === other) input.value = '';
    }
    if (peer === other && !exists) {
      const pinned = thread.scrollHeight - thread.clientHeight - thread.scrollTop < 12;
      const last = Number(thread.lastElementChild?.dataset.id || 0);
      if (last < packet.id) {
        appendMessage(packet);
        if (pinned || packet.from === me) thread.scrollTop = thread.scrollHeight;
      } else renderMessages(current, pinned);
    } else if (peer !== other && packet.from !== me) current.unread = true;
    refresh();
  }
  return {
    onEvent, open, selected: () => peer, hasUnread: name => conversations.get(name)?.unread,
    markUnread(name) {
      if (peer !== name) conversation(name).unread = true;
    },
    updatePresence(name, status) {
      if (name !== peer) return;
      online = status === 'online';
      refresh();
    }
  };
}
