function initAccountForm() {
  const form = document.querySelector('#auth-form');
  const modes = document.querySelector('#auth-mode');
  const submit = document.querySelector('#auth-submit');
  const username = document.querySelector('#username');
  const password = document.querySelector('#password');
  const feedback = document.querySelector('#auth-feedback');
  const session = document.querySelector('#session');
  const sessionName = document.querySelector('#session-name');
  const logout = document.querySelector('#logout');
  let connected = false;
  let pending = null;

  function message(text, error = false) {
    feedback.textContent = text;
    feedback.dataset.error = String(error);
  }

  function render() {
    const registering = form.elements.mode.value === 'register';
    submit.textContent = registering ? 'Đăng ký' : 'Đăng nhập';
    submit.disabled = !connected || Boolean(pending);
    logout.disabled = !connected || Boolean(pending);
    modes.disabled = Boolean(pending);
    username.readOnly = password.readOnly = Boolean(pending);
    password.autocomplete = registering ? 'new-password' : 'current-password';
    document.querySelector('#password-rule').hidden = !registering;
    form.hidden = Boolean(sessionName.textContent);
    session.hidden = !form.hidden;
    document.body.classList.toggle('signed-in', form.hidden);
  }

  modes.addEventListener('change', () => {
    password.value = '';
    message(connected ? '' : 'Kết nối đến Server để sử dụng tài khoản.');
    render();
  });

  async function request(action) {
    if (!connected || pending) return;
    const attempt = { action };
    pending = attempt;
    message('Đang chờ Server phản hồi…');
    render();
    try {
      if (action === 'logout') await window.tcp.logout();
      else await window.tcp[action](username.value, password.value);
    } catch {
      if (pending !== attempt) return;
      pending = null;
      message('Gửi yêu cầu thất bại. Hãy kiểm tra kết nối và thử lại.', true);
      render();
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    request(form.elements.mode.value);
  });
  logout.addEventListener('click', () => request('logout'));

  function onEvent(event) {
    if (event.kind === 'state') {
      connected = event.state === 'connected';
      if (event.state === 'disconnected') document.querySelector('#connection-settings').open = true;
      pending = null;
      sessionName.textContent = '';
      password.value = '';
      message(connected ? '' : 'Kết nối đến Server để sử dụng tài khoản.');
    } else if (event.kind === 'received' && pending) {
      const packet = event.packet;
      if (packet.type === 'ERROR') {
        if (packet.requestType && packet.requestType !== pending.action.toUpperCase()) return;
        message(packet.content || 'Yêu cầu thất bại.', true);
      } else if (packet.type === pending.action.toUpperCase()) {
        password.value = '';
        if (packet.type === 'REGISTER') {
          username.value = packet.username;
          form.elements.mode.value = 'login';
          message('Đã tạo tài khoản ' + packet.username + '. Nhập mật khẩu để đăng nhập.');
          password.focus();
        } else if (packet.type === 'LOGIN') {
          sessionName.textContent = packet.from;
          document.querySelector('#session-avatar').replaceChildren(chatAvatar(packet.from));
          document.querySelector('#connection-settings').open = false;
          message('');
        } else {
          sessionName.textContent = '';
          message('Đã đăng xuất.');
        }
      } else {
        return; // PING có thể về trước phản hồi tài khoản.
      }
      pending = null;
    } else {
      return;
    }
    render();
  }

  render();
  return onEvent;
}
