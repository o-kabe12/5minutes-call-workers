// roomSignaling.js

export class RoomSignaling {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.messageQueue = [];
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket", { status: 400 });
    }

    const webSocket = request.webSocket;
    if (!webSocket) {
      return new Response("Missing WebSocket object", { status: 400 });
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const roomId = pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1];

    this.handleSession(webSocket, roomId);

    return new Response(null, { status: 101, webSocket });
  }

  handleSession(webSocket, roomId) {
    this.sessions.set(webSocket, { roomId });

    webSocket.accept(); // 必須: Cloudflareでは accept() を呼ぶ

    webSocket.addEventListener("close", () => {
      this.sessions.delete(webSocket);
      this.broadcastParticipants(roomId);
    });

    webSocket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);

        if (!data.type || !data.roomId) {
          webSocket.send(JSON.stringify({ error: "Invalid message format" }));
          return;
        }

        this.broadcast(data.roomId, event.data, webSocket);

        this.messageQueue.push({
          roomId: data.roomId,
          message: event.data,
          timestamp: Date.now()
        });

        this.cleanMessageQueue();
      } catch (err) {
        console.error("Error processing message:", err);
        webSocket.send(JSON.stringify({ error: "Failed to process message" }));
      }
    });

    // 接続通知と履歴送信
    webSocket.send(JSON.stringify({ type: "connected", roomId }));
    this.sendQueuedMessages(webSocket, roomId);
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
    for (const [, data] of this.sessions.entries()) {
      if (data.roomId === roomId) count++;
    }

    this.broadcast(roomId, JSON.stringify({
      type: "participants",
      roomId,
      count
    }));
  }

  sendQueuedMessages(webSocket, roomId) {
    for (const item of this.messageQueue) {
      if (item.roomId === roomId) {
        webSocket.send(item.message);
      }
    }
  }

  cleanMessageQueue() {
    const now = Date.now();
    const expire = 5 * 60 * 1000; // 5分
    this.messageQueue = this.messageQueue.filter(msg => now - msg.timestamp < expire);
  }
}
