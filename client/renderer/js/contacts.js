function initContacts(chat) {
  const panel = document.querySelector('#contacts');
  const list = document.querySelector('#contacts-list');
  const note = document.querySelector('#contacts-note');
  const count = document.querySelector('#online-count');
  const users = new Map();
  const byName = new Intl.Collator('vi');
  let currentUser = null;
  let loading = false;

  function update(user) {
    if (typeof user?.username !== 'string' || user.username === currentUser) return;
    if (user.status === 'online' || user.status === 'offline') {
      users.set(user.username, user.status);
      chat.updatePresence(user.username, user.status);
      if (user.unread) chat.markUnread(user.username);
    }
  }

  function entries() {
    return Array.from(users).sort(([a, first], [b, second]) => {
      if (first !== second) return first === 'online' ? -1 : 1;
      return byName.compare(a, b);
    });
  }

  function render() {
    panel.hidden = currentUser === null;
    const rows = document.createDocumentFragment();
    let online = 0;
    for (const [username, status] of entries()) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(chat.selected() === username));
      button.addEventListener('click', () => {
        chat.open(username, status);
        document.querySelector('#message-text:not(:disabled)')?.focus();
      });
      const name = document.createElement('span');
      const badge = document.createElement('span');
      name.textContent = username;
      row.dataset.status = status;
      badge.className = 'presence';
      badge.textContent = status === 'online' ? 'Trực tuyến' : 'Ngoại tuyến';
      if (status === 'online') online++;
      name.className = 'row-name';
      button.className = 'conversation-row';
      button.append(chatAvatar(username), name, badge);
      if (chat.hasUnread(username)) {
        badge.append(' · Tin mới');
      }
      row.append(button);
      rows.append(row);
    }
    list.replaceChildren(rows);
    count.textContent = loading ? '' : online + ' online';
    note.textContent = loading ? 'Đang tải danh sách…' : 'Chưa có người dùng khác.';
    note.hidden = !loading && users.size > 0;
  }

  function onEvent(event) {
    const packet = event.packet;
    if (event.kind === 'state' || (event.kind === 'received' && packet.type === 'LOGOUT')) {
      currentUser = null;
      loading = false;
      users.clear();
    } else if (event.kind === 'received' && packet.type === 'LOGIN') {
      currentUser = packet.from;
      users.clear();
      loading = true;
    } else if (event.kind === 'received' && packet.type === 'STATE' && currentUser !== null) {
      if (packet.kind === 'list' && Array.isArray(packet.contacts)) {
        for (const user of packet.contacts) update(user);
        loading = !packet.complete;
        if (loading) return;
      } else if (packet.kind === 'change') {
        update(packet);
        if (loading) return;
      } else return;
    } else if (event.kind !== 'received' || packet.type !== 'MSG') return;
    render();
  }
  return { onEvent, render, entries };
}
