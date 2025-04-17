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

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const url = new URL(request.url);
    const match = url.pathname.match(/\/room\/(\d{6})/);
    const roomId = match?.[1] || 'unknown';

    console.log(`🌐 New WebSocket connection to room: ${roomId}`);

    this.handleSession(server, roomId);

    return new Response(null, { status: 101, webSocket: client });
  }

  handleSession(socket, roomId) {
    this.sessions.set(socket, { roomId });

    socket.addEventListener('close', () => {
      console.log(`🔌 WebSocket disconnected from room: ${roomId}`);
      this.sessions.delete(socket);
      this.broadcastParticipants(roomId);
    });

    socket.addEventListener('message', (msg) => {
      console.log('[📩 message received]', msg.data);

      try {
        const data = JSON.parse(msg.data);

        if (!data.type || !data.roomId) {
          console.log('⚠️ Invalid message format');
          socket.send(JSON.stringify({ error: 'Invalid message format' }));
          return;
        }

        console.log(`📡 Broadcasting type "${data.type}" to room ${data.roomId}`);

        this.broadcast(data.roomId, msg.data, socket);

        this.messageQueue.push({
          roomId: data.roomId,
          message: msg.data,
          timestamp: Date.now()
        });

        this.cleanMessageQueue();
      } catch (err) {
        console.error('❌ Failed to process message:', err);
        socket.send(JSON.stringify({ error: 'Failed to process message' }));
      }
    });

    socket.send(JSON.stringify({ type: 'connected', roomId }));
    this.sendQueuedMessages(socket, roomId);
    this.broadcastParticipants(roomId);
  }

  broadcast(roomId, message, exclude = null) {
    console.log(`📣 Broadcasting to room ${roomId} (excluding sender)`);
    let count = 0;

    for (const [client, data] of this.sessions.entries()) {
      if (client !== exclude && data.roomId === roomId) {
        console.log('➡️ Sending message to a peer');
        client.send(message);
        count++;
      }
    }

    if (count === 0) {
      console.log('⚠️ No other clients to send to');
    }
  }

  broadcastParticipants(roomId) {
    let count = 0;
    for (const data of this.sessions.values()) {
      if (data.roomId === roomId) count++;
    }

    const message = JSON.stringify({
      type: 'participants',
      roomId,
      count
    });

    console.log(`👥 Broadcasting participants: ${count} in room ${roomId}`);
    this.broadcast(roomId, message);
  }

  sendQueuedMessages(socket, roomId) {
    console.log(`📦 Sending queued messages to new client in room ${roomId}`);

    for (const item of this.messageQueue) {
      if (item.roomId === roomId) {
        console.log('🔁 Sending queued message:', item.message);
        socket.send(item.message);
      }
    }
  }

  cleanMessageQueue() {
    const currentTime = Date.now();
    const expireTime = 5 * 60 * 1000; // 5分
    const originalLength = this.messageQueue.length;

    this.messageQueue = this.messageQueue.filter(
      item => currentTime - item.timestamp < expireTime
    );

    const removed = originalLength - this.messageQueue.length;
    if (removed > 0) {
      console.log(`🧹 Cleaned up ${removed} expired messages from queue`);
    }
  }
}

// Workerエントリーポイント
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
