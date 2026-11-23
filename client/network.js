const net = require('node:net');
const { TYPES, encode, createDecoder } = require('../common/protocol');
const { folders } = require('../common/media');

function createNetwork(notify) {
  let active = null;
  let session = null;
  let serial = 0;
  const fileRequests = new Map();

  function resetFileSession() {
    session = null;
    for (const pending of fileRequests.values()) pending.reject(new Error('Phiên truyền tệp đã ngắt.'));
    fileRequests.clear();
  }

  function fileChannel() {
    const current = session;
    function assertActive() {
      if (!current || current !== session) throw new Error('Hãy kết nối và đăng nhập lại.');
    }
    assertActive();
    return {
      assertActive,
      async request(action, fields, type = TYPES.FILE) {
        assertActive();
        const requestId = ++serial;
        let timer;
        try {
          return await new Promise((resolve, reject) => {
            fileRequests.set(requestId, { resolve, reject });
            timer = setTimeout(() => reject(new Error('Hết thời gian chờ truyền tệp.')), 30000);
            send({ type, action, ...fields, requestId });
          });
        } finally {
          clearTimeout(timer);
          fileRequests.delete(requestId);
        }
      }
    };
  }

  function receivePacket(packet) {
    if (packet.type === TYPES.FILE || (packet.type === TYPES.ERROR && Object.hasOwn(folders, packet.requestType))) {
      const pending = fileRequests.get(packet.requestId);
      if (packet.type === TYPES.ERROR) pending?.reject(new Error(packet.content));
      else {
        pending?.resolve(packet);
        if (session && packet.message?.type === TYPES.MSG) notify({ kind: 'received', packet: packet.message });
      }
      return; // Chỉ thông tin tệp trong hội thoại được chuyển qua IPC.
    }
    if (packet.type === TYPES.LOGIN || packet.type === TYPES.LOGOUT) {
      resetFileSession();
      if (packet.type === TYPES.LOGIN) session = {};
    }
    notify({ kind: 'received', packet });
  }

  function close() {
    resetFileSession();
    const old = active;
    active = null;
    old?.destroy();
  }

  function send(packet) {
    if (!active || active.connecting || !active.writable) throw new Error('Chưa kết nối đến Server.');
    active.write(encode(packet));
    // Nhật ký chỉ cần biết loại lệnh, không gửi lại mật khẩu qua IPC.
    if (packet.type !== TYPES.FILE) notify({ kind: 'sent', packet: { type: packet.type } });
  }

  function authenticate(type, username, password) {
    if (typeof username !== 'string' || typeof password !== 'string') throw new Error('Dữ liệu tài khoản không hợp lệ.');
    send({ type, username, password });
  }

  function ping() {
    send({ type: TYPES.PING });
  }

  function connect(host, port) {
    if (!net.isIP(host)) throw new Error('Địa chỉ IP không hợp lệ.');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Cổng không hợp lệ.');
    close();
    const socket = net.createConnection({ host, port });
    active = socket;
    const receive = createDecoder(receivePacket);
    notify({ kind: 'state', state: 'connecting', host, port });
    socket.setTimeout(8000, () => socket.destroy(new Error('Hết thời gian chờ kết nối.')));
    socket.on('connect', () => {
      if (socket !== active) return;
      socket.setTimeout(0);
      notify({ kind: 'state', state: 'connected', host, port });
      ping();
    });
    socket.on('data', chunk => {
      if (socket !== active) return;
      try {
        receive(chunk);
      } catch (error) {
        socket.destroy(error);
      }
    });
    socket.on('error', error => {
      if (socket === active) notify({ kind: 'error', message: error.message });
    });
    socket.on('close', () => {
      if (socket !== active) return;
      active = null;
      resetFileSession();
      notify({ kind: 'state', state: 'disconnected', host, port });
    });
  }
  return {
    connect, ping, close, fileChannel,
    register: (name, password) => authenticate(TYPES.REGISTER, name, password),
    login: (name, password) => authenticate(TYPES.LOGIN, name, password),
    logout: () => send({ type: TYPES.LOGOUT }),
    createGroup: name => send({ type: TYPES.GROUP_CREATE, name }),
    addMember: (groupId, username) => send({ type: TYPES.GROUP_ADD, groupId, username }),
    deleteGroup: groupId => send({ type: TYPES.GROUP_DELETE, groupId }),
    message: (to, content) => send({ type: TYPES.MSG, ...(typeof to === 'number' ? { groupId: to } : { to }), content }),
    acknowledge: (id, status) => send({ type: TYPES.ACK, id, status }),
    history: (peer, beforeId, requestId) => send({
      type: TYPES.HISTORY_REQ, ...(typeof peer === 'number' ? { groupId: peer } : { peer }), beforeId, requestId
    })
  };
}
module.exports = { createNetwork };
