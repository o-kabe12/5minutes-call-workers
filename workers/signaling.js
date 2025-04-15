/**
 * 5分通話アプリ用シグナリングサーバー (Cloudflare Workers)
 */

export class RoomSignaling {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.messageQueue = [];
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 });
    }

    const websocket = request.headers.get('X-Custom-WebSocket');
    if (!websocket) {
      return new Response('Missing WebSocket', { status: 400 });
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const roomId = pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1];

    this.handleSession(websocket, roomId);
    return new Response(null, { status: 101, webSocket: websocket });
  }

  handleSession(websocket, roomId) {
    this.sessions.set(websocket, { roomId });

    websocket.addEventListener('close', () => {
      this.sessions.delete(websocket);
      this.broadcastParticipants(roomId);
    });

    websocket.addEventListener('message', async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (!data.type || !data.roomId) {
          websocket.send(JSON.stringify({ error: 'Invalid message format' }));
          return;
        }

        this.broadcast(data.roomId, msg.data, websocket);

        this.messageQueue.push({
          roomId: data.roomId,
          message: msg.data,
          timestamp: Date.now()
        });

        this.cleanMessageQueue();
      } catch (err) {
        console.error('Error processing message:', err);
        websocket.send(JSON.stringify({ error: 'Failed to process message' }));
      }
    });

    this.broadcastParticipants(roomId);
    websocket.send(JSON.stringify({ type: 'connected', roomId }));
    this.sendQueuedMessages(websocket, roomId);
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
    for (const [_, data] of this.sessions.entries()) {
      if (data.roomId === roomId) {
        count++;
      }
    }

    this.broadcast(roomId, JSON.stringify({
      type: 'participants',
      roomId,
      count
    }));
  }

  sendQueuedMessages(websocket, roomId) {
    for (const item of this.messageQueue) {
      if (item.roomId === roomId) {
        websocket.send(item.message);
      }
    }
  }

  cleanMessageQueue() {
    const currentTime = Date.now();
    const expireTime = 5 * 60 * 1000;
    this.messageQueue = this.messageQueue.filter(
      item => (currentTime - item.timestamp) < expireTime
    );
  }
}

// Worker本体のfetchハンドラ
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (request.headers.get('Upgrade') === 'websocket') {
        const pathParts = url.pathname.split('/');
        const roomId = pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1];

        if (!roomId || !/^\d{6}$/.test(roomId)) {
          return new Response('Invalid room ID. It must be a 6-digit number.', { status: 400 });
        }

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        const id = env.ROOM_SIGNALING.idFromName(roomId);
        const room = await env.ROOM_SIGNALING.get(id);

        await room.fetch(request.url, {
          headers: {
            'Upgrade': 'websocket',
            'X-Custom-WebSocket': server
          }
        });

        return new Response(null, {
          status: 101,
          webSocket: client
        });
      }

      return new Response('This is a WebSocket server for 5minutes-call signaling', {
        headers: { 'Content-Type': 'text/plain' }
      });

    } catch (err) {
      console.error('Error handling request:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};
