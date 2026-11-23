function initGroups(chat) {
  const list = document.querySelector('#groups-list');
  const create = document.querySelector('#group-create');
  const add = document.querySelector('#group-add');
  const name = document.querySelector('#group-name');
  const username = document.querySelector('#group-username');
  const feedback = document.querySelector('#group-feedback');
  const memberFeedback = document.querySelector('#member-feedback');
  const groups = new Map();
  let me = null;
  let creating = null;
  let adding = null;
  let displayedId = null;

  function render() {
    const selected = groups.get(chat.selected());
    const rows = document.createDocumentFragment();
    for (const group of groups.values()) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(group.id === selected?.id));
      button.textContent = group.name;
      const detail = document.createElement('small');
      detail.textContent = '#' + group.id + ' · ' + group.memberCount + ' thành viên';
      if (chat.hasUnread(group.id)) detail.textContent += ' · Tin mới';
      button.append(detail);
      button.addEventListener('click', () => {
        chat.open(group.id, group);
        document.querySelector('#message-text').focus();
      });
      row.append(button);
      rows.append(row);
    }
    list.replaceChildren(rows);
    if (displayedId !== selected?.id) {
      username.value = memberFeedback.textContent = '';
      displayedId = selected?.id;
    }
    add.hidden = !selected || selected.owner !== me;
    memberFeedback.hidden = add.hidden;
    create.querySelector('button').disabled = Boolean(creating);
    add.querySelector('button').disabled = Boolean(adding);
  }

  create.addEventListener('submit', async event => {
    event.preventDefault();
    if (creating) return;
    const attempt = {};
    creating = attempt;
    feedback.textContent = '';
    render();
    try {
      await window.tcp.createGroup(name.value);
    } catch {
      if (creating !== attempt) return;
      creating = null;
      feedback.textContent = 'Không gửi được yêu cầu tạo nhóm.';
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
      creating = adding = null;
      name.value = username.value = feedback.textContent = memberFeedback.textContent = '';
      render();
      return;
    }
    if (!me || kind !== 'received') return;
    if (packet.type === 'ERROR' && packet.requestType === 'GROUP_CREATE') {
      creating = null;
      feedback.textContent = packet.content;
    } else if (packet.type === 'ERROR' && packet.requestType === 'GROUP_ADD') {
      if (adding?.groupId === chat.selected()) memberFeedback.textContent = packet.content;
      adding = null;
    } else if (packet.type === 'GROUP_CREATE' || packet.type === 'GROUP_ADD' ||
        (packet.type === 'STATE' && packet.kind === 'group')) {
      const group = packet.group;
      const known = groups.get(group.id);
      if (known && known.memberCount > group.memberCount) return;
      groups.set(group.id, group);
      chat.updateGroup(group);
      if (packet.type === 'GROUP_CREATE') {
        creating = null;
        name.value = '';
        feedback.textContent = 'Đã tạo nhóm ' + group.name + '.';
        chat.open(group.id, group);
        return;
      }
      if (packet.type === 'GROUP_ADD' && packet.from === me) {
        adding = null;
        if (group.id === chat.selected()) {
          username.value = '';
          memberFeedback.textContent = 'Đã thêm ' + packet.username + ' vào nhóm.';
        }
      }
    } else if (packet.type !== 'MSG' || !packet.groupId) return;
    render();
  }
  return { onEvent, render };
}
