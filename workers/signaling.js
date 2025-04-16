// signaling.js

export class RoomSignaling {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.messageQueue = [];
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 });
    }

    // WebSocketハンドシェイク処理
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // WebSocketを確実に有効化
    server.accept();

    const url = new URL(request.url);
    const match = url.pathname.match(/\/room\/(\d{6})/);
    const roomId = match?.[1] || 'unknown';

    this.handleSession(server, roomId);

    return new Response(null, { status: 101, webSocket: client });
  }

  handleSession(socket, roomId) {
    this.sessions.set(socket, { roomId });

    socket.addEventListener('close', () => {
      this.sessions.delete(socket);
      this.broadcastParticipants(roomId);
    });

    socket.addEventListener('message', (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (!data.type || !data.roomId) {
          socket.send(JSON.stringify({ error: 'Invalid message format' }));
          return;
        }

        this.broadcast(data.roomId, msg.data, socket);

        this.messageQueue.push({
          roomId: data.roomId,
          message: msg.data,
          timestamp: Date.now()
        });

        this.cleanMessageQueue();
      } catch (err) {
        console.error('Error processing message:', err);
        socket.send(JSON.stringify({ error: 'Failed to process message' }));
      }
    });

    socket.send(JSON.stringify({ type: 'connected', roomId }));
    this.sendQueuedMessages(socket, roomId);
    this.broadcastParticipants(roomId);
  }

  broadcast(roomId, message, exclude = null) {
    for (const [client, data] of this.sessions.entries()) {
      if (client !== exclude && data.roomId === roomId) {
        client.send(message);
      }
    }
  }

  broadcastParticipants(roomId) {
    let count = 0;
    for (const data of this.sessions.values()) {
      if (data.roomId === roomId) count++;
    }

    this.broadcast(roomId, JSON.stringify({
      type: 'participants',
      roomId,
      count
    }));
  }

  sendQueuedMessages(socket, roomId) {
    for (const item of this.messageQueue) {
      if (item.roomId === roomId) {
        socket.send(item.message);
      }
    }
  }

  cleanMessageQueue() {
    const currentTime = Date.now();
    const expireTime = 5 * 60 * 1000; // 5分
    this.messageQueue = this.messageQueue.filter(
      item => currentTime - item.timestamp < expireTime
    );
  }
}

// Worker本体
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      const match = url.pathname.match(/\/room\/(\d{6})/);
      const roomId = match?.[1];

      if (!roomId) {
        return new Response('Invalid room ID. It must be a 6-digit number.', { status: 400 });
      }

      const id = env.ROOM_SIGNALING.idFromName(roomId);
      const obj = await env.ROOM_SIGNALING.get(id);
      return await obj.fetch(request);
    }

    return new Response('This is a WebSocket signaling server.', {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
