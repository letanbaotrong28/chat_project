function initMessageActions(thread, getMessage, currentUser, startReply, react) {
  const menu = document.querySelector('#message-menu');
  const palette = document.querySelector('#reaction-palette');
  const labels = new Map([['👍', 'Thích'], ['❤️', 'Yêu thích'], ['😂', 'Haha'], ['😮', 'Ngạc nhiên'],
    ['😢', 'Buồn'], ['😡', 'Phẫn nộ'], ['🎉', 'Chúc mừng']]);
  const box = document.querySelector('#message-dialog');
  const form = document.querySelector('#message-action-form');
  const editor = document.querySelector('#message-edit-text');
  const submit = document.querySelector('#confirm-message-action');
  const cancel = document.querySelector('#cancel-message-action');
  const error = document.querySelector('#message-action-error');
  let trigger = null;
  let target = null;
  let pending = null;

  function closeMenu() {
    menu.hidePopover();
    trigger?.setAttribute('aria-expanded', 'false');
  }
  function reset() {
    closeMenu();
    box.close();
    trigger = target = pending = null;
    editor.value = error.textContent = '';
  }
  function sync() {
    const editing = target?.action === 'edit';
    editor.disabled = cancel.disabled = Boolean(pending);
    submit.disabled = Boolean(pending) || (editing && (!editor.value.trim() || editor.value === getMessage(target.id)?.content));
  }

  function tool(label, className, symbol) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(symbol);
    return button;
  }

  for (const [emoji, label] of labels) {
    const choice = tool(label, 'reaction-choice', emoji);
    choice.dataset.emoji = emoji;
    palette.append(choice);
  }

  function decorate(bubble, msg) {
    if (!msg.recalledAt) {
      const smile = tool('Thả cảm xúc', 'message-quick message-react', chatIcon('smile'));
      smile.popoverTargetElement = menu;
      smile.setAttribute('aria-controls', menu.id);
      smile.setAttribute('aria-expanded', 'false');
      bubble.append(tool('Trả lời', 'message-quick message-reply', chatIcon('reply')), smile);
    }
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'message-more';
    more.textContent = '•••';
    more.title = 'Tùy chọn tin nhắn';
    more.setAttribute('aria-label', more.title);
    more.setAttribute('aria-controls', menu.id);
    more.setAttribute('aria-expanded', 'false');
    more.popoverTargetElement = menu;
    bubble.append(more);
  }
  function renderReactions(bubble, msg) {
    let badges = bubble.querySelector('.reaction-badges');
    if (!msg.reactions?.length || msg.recalledAt) {
      badges?.remove();
      return;
    }
    if (!badges) {
      badges = document.createElement('div');
      badges.className = 'reaction-badges';
      bubble.append(badges);
    }
    const buttons = msg.reactions.map(({ emoji, count }) => {
      const button = tool(labels.get(emoji) + ' · ' + count, 'reaction-badge', emoji + ' ' + count);
      button.dataset.emoji = emoji;
      button.setAttribute('aria-pressed', String(msg.myReaction === emoji));
      return button;
    });
    badges.replaceChildren(...buttons);
  }
  thread.addEventListener('click', event => {
    const button = event.target.closest('.message-more, .message-quick, .reaction-badge');
    if (!button) return;
    event.preventDefault();
    if (trigger === button && menu.matches(':popover-open')) return closeMenu();
    closeMenu();
    const id = Number(button.closest('.bubble').dataset.id);
    const msg = getMessage(id);
    if (!msg) return;
    if (button.classList.contains('message-reply')) return startReply(id);
    if (button.dataset.emoji) return react(msg, button.dataset.emoji);
    trigger = button;
    menu.classList.toggle('palette-only', button.classList.contains('message-react'));
    palette.hidden = Boolean(msg.recalledAt);
    for (const choice of palette.children) choice.setAttribute('aria-pressed', String(choice.dataset.emoji === msg.myReaction));
    menu.querySelector('[data-action="reply"]').hidden = Boolean(msg.recalledAt);
    const own = msg.from === currentUser() && !msg.recalledAt;
    menu.querySelector('[data-action="edit"]').hidden = !own || Boolean(msg.file);
    menu.querySelector('[data-action="recall"]').hidden = !own;
    menu.showPopover();
    const rect = button.getBoundingClientRect();
    const left = Math.max(6, Math.min(innerWidth - menu.offsetWidth - 6, rect.right - menu.offsetWidth));
    const top = rect.bottom + menu.offsetHeight + 6 <= innerHeight ? rect.bottom + 3 : rect.top - menu.offsetHeight - 3;
    menu.style.left = left + 'px';
    menu.style.top = Math.max(4, top) + 'px';
    button.setAttribute('aria-expanded', 'true');
    (palette.hidden ? menu.querySelector('[data-action="hide"]') : palette.querySelector('[aria-pressed="true"]') || palette.firstElementChild)
      .focus({ preventScroll: true });
  });
  menu.addEventListener('toggle', () => trigger?.setAttribute('aria-expanded', String(menu.matches(':popover-open'))));
  menu.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const id = Number(trigger?.closest('.bubble')?.dataset.id);
    const msg = getMessage(id);
    if (!msg) return;
    closeMenu();
    const emoji = event.target.closest('[data-emoji]')?.dataset.emoji;
    if (emoji) return react(msg, emoji);
    if (action === 'reply') return startReply(id);
    if (!action) return;
    target = { id, action };
    const editing = action === 'edit';
    const everyone = action === 'recall';
    document.querySelector('#message-dialog-title').textContent = editing ? 'Chỉnh sửa tin nhắn' :
      everyone ? 'Thu hồi với mọi người?' : 'Thu hồi ở phía bạn?';
    const note = document.querySelector('#message-dialog-note');
    note.hidden = editing;
    note.textContent = editing ? '' : everyone ? 'Mọi người sẽ thấy thông báo rằng bạn đã thu hồi tin nhắn này.' :
      'Tin nhắn sẽ biến mất khỏi lịch sử của bạn. Những người khác vẫn thấy tin nhắn trong cuộc trò chuyện.';
    editor.hidden = !editing;
    editor.value = editing ? msg.content : '';
    error.textContent = '';
    submit.textContent = editing ? 'Lưu thay đổi' : 'Thu hồi';
    submit.classList.toggle('destructive', !editing);
    sync();
    box.showModal();
    if (editing) {
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    } else cancel.focus();
  });
  editor.addEventListener('input', sync);
  cancel.addEventListener('click', () => box.close());
  box.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
  box.addEventListener('close', () => {
    if (box.open) return;
    target = null;
    editor.value = '';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!target || submit.disabled) return;
    const attempt = target;
    pending = attempt;
    error.textContent = '';
    sync();
    try {
      await window.tcp.updateMessage(attempt.id, attempt.action, attempt.action === 'edit' ? editor.value : undefined);
    } catch {
      if (pending !== attempt) return;
      pending = null;
      error.textContent = 'Không gửi được yêu cầu. Hãy kiểm tra kết nối.';
      sync();
    }
  });
  function receive(packet) {
    if (packet.type === 'ERROR' && packet.requestType === 'MSG_UPDATE' && pending?.id === packet.id) {
      pending = null;
      error.textContent = packet.content;
      sync();
    } else if (packet.type === 'MSG_UPDATE') {
      if (target?.id === packet.id && (packet.action !== 'edit' || packet.from === currentUser())) reset();
      else if (trigger?.closest('.bubble')?.dataset.id === String(packet.id)) closeMenu();
    }
  }
  thread.addEventListener('scroll', closeMenu, { passive: true });
  window.addEventListener('resize', closeMenu);
  return { decorate, renderReactions, receive, reset };
}
