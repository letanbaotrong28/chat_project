function initRecorder(selectedPeer, sendVoice) {
  const record = document.querySelector('#record-voice');
  const panel = document.querySelector('#voice-panel');
  const status = document.querySelector('#voice-status');
  const player = document.querySelector('#voice-draft');
  const stop = document.querySelector('#voice-stop');
  const send = document.querySelector('#voice-send');
  const cancel = document.querySelector('#voice-cancel');
  let current = null;
  let busy = false;

  function stopMic(take) {
    clearInterval(take.timer);
    take.stream?.getTracks().forEach(track => track.stop());
  }

  function reset() {
    const take = current;
    current = null;
    if (take) {
      if (take.recorder?.state === 'recording') take.recorder.stop();
      stopMic(take);
      if (take.url) {
        player.pause();
        player.removeAttribute('src');
        player.load();
        URL.revokeObjectURL(take.url);
      }
    }
    panel.hidden = player.hidden = stop.hidden = send.hidden = true;
    cancel.disabled = false;
    record.disabled = busy;
    status.textContent = '';
  }

  function fail(take, message) {
    if (current !== take) return;
    reset();
    panel.hidden = false;
    status.textContent = message;
  }

  function showTime(take) {
    const seconds = Math.floor((Date.now() - take.start) / 1000);
    status.textContent = 'Đang ghi âm · ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }

  record.addEventListener('click', async () => {
    if (busy || current || !selectedPeer()) return;
    const take = { peer: selectedPeer(), chunks: [], size: 0 };
    current = take;
    record.disabled = true;
    panel.hidden = false;
    status.textContent = 'Đang mở micrô…';
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder?.isTypeSupported('audio/webm;codecs=opus')) {
        fail(take, 'Thiết bị này không hỗ trợ ghi âm WebM/Opus.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      take.stream = stream;
      if (current !== take) { stopMic(take); return; }
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64000 });
      take.recorder = recorder;
      recorder.ondataavailable = event => {
        if (current !== take || !event.data.size) return;
        take.size += event.data.size;
        if (take.size > 16 * 1024 * 1024) return fail(take, 'Bản ghi vượt quá 16 MiB. Hãy ghi một đoạn ngắn hơn.');
        take.chunks.push(event.data);
      };
      recorder.onerror = () => fail(take, 'Ghi âm bị gián đoạn. Hãy kiểm tra micrô rồi ghi lại.');
      recorder.onstop = () => {
        stopMic(take);
        if (current !== take) return;
        if (!take.size) return fail(take, 'Bản ghi trống. Hãy ghi lại.');
        take.blob = new Blob(take.chunks, { type: recorder.mimeType });
        take.chunks = [];
        take.url = URL.createObjectURL(take.blob);
        player.src = take.url;
        player.hidden = send.hidden = false;
        send.disabled = busy;
        stop.hidden = true;
        status.textContent = 'Bản ghi đã sẵn sàng.';
      };
      recorder.start(500);
      take.start = Date.now();
      take.timer = setInterval(() => showTime(take), 1000);
      showTime(take);
      stop.hidden = false;
    } catch (error) {
      fail(take, error.name === 'NotAllowedError' ? 'Chưa có quyền dùng micrô. Hãy kiểm tra quyền micrô của hệ điều hành.' :
        'Không mở được micrô. Hãy kiểm tra thiết bị ghi âm.');
    }
  });

  stop.addEventListener('click', () => {
    if (current?.recorder?.state === 'recording') {
      stop.hidden = true;
      current.recorder.stop();
      stopMic(current);
    }
  });
  send.addEventListener('click', async () => {
    const take = current;
    if (!take?.blob || busy || take.sending || selectedPeer() !== take.peer) return;
    take.sending = true;
    send.disabled = cancel.disabled = true;
    player.pause();
    try {
      const bytes = new Uint8Array(await take.blob.arrayBuffer());
      if (current !== take) return;
      if (await sendVoice(take.peer, bytes) && current === take) reset();
    } catch {
      if (current === take) status.textContent = 'Không đọc được bản ghi. Hãy thử lại.';
    } finally {
      if (current === take) {
        take.sending = false;
        send.disabled = busy;
        cancel.disabled = false;
      }
    }
  });
  cancel.addEventListener('click', reset);
  window.addEventListener('pagehide', reset);
  return {
    reset,
    setBusy(value) {
      busy = value;
      record.disabled = busy || Boolean(current);
      send.disabled = busy || Boolean(current?.sending);
    }
  };
}
