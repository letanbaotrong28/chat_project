function initFileTransfers(selectedPeer) {
  const attach = document.querySelector('#attach-file');
  const panel = document.querySelector('#file-transfer');
  const status = document.querySelector('#file-status');
  const bar = document.querySelector('#file-progress');
  let active = null;
  let previewKey = null;
  const recorder = initRecorder(selectedPeer, (peer, bytes) =>
    run('Đang gửi', 'Đang gửi bản ghi…', () => window.tcp.sendVoice(peer, bytes)));

  function setBusy(busy) {
    attach.disabled = busy;
    recorder.setBusy(busy);
    for (const button of document.querySelectorAll('#thread .attachment')) button.disabled = busy;
  }

  function reset(key) {
    previewKey = key;
    leaveChat();
    active = null;
    setBusy(false);
    panel.hidden = bar.hidden = true;
    status.textContent = '';
  }

  async function run(label, initial, operation) {
    if (active || !selectedPeer()) return false;
    const attempt = { label };
    active = attempt;
    setBusy(true);
    panel.hidden = false;
    bar.hidden = true;
    status.textContent = initial;
    try {
      const result = await operation();
      if (active !== attempt) return;
      status.textContent = result.error || result.text || '';
      return !result.error;
    } catch {
      if (active === attempt) status.textContent = 'Truyền tệp thất bại. Hãy kiểm tra kết nối rồi thử lại.';
    } finally {
      if (active === attempt) {
        active = null;
        setBusy(false);
        bar.hidden = true;
        panel.hidden = !status.textContent;
      }
    }
  }

  attach.addEventListener('click', () => run('Đang gửi', 'Đang chọn tệp…', () => window.tcp.upload(selectedPeer())));
  window.tcp.onFileProgress(({ name, percent }) => {
    if (!active) return;
    bar.value = percent;
    bar.hidden = false;
    status.textContent = active.label + ' ' + name + ' · ' + percent + '%';
    if (percent === 100) status.textContent += ' · Đang kiểm tra SHA-256…';
  });

  function decorate(bubble, packet) {
    const name = document.createElement('p');
    name.textContent = (packet.file.voice ? 'Tin nhắn thoại' : packet.file.name) + ' · ' + packet.file.size.toLocaleString('vi-VN') + ' byte';
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = Boolean(active);
    button.className = 'attachment';
    button.textContent = 'Tải tệp';
    button.setAttribute('aria-label', 'Tải tệp ' + packet.file.name);
    button.addEventListener('click', () => run('Đang tải', 'Đang chọn nơi lưu…', () => window.tcp.download(packet.id)));
    bubble.append(name);
    const kind = packet.file.mime?.split('/')[0];
    if (previewKey && ['image', 'video', 'audio'].includes(kind)) {
      const player = document.createElement(kind === 'image' ? 'img' : kind);
      player.className = 'media-preview';
      if (kind === 'image') {
        player.alt = packet.file.name;
        player.loading = 'lazy';
      } else {
        player.controls = true;
        player.preload = 'none';
        player.setAttribute('aria-label', packet.file.voice ? 'Tin nhắn thoại' : packet.file.name);
      }
      player.addEventListener('error', () => {
        const note = document.createElement('span');
        note.className = 'media-note';
        note.textContent = 'Không mở được nội dung này. Bạn có thể tải tệp về máy.';
        player.replaceWith(note);
      }, { once: true });
      player.src = 'chat-media://preview/' + previewKey + '/' + packet.id;
      bubble.append(player);
    }
    bubble.append(button);
  }
  function leaveChat() {
    recorder.reset();
    for (const player of document.querySelectorAll('#thread audio, #thread video')) player.pause();
  }
  return { decorate, reset, leaveChat };
}
