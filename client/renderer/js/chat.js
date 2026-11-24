function initChat(onSelect) {
  const panel = document.querySelector('#chat');
  const title = document.querySelector('#chat-title');
  const avatar = document.querySelector('#chat-avatar');
  const note = document.querySelector('#chat-note');
  const thread = document.querySelector('#thread');
  const form = document.querySelector('#compose');
  const input = document.querySelector('#message-text');
  const emojiPicker = initEmojiPicker(input);
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
  let selectedGroup = null;
  let online = false;
  let pending = null;
  let renderedConversation = null;
  const replyDraft = document.querySelector('#reply-draft');
  const cancelReply = document.querySelector('#cancel-reply');
  const replyAuthor = document.querySelector('#reply-author');
  const replyExcerpt = document.querySelector('#reply-excerpt');
  const pendingReactions = new Map();
  const files = initFileTransfers(() => peer, () => conversations.get(peer)?.replyTo);
  const actions = initMessageActions(thread, id => conversations.get(peer)?.messages.get(id), () => me, startReply, react);

  function conversation(name) {
    if (!conversations.has(name)) {
      conversations.set(name, {
        messages: new Map(), draft: '', replyTo: null, error: '', unread: false,
        loaded: false, loading: false, beforeId: null, historyError: ''
      });
    }
    return conversations.get(name);
  }

  function excerpt(text) {
    return Array.from(text).slice(0, 120).join('');
  }
  function startReply(id) {
    const current = conversations.get(peer);
    if (!current || pending?.to === peer || current.messages.get(id)?.recalledAt) return;
    current.replyTo = id;
    current.error = '';
    refresh();
    input.focus();
  }
  cancelReply.addEventListener('click', () => {
    const current = conversations.get(peer);
    if (current) current.replyTo = null;
    refresh();
    input.focus();
  });

  async function react(msg, emoji) {
    if (msg.recalledAt || pendingReactions.has(msg.id)) return;
    const current = conversations.get(peer);
    pendingReactions.set(msg.id, current);
    try {
      await window.tcp.react(msg.id, msg.myReaction === emoji ? null : emoji);
    } catch {
      if (pendingReactions.get(msg.id) !== current) return;
      pendingReactions.delete(msg.id);
      current.error = 'Không gửi được cảm xúc. Hãy kiểm tra kết nối.';
      refresh();
    }
  }

  function renderQuote(bubble, reply) {
    let quote = bubble.querySelector('.reply-quote');
    if (!quote) {
      quote = document.createElement('button');
      quote.type = 'button';
      quote.className = 'reply-quote';
      quote.append(document.createElement('b'), document.createElement('span'));
      bubble.append(quote);
    }
    quote.dataset.original = reply.id;
    quote.disabled = !reply.from;
    quote.firstElementChild.textContent = reply.from || '';
    quote.lastElementChild.textContent = reply.from ? reply.text : 'Tin nhắn gốc không còn khả dụng.';
    quote.title = reply.from ? 'Xem tin nhắn gốc' : '';
  }

  thread.addEventListener('click', async event => {
    const quote = event.target.closest('.reply-quote');
    if (!quote || quote.disabled) return;
    const name = peer;
    const current = conversations.get(name);
    const id = Number(quote.dataset.original);
    while (peer === name && conversations.get(name) === current && quote.isConnected && !quote.disabled) {
      const original = thread.querySelector('[data-id="' + id + '"]');
      if (original) {
        original.scrollIntoView({ block: 'center' });
        original.animate([{ outline: '2px solid #837add' }, { outline: '2px solid transparent' }], 1100);
        return;
      }
      if (current.loaded && current.beforeId === null) return;
      await loadPage(name);
      if (current.historyError) return;
    }
  });

  function appendMessage(packet, before = null) {
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
    bubble.append(sender, time);
    if (packet.editedAt && !packet.recalledAt) {
      const edited = document.createElement('small');
      edited.className = 'message-edited';
      edited.textContent = 'Đã chỉnh sửa';
      edited.title = new Date(packet.editedAt).toLocaleString('vi-VN');
      bubble.append(edited);
    }
    actions.decorate(bubble, packet);
    if (packet.reply && !packet.recalledAt) renderQuote(bubble, packet.reply);
    if (packet.file && !packet.recalledAt) files.decorate(bubble, packet);
    else {
      const text = document.createElement('p');
      if (packet.recalledAt) {
        bubble.classList.add('recalled');
        text.textContent = packet.from === me ? 'Bạn đã thu hồi một tin nhắn.' : packet.from + ' đã thu hồi một tin nhắn.';
      } else text.textContent = packet.content;
      bubble.append(text);
    }
    thread.insertBefore(bubble, before);
    if (!packet.groupId) receipts.decorate(bubble, packet, me);
    actions.renderReactions(bubble, packet);
  }

  function changedMessage(item, update) {
    if (!update) return item;
    if (update.action === 'hide') return null;
    if (update.action === 'recall') {
      const { content, file, editedAt, reply, reactions, myReaction, ...metadata } = item;
      return { ...metadata, recalledAt: update.recalledAt };
    }
    return { ...item, content: update.content, editedAt: update.editedAt };
  }

  function changedQuote(reply, update) {
    if (update.action !== 'edit') return { id: reply.id };
    return reply.from ? { ...reply, text: excerpt(update.content) } : reply;
  }

  function updateReactions(packet) {
    if (packet.from === me) pendingReactions.delete(packet.id);
    const name = packet.groupId ?? (packet.sender === me ? packet.to : packet.sender);
    const current = conversations.get(name);
    if (!current) return;
    const patch = { reactions: packet.reactions };
    if (packet.from === me) patch.myReaction = packet.emoji;
    if (current.pageReactions) {
      current.pageReactions.set(packet.id, { ...current.pageReactions.get(packet.id), ...patch });
    }
    const msg = current.messages.get(packet.id);
    if (!msg || msg.recalledAt) return;
    Object.assign(msg, patch);
    const bubble = peer === name && thread.querySelector('[data-id="' + msg.id + '"]');
    if (bubble) actions.renderReactions(bubble, msg);
  }

  function updateMessage(packet) {
    const name = packet.groupId ?? (packet.sender === me ? packet.to : packet.sender);
    const current = conversations.get(name);
    if (!current) return;
    current.pageUpdates?.set(packet.id, packet);
    for (const msg of current.messages.values()) {
      if (msg.reply?.id !== packet.id) continue;
      msg.reply = changedQuote(msg.reply, packet);
      const bubble = peer === name && thread.querySelector('[data-id="' + msg.id + '"]');
      if (bubble) renderQuote(bubble, msg.reply);
    }
    if (current.replyTo === packet.id && packet.action !== 'edit') {
      current.replyTo = null;
      current.error = 'Tin nhắn gốc không còn khả dụng. Bạn có thể chọn tin khác hoặc gửi nội dung đang soạn.';
    }
    const item = current.messages.get(packet.id);
    if (!item) return; // Một trang chưa tải sẽ lấy bản hiện tại từ Server.
    const next = changedMessage(item, packet);
    if (next) current.messages.set(item.id, next);
    else current.messages.delete(item.id);
    if (peer !== name) return;
    const old = thread.querySelector('[data-id="' + item.id + '"]');
    if (!old) return;
    const after = old.nextElementSibling;
    for (const player of old.querySelectorAll('audio,video')) player.pause();
    receipts.removeBubble(old);
    old.remove();
    if (next) appendMessage(next, after);
    refresh();
  }

  function refresh() {
    panel.hidden = !me;
    const kind = selectedGroup ? 'group' : peer ? 'user' : 'chat';
    const identity = kind + ':' + (peer ?? '');
    if (avatar.dataset.identity !== identity) {
      avatar.replaceChildren(chatAvatar(String(peer ?? ''), kind));
      avatar.dataset.identity = identity;
    }
    panel.classList.toggle('chat-empty', !peer);
    title.textContent = selectedGroup?.name || peer || 'Hội thoại';
    thread.hidden = form.hidden = !peer;
    if (selectedGroup) note.textContent = selectedGroup.memberCount + ' thành viên · Chủ nhóm: ' + selectedGroup.owner;
    else if (peer) note.textContent = online ? 'Đang trực tuyến' : 'Ngoại tuyến · Tin sẽ được chuyển khi người này đăng nhập.';
    else note.textContent = 'Chọn người dùng hoặc nhóm để mở hội thoại.';
    input.disabled = !peer;
    input.readOnly = Boolean(peer && pending?.to === peer);
    emojiPicker.sync();
    send.disabled = !peer || Boolean(pending) || !input.value.trim();
    error.textContent = peer ? conversation(peer).error : '';
    const current = conversations.get(peer);
    const parent = current?.messages.get(current.replyTo);
    replyDraft.hidden = !parent;
    if (parent) {
      replyAuthor.textContent = 'Đang trả lời ' + (parent.from === me ? 'chính bạn' : parent.from);
      replyExcerpt.textContent = parent.file ?
        (parent.file.voice ? 'Tin nhắn thoại' : parent.file.name) : excerpt(parent.content);
      cancelReply.disabled = input.readOnly;
    } else replyAuthor.textContent = replyExcerpt.textContent = '';
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
    if (renderedConversation !== current) {
      receipts.clearView();
      thread.replaceChildren();
      renderedConversation = current;
    }
    // Giữ nguyên trình phát đang chạy khi chèn thêm một trang lịch sử.
    let next = thread.firstElementChild;
    for (const item of Array.from(current.messages.values()).sort((a, b) => a.id - b.id)) {
      if (Number(next?.dataset.id) === item.id) next = next.nextElementSibling;
      else appendMessage(item, next);
    }
    if (atBottom) thread.scrollTop = thread.scrollHeight;
    else if (anchor) {
      const same = thread.querySelector('[data-id="' + anchor.dataset.id + '"]');
      if (same) thread.scrollTop += same.getBoundingClientRect().top - top - offset;
    }
  }

  async function loadPage(name) {
    if (!name) return;
    const current = conversation(name);
    if (current.loading) return current.loading.catch(() => {});
    if (current.loaded && current.beforeId === null) return;
    current.loading = history.load(name, current.beforeId);
    current.pageUpdates = new Map();
    current.pageReactions = new Map();
    current.historyError = '';
    refresh();
    try {
      const page = await current.loading;
      if (conversations.get(name) !== current || (page.groupId ?? page.peer) !== name) return;
      const first = !current.loaded;
      for (const row of page.messages) {
        const item = changedMessage(row, current.pageUpdates.get(row.id));
        if (!item) continue;
        if (item.reply && current.pageUpdates.has(item.reply.id)) item.reply = changedQuote(item.reply, current.pageUpdates.get(item.reply.id));
        if (!item.recalledAt) Object.assign(item, current.pageReactions.get(item.id));
        if (!item.groupId) receipts.track(item, me);
        current.messages.set(item.id, item);
      }
      current.loaded = true;
      current.beforeId = page.nextBeforeId;
      if (peer === name) renderMessages(current, first);
    } catch (failure) {
      current.historyError = failure.message;
    } finally {
      current.loading = false;
      current.pageUpdates = null;
      current.pageReactions = null;
      if (peer === name && conversations.get(name) === current) refresh();
    }
  }
  older.addEventListener('click', () => loadPage(peer));
  thread.addEventListener('scroll', () => {
    const current = conversations.get(peer);
    if (thread.scrollTop <= 1 && current?.loaded && !current.historyError) loadPage(peer);
  });

  function open(name, details) {
    if (name !== peer) {
      files.leaveChat();
      actions.reset();
    }
    emojiPicker.close();
    peer = name;
    selectedGroup = typeof name === 'number' ? details : null;
    online = details === 'online';
    const current = conversation(name);
    current.unread = false;
    input.value = current.draft;
    refresh();
    renderMessages(current, true);
    if (!current.loaded) loadPage(name);
    onSelect();
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
    const attempt = { to: peer, content: input.value, replyTo: conversation(peer).replyTo };
    pending = attempt;
    refresh();
    try {
      await window.tcp.message(attempt.to, attempt.content, attempt.replyTo);
    } catch {
      if (pending !== attempt) return;
      pending = null;
      const current = conversations.get(attempt.to);
      if (current) current.error = 'Gửi thất bại. Hãy kiểm tra kết nối.';
      refresh();
    }
  });

  function onEvent(event) {
    const packet = event.packet;
    if (event.kind === 'state' || (event.kind === 'received' && ['LOGIN', 'LOGOUT'].includes(packet.type))) {
      me = packet?.type === 'LOGIN' ? packet.from : null;
      peer = pending = null;
      selectedGroup = null;
      online = false;
      conversations.clear();
      pendingReactions.clear();
      renderedConversation = null;
      history.reset();
      actions.reset();
      receipts.reset();
      files.reset(me ? event.previewKey : null);
      input.value = '';
      thread.replaceChildren();
      refresh();
      return;
    }
    if (!me || event.kind !== 'received') return;
    history.receive(packet);
    receipts.onPacket(packet, me);
    actions.receive(packet);
    if (packet.type === 'REACTION') {
      updateReactions(packet);
      return;
    }
    if (packet.type === 'ERROR' && packet.requestType === 'REACTION') {
      const current = pendingReactions.get(packet.id);
      pendingReactions.delete(packet.id);
      if (current) current.error = packet.content;
      refresh();
      return;
    }
    if (packet.type === 'MSG_UPDATE') {
      updateMessage(packet);
      return;
    }
    if (packet.type === 'ERROR' && packet.requestType === 'MSG' && pending) {
      const current = conversations.get(pending.to);
      if (current) current.error = packet.content;
      pending = null;
      refresh();
      return;
    }
    if (packet.type !== 'MSG' || (!packet.groupId && packet.from !== me && packet.to !== me)) return;
    if (!packet.groupId) receipts.track(packet, me);
    const other = packet.groupId ?? (packet.from === me ? packet.to : packet.from);
    const current = conversation(other);
    // Tin chờ đã có trong SQLite. Chỉ báo tin mới; trang lịch sử sẽ nạp nội dung
    // khi mở hội thoại, kể cả khi có hàng trăm tin đến trong thời gian offline.
    if (packet.backlog && packet.to === me) {
      if (peer !== other && !current.loaded) current.unread = true;
      return;
    }
    const exists = current.messages.has(packet.id);
    current.messages.set(packet.id, packet);
    if (packet.from === me && packet.reply && current.replyTo === packet.reply.id) current.replyTo = null;
    if (!packet.file && packet.from === me && pending?.to === other) {
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
    removeGroup(id) {
      conversations.delete(id);
      if (peer !== id) return;
      actions.reset();
      files.leaveChat();
      emojiPicker.close();
      receipts.clearView();
      peer = selectedGroup = renderedConversation = null;
      input.value = '';
      thread.replaceChildren();
      refresh();
      onSelect();
    },
    markUnread(name) {
      if (peer !== name) conversation(name).unread = true;
    },
    updateGroup(group) {
      if (peer === group.id) {
        selectedGroup = group;
        refresh();
      }
    },
    updatePresence(name, status) {
      if (name !== peer) return;
      online = status === 'online';
      refresh();
    }
  };
}
