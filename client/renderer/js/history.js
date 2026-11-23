function createHistoryRequests() {
  let serial = 0;
  const pending = new Map();

  function load(peer, beforeId) {
    const id = ++serial;
    return new Promise((resolve, reject) => {
      function finish(packet, error) {
        clearTimeout(timer);
        pending.delete(id);
        if (error) reject(error);
        else resolve(packet);
      }
      const timer = setTimeout(() => finish(null, new Error('Hết thời gian chờ lịch sử.')), 12000);
      pending.set(id, finish);
      window.tcp.history(peer, beforeId, id).catch(() => finish(null, new Error('Không gửi được yêu cầu lịch sử.')));
    });
  }

  function receive(packet) {
    if (packet.type === 'HISTORY') pending.get(packet.requestId)?.(packet);
    if (packet.type === 'ERROR' && packet.requestType === 'HISTORY_REQ') {
      pending.get(packet.requestId)?.(null, new Error(packet.content));
    }
  }

  function reset() {
    for (const finish of pending.values()) finish(null, new Error('Phiên đã kết thúc.'));
  }
  return { load, receive, reset };
}
