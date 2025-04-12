export function connectToSignalingServer(passcode: string): {
  socket: WebSocket;
  send: (message: any) => void;
  onMessage: (handler: (message: any) => void) => void;
} {
  // const socket = new WebSocket(`wss://5minutes-call.koo710128.workers.dev/room/${passcode}`);

  //log確認
  const wsUrl = `wss://5minutes-call.koo710128.workers.dev/room/${passcode}`;
  console.log('🔌 接続先WebSocketURL:', wsUrl);

  const socket = new WebSocket(wsUrl);

  socket.addEventListener('open', () => {
    console.log('✅ WebSocket接続が確立しました');
  });

  socket.addEventListener('close', (event) => {
    console.log('🔌 WebSocket接続が切断されました', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean
    });
  });

  socket.addEventListener('error', (err) => {
    console.error('❌ WebSocketエラー:', err);
    // エラーの詳細情報を表示
    try {
      console.error('Error details:', JSON.stringify({
        type: err.type,
        message: (err as ErrorEvent).message || '(no message)',
        target: err.target && {
          url: (err.target as WebSocket).url,
          readyState: (err.target as WebSocket).readyState,
        }
      }));
    } catch (e) {
      console.error('Error details could not be stringified:', err);
    }
  });

  const listeners: ((msg: any) => void)[] = [];
  console.log('WebSocket状態:', socket.readyState);

  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      listeners.forEach((listener) => listener(data));
    } catch (err) {
      console.error('受信メッセージのパースエラー:', err);
    }
  });

  socket.addEventListener('open', () => {
    console.log('✅ WebSocket接続が確立しました');
  });

  socket.addEventListener('close', () => {
    console.log('🔌 WebSocket接続が切断されました');
  });

  socket.addEventListener('error', (err) => {
    console.error('❌ WebSocketエラー:', err, err.target);
  });

  const send = (message: any) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify(message));
      });
    }
  };

  const onMessage = (handler: (message: any) => void) => {
    listeners.push(handler);
  };

  return { socket, send, onMessage };
}
