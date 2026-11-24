function initGroups(chat, contacts) {
  const list = document.querySelector('#groups-list');
  const create = document.querySelector('#group-create');
  const add = document.querySelector('#group-add');
  const name = document.querySelector('#group-name');
  const username = document.querySelector('#group-username');
  const feedback = document.querySelector('#group-feedback');
  const memberFeedback = document.querySelector('#member-feedback');
  const createDialog = document.querySelector('#group-create-dialog');
  const addDialog = document.querySelector('#group-add-dialog');
  const openCreate = document.querySelector('#open-create');
  const openAdd = document.querySelector('#open-add');
  const createFeedback = document.querySelector('#create-feedback');
  const options = document.querySelector('#member-options');
  const chosen = new Set();
  const dialog = document.querySelector('#group-delete-dialog');
  const groups = new Map();
  let me = null;
  let creating = null;
  let adding = null;
  let deleting = null;
  let confirmingId = null;
  let displayedId = null;

  function showCount() {
    document.querySelector('#selected-count').textContent = 'Đã chọn ' + chosen.size;
  }

  function renderOptions() {
    const focused = document.activeElement;
    const focusName = options.contains(focused) ? focused.value : null;
    const rows = document.createDocumentFragment();
    let restoreFocus;
    for (const [user, status] of contacts.entries()) {
      const row = document.createElement('label');
      const text = document.createElement('span');
      text.className = 'option-name';
      text.textContent = user;
      const presence = document.createElement('small');
      presence.className = 'presence';
      presence.textContent = status === 'online' ? 'Trực tuyến' : 'Ngoại tuyến';
      row.dataset.status = status;
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.value = user;
      check.setAttribute('aria-label', user);
      check.checked = chosen.has(user);
      if (user === focusName) restoreFocus = check;
      row.append(chatAvatar(user), text, presence, check);
      rows.append(row);
    }
    options.replaceChildren(rows);
    document.querySelector('#members-empty').hidden = options.childElementCount > 0;
    restoreFocus?.focus({ preventScroll: true });
    showCount();
  }

  function suggestUsers() {
    const rows = document.createDocumentFragment();
    for (const [user] of contacts.entries()) rows.append(new Option(user, user));
    document.querySelector('#user-suggestions').replaceChildren(rows);
  }

  options.addEventListener('change', event => {
    const check = event.target;
    if (check.checked) chosen.add(check.value);
    else chosen.delete(check.value);
    showCount();
  });

  openCreate.addEventListener('click', () => {
    if (!me || creating) return;
    chosen.clear();
    create.reset();
    createFeedback.textContent = '';
    renderOptions();
    createDialog.showModal();
  });
  openAdd.addEventListener('click', () => {
    if (!me || adding || groups.get(chat.selected())?.owner !== me) return;
    suggestUsers();
    add.reset();
    memberFeedback.textContent = '';
    addDialog.showModal();
  });
  for (const box of [createDialog, addDialog, dialog]) {
    box.querySelector('[data-close]').addEventListener('click', () => box.close());
    box.addEventListener('cancel', event => {
      if ((box === createDialog && creating) || (box === addDialog && adding)) event.preventDefault();
    });
  }

  function render() {
    const selected = groups.get(chat.selected());
    const rows = document.createDocumentFragment();
    for (const group of groups.values()) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'conversation-row';
      button.setAttribute('aria-pressed', String(group.id === selected?.id));
      const title = document.createElement('span');
      title.className = 'row-name';
      title.textContent = group.name;
      const detail = document.createElement('small');
      detail.textContent = '#' + group.id + ' · ' + group.memberCount + ' thành viên';
      if (chat.hasUnread(group.id)) detail.textContent += ' · Tin mới';
      button.append(chatAvatar('', 'group'), title, detail);
      button.addEventListener('click', () => {
        chat.open(group.id, group);
        document.querySelector('#message-text').focus();
      });
      row.append(button);
      if (group.owner === me) {
        const trash = document.createElement('button');
        trash.type = 'button';
        trash.className = 'icon-button group-trash';
        trash.title = 'Xóa nhóm “' + group.name + '” (#' + group.id + ')';
        trash.setAttribute('aria-label', trash.title);
        trash.setAttribute('aria-haspopup', 'dialog');
        trash.disabled = Boolean(deleting);
        trash.append(chatIcon('trash'));
        trash.addEventListener('click', () => {
          confirmingId = group.id;
          document.querySelector('#group-delete-title').textContent = trash.title + '?';
          dialog.showModal();
        });
        row.append(trash);
      }
      rows.append(row);
    }
    list.replaceChildren(rows);
    document.querySelector('#groups-empty').hidden = groups.size > 0;
    if (displayedId !== selected?.id) {
      if (addDialog.open) addDialog.close();
      username.value = memberFeedback.textContent = '';
      displayedId = selected?.id;
    }
    openAdd.hidden = !selected || selected.owner !== me;
    openAdd.disabled = Boolean(adding);
    openCreate.disabled = Boolean(creating);
    for (const control of [name, create.querySelector('fieldset'), ...create.querySelectorAll('button')]) {
      control.disabled = Boolean(creating);
    }
    for (const control of add.elements) control.disabled = Boolean(adding);
  }

  document.querySelector('#group-delete-confirm').addEventListener('click', async () => {
    const group = groups.get(confirmingId);
    dialog.close();
    if (deleting || !group || group.owner !== me) return;
    const attempt = { groupId: group.id };
    deleting = attempt;
    feedback.textContent = '';
    render();
    try {
      await window.tcp.deleteGroup(group.id);
    } catch {
      if (deleting !== attempt) return;
      deleting = null;
      feedback.textContent = 'Không gửi được yêu cầu xóa nhóm.';
      render();
    }
  });

  create.addEventListener('submit', async event => {
    event.preventDefault();
    if (creating) return;
    const attempt = {};
    creating = attempt;
    createFeedback.textContent = '';
    render();
    try {
      await window.tcp.createGroup(name.value, [...chosen]);
    } catch {
      if (creating !== attempt) return;
      creating = null;
      createFeedback.textContent = 'Không gửi được yêu cầu tạo nhóm.';
      render();
    }
  });
  add.addEventListener('submit', async event => {
    event.preventDefault();
    const groupId = chat.selected();
    if (adding || groups.get(groupId)?.owner !== me) return;
    const attempt = { groupId };
    adding = attempt;
    memberFeedback.textContent = '';
    render();
    try {
      await window.tcp.addMember(groupId, username.value);
    } catch {
      if (adding !== attempt) return;
      adding = null;
      if (chat.selected() === groupId) memberFeedback.textContent = 'Không gửi được yêu cầu thêm thành viên.';
      render();
    }
  });

  function onEvent({ kind, packet }) {
    if (kind === 'state' || (kind === 'received' && ['LOGIN', 'LOGOUT'].includes(packet.type))) {
      me = packet?.type === 'LOGIN' ? packet.from : null;
      groups.clear();
      chosen.clear();
      creating = adding = deleting = confirmingId = null;
      for (const box of [dialog, createDialog, addDialog]) if (box.open) box.close();
      name.value = username.value = feedback.textContent = memberFeedback.textContent = '';
      render();
      return;
    }
    if (!me || kind !== 'received') return;
    if (packet.type === 'STATE' && ['change', 'list'].includes(packet.kind)) {
      if (createDialog.open && !creating) renderOptions();
      if (addDialog.open && !adding) suggestUsers();
      return;
    }
    if (packet.type === 'ERROR' && packet.requestType === 'GROUP_CREATE') {
      creating = null;
      createFeedback.textContent = packet.content;
    } else if (packet.type === 'ERROR' && packet.requestType === 'GROUP_ADD') {
      if (adding?.groupId === chat.selected()) memberFeedback.textContent = packet.content;
      adding = null;
    } else if (packet.type === 'ERROR' && packet.requestType === 'GROUP_DELETE') {
      deleting = null;
      feedback.textContent = packet.content;
    } else if (packet.type === 'GROUP_DELETE') {
      const group = groups.get(packet.groupId);
      if (confirmingId === packet.groupId && dialog.open) dialog.close();
      groups.delete(packet.groupId);
      if (deleting?.groupId === packet.groupId) deleting = null;
      if (adding?.groupId === packet.groupId) adding = null;
      chat.removeGroup(packet.groupId);
      if (group) feedback.textContent = packet.from + ' đã xóa nhóm “' + group.name + '”.';
    } else if (packet.type === 'GROUP_CREATE' || packet.type === 'GROUP_ADD' ||
        (packet.type === 'STATE' && packet.kind === 'group')) {
      const group = packet.group;
      const known = groups.get(group.id);
      if (known && known.memberCount > group.memberCount) return;
      groups.set(group.id, group);
      chat.updateGroup(group);
      if (packet.type === 'GROUP_CREATE') {
        creating = null;
        createDialog.close();
        chosen.clear();
        name.value = '';
        feedback.textContent = 'Đã tạo nhóm ' + group.name + '.';
        chat.open(group.id, group);
        document.querySelector('#message-text').focus();
        return;
      }
      if (packet.type === 'GROUP_ADD' && packet.from === me) {
        adding = null;
        if (group.id === chat.selected()) {
          addDialog.close();
          username.value = '';
          feedback.textContent = 'Đã thêm ' + packet.username + ' vào nhóm “' + group.name + '”.';
        }
      }
    } else if (packet.type !== 'MSG' || !packet.groupId) return;
    render();
  }
  return { onEvent, render };
}
