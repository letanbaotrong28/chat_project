function chatIcon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const use = document.createElementNS(ns, 'use');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}

function chatAvatar(name, kind = 'user') {
  const badge = document.createElement('span');
  badge.className = 'avatar';
  badge.setAttribute('aria-hidden', 'true');
  if (kind === 'user') {
    const initial = [...name][0] || '';
    badge.textContent = initial.toLocaleUpperCase('vi');
    badge.dataset.tone = (initial.codePointAt(0) || 0) % 4;
  } else {
    badge.classList.add('avatar-' + kind);
    badge.append(chatIcon(kind));
  }
  return badge;
}
