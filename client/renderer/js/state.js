function createMessageReceipts(thread) {
  const levels = ['sent', 'received', 'seen'];
  const labels = { sent: 'Đã gửi', received: 'Đã nhận', seen: 'Đã xem' };
  const confirmed = new Map();
  const pending = new Map();
  const visible = new Set();

  function apply(id, status) {
    const rank = levels.indexOf(status);
    if (rank < 0) return;
    // Lịch sử có thể về sau ACK mới hơn.
    if (rank > levels.indexOf(confirmed.get(id))) {
      confirmed.set(id, status);
      const label = thread.querySelector('[data-id="' + id + '"] .receipt');
      if (label) label.textContent = labels[status];
    }
    if (rank >= levels.indexOf(pending.get(id)?.status)) pending.delete(id);
  }

  function send(id, status) {
    const rank = levels.indexOf(status);
    if (levels.indexOf(confirmed.get(id)) >= rank || levels.indexOf(pending.get(id)?.status) >= rank) return;
    const attempt = { status };
    pending.set(id, attempt);
    window.tcp.acknowledge(id, status).catch(() => {
      if (pending.get(id) === attempt) pending.delete(id);
    });
  }

  function checkVisible() {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    const bounds = thread.getBoundingClientRect();
    for (const bubble of visible) {
      if (!thread.contains(bubble)) continue;
      const rect = bubble.getBoundingClientRect();
      if (rect.bottom > Math.max(0, bounds.top) && rect.top < Math.min(window.innerHeight, bounds.bottom)) {
        send(Number(bubble.dataset.id), 'seen');
      }
    }
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (thread.contains(entry.target) && entry.isIntersecting) {
        visible.add(entry.target);
      } else visible.delete(entry.target);
    }
    checkVisible();
  }, { threshold: [0, 0.01] });
  thread.addEventListener('scroll', checkVisible, { passive: true });
  window.addEventListener('focus', checkVisible);
  document.addEventListener('visibilitychange', checkVisible);

  function track(packet, me) {
    if (!Number.isSafeInteger(packet.id)) return;
    apply(packet.id, packet.status || 'sent');
    if (packet.to === me) send(packet.id, 'received');
  }

  function decorate(bubble, packet, me) {
    if (packet.from === me) {
      const label = document.createElement('small');
      label.className = 'receipt';
      label.textContent = labels[confirmed.get(packet.id)] || labels.sent;
      bubble.append(label);
    } else observer.observe(bubble);
  }

  function clearView() {
    observer.disconnect();
    visible.clear();
  }
  function reset() {
    clearView();
    confirmed.clear();
    pending.clear();
  }
  return {
    track, decorate, clearView, reset,
    removeBubble(bubble) {
      observer.unobserve(bubble);
      visible.delete(bubble);
    },
    onPacket(packet, me) {
      if (packet.type === 'ACK' && Number.isSafeInteger(packet.id) && (packet.from === me || packet.to === me)) {
        apply(packet.id, packet.status);
      } else if (packet.type === 'ERROR' && packet.requestType === 'ACK') {
        pending.delete(packet.id);
      }
    }
  };
}
