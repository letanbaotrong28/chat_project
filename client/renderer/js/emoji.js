function initEmojiPicker(input) {
  const toggle = document.querySelector('#emoji-toggle');
  const list = document.querySelector('#emoji-list');
  const choices = [
    ['😀', 'Vui vẻ'], ['😂', 'Cười ra nước mắt'], ['🥰', 'Yêu mến'], ['😎', 'Ngầu'], ['🤔', 'Suy nghĩ'], ['😮', 'Ngạc nhiên'],
    ['🥳', 'Ăn mừng'], ['😢', 'Buồn'], ['😅', 'Cười ngượng'], ['🙌', 'Hoan hô'], ['👋', 'Vẫy tay'], ['👍', 'Đồng ý'],
    ['👏', 'Vỗ tay'], ['🙏', 'Cảm ơn'], ['💪', 'Cố lên'], ['❤️', 'Trái tim'], ['💯', 'Một trăm điểm'], ['🔥', 'Lửa'],
    ['🎉', 'Chúc mừng'], ['✨', 'Lấp lánh'], ['🚀', 'Tên lửa'], ['☕', 'Cà phê'], ['📚', 'Sách'], ['🧑‍💻', 'Lập trình viên']
  ];

  function close() {
    list.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  const buttons = choices.map(([symbol, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.textContent = symbol;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', () => {
      if (list.hidden || input.disabled || input.readOnly) return;
      // selectionStart/End dùng cùng đơn vị UTF-16 với setRangeText, kể cả emoji ghép.
      input.setRangeText(symbol, input.selectionStart, input.selectionEnd, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      close();
      input.focus();
    });
    list.append(button);
    return button;
  });

  toggle.addEventListener('click', () => {
    if (!list.hidden) return close();
    list.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    buttons[0].focus();
  });
  list.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      toggle.focus();
      return;
    }
    const index = buttons.indexOf(event.target);
    const columns = 6;
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
    if (index < 0 || !Object.hasOwn(moves, event.key)) return;
    event.preventDefault();
    buttons[(index + moves[event.key] + buttons.length) % buttons.length].focus();
  });

  function closeOutside(event) {
    if (!list.hidden && !toggle.contains(event.target) && !list.contains(event.target)) close();
  }
  document.addEventListener('pointerdown', closeOutside);
  document.addEventListener('focusin', closeOutside);
  return {
    close,
    sync() {
      toggle.disabled = input.disabled || input.readOnly;
      if (toggle.disabled) close();
    }
  };
}
