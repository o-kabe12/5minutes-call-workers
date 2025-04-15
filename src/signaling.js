// signaling.js

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // WebSocket通信かどうか確認
    if (request.headers.get("Upgrade") === "websocket") {
      const pathParts = url.pathname.split("/");
      const roomId = pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1];

      if (!roomId || !/^\d{6}$/.test(roomId)) {
        return new Response("Invalid room ID. It must be a 6-digit number.", { status: 400 });
      }

      // WebSocketを初期化
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Durable Objectのインスタンス取得
      const id = env.ROOM_SIGNALING.idFromName(roomId);
      const room = await env.ROOM_SIGNALING.get(id);

      // WebSocket付きのリクエストを作成してDOに送信
      const doRequest = new Request(request.url, {
        method: "GET",
        headers: request.headers,
        webSocket: server
      });

      await room.fetch(doRequest);

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    // 通常のリクエスト
    return new Response("This is a WebSocket server for 5minutes-call signaling", {
      headers: { "Content-Type": "text/plain" }
    });
  }
};
