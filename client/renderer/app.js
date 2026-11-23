const form = document.querySelector('#connection');
const statusLabel = document.querySelector('#status');
const log = document.querySelector('#log');
const pingButton = document.querySelector('#ping');
const connectButton = document.querySelector('#connect');
const connectionError = document.querySelector('#connection-error');
const updateAccount = initAccountForm();
const labels = { connecting: 'Đang kết nối', connected: 'Đã kết nối', disconnected: 'Đã ngắt kết nối' };

function logLine(label, message, kind) {
  document.querySelector('#empty')?.remove();
  const line = document.createElement('p');
  const prefix = document.createElement('strong');
  prefix.textContent = new Date().toLocaleTimeString('vi-VN') + '  ' + label + '  ';
  line.dataset.kind = kind;
  line.append(prefix, document.createTextNode(message));
  log.append(line);
  if (log.childElementCount > 200) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
}

window.tcp.onEvent(event => {
  updateAccount(event);
  if (event.kind === 'state') {
    if (event.state !== 'disconnected') connectionError.hidden = true;
    statusLabel.textContent = labels[event.state];
    statusLabel.dataset.state = event.state;
    connectButton.disabled = event.state === 'connecting';
    pingButton.disabled = event.state !== 'connected';
    logLine('TCP', labels[event.state] + ' · ' + event.host + ':' + event.port, event.kind);
  } else if (event.kind === 'error') {
    connectionError.textContent = 'Lỗi kết nối: ' + event.message;
    connectionError.hidden = false;
    logLine('LỖI', event.message, event.kind);
  } else {
    logLine(event.kind === 'sent' ? 'GỬI' : 'NHẬN', JSON.stringify(event.packet), event.kind);
  }
});
form.addEventListener('submit', event => {
  event.preventDefault();
  const host = document.querySelector('#host').value.trim();
  const port = document.querySelector('#port').valueAsNumber;
  window.tcp.connect(host, port).catch(error => {
    connectionError.textContent = 'Kiểm tra địa chỉ IP và cổng Server.';
    connectionError.hidden = false;
    logLine('LỖI', error.message, 'error');
  });
});
pingButton.addEventListener('click', () => {
  window.tcp.ping().catch(error => logLine('LỖI', error.message, 'error'));
});
