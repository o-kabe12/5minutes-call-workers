/**
 * 5分通話アプリ用シグナリングサーバー (Cloudflare Workers)
 *
 * このスクリプトは以下の機能を提供します：
 * 1. WebRTC接続のシグナリングメッセージの中継
 * 2. 同じパスコードを持つユーザー間でのメッセージング
 */

// Durable Objectの定義
export class RoomSignaling {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.messageQueue = [];
  }

  // 追加: Durable ObjectのfetchハンドラーでWebSocketを処理
  async fetch(request) {
    // WebSocketのハンドリング
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 });
    }

    // カスタムヘッダーからWebSocketを取得
    const websocket = request.headers.get('X-Custom-WebSocket');
    if (!websocket) {
      return new Response('Missing WebSocket', { status: 400 });
    }

    // URLからルームIDを抽出
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    // /room/123456/ という形式の場合、適切な部分を取得
    const roomId = pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1];

    // WebSocketセッションの処理
    this.handleSession(websocket, roomId);

    return new Response(null, { status: 101, webSocket: websocket });
  }

  // WebSocketセッションの追加
  handleSession(websocket, roomId) {
    // セッションをマップに追加
    this.sessions.set(websocket, { roomId });

    // WebSocketの終了時にセッションを削除
    websocket.addEventListener('close', () => {
      this.sessions.delete(websocket);
      this.broadcastParticipants(roomId);
    });

    // メッセージの受信と処理
    websocket.addEventListener('message', async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        
        // 必要なフィールドの検証
        if (!data.type || !data.roomId) {
          websocket.send(JSON.stringify({ error: 'Invalid message format' }));
          return;
        }
        
        // 同じルームの全てのクライアントにメッセージを転送
        this.broadcast(data.roomId, msg.data, websocket);
        
        // メッセージを一定期間保存
        this.messageQueue.push({
          roomId: data.roomId,
          message: msg.data,
          timestamp: Date.now()
        });
        
        // 古いメッセージを削除
        this.cleanMessageQueue();
      } catch (err) {
        console.error('Error processing message:', err);
        websocket.send(JSON.stringify({ error: 'Failed to process message' }));
      }
    });

    // 参加者情報の送信
    this.broadcastParticipants(roomId);
    
    // 接続が確立したことをクライアントに通知
    websocket.send(JSON.stringify({ type: 'connected', roomId }));
    
    // キューに保存されているメッセージを送信
    this.sendQueuedMessages(websocket, roomId);
  }

  // 同じルーム内の全参加者にメッセージをブロードキャスト
  broadcast(roomId, message, exclude = null) {
    for (const [client, data] of this.sessions.entries()) {
      if (client !== exclude && data.roomId === roomId) {
        client.send(message);
      }
    }
  }

  // 参加者情報の送信
  broadcastParticipants(roomId) {
    let count = 0;
    for (const [_, data] of this.sessions.entries()) {
      if (data.roomId === roomId) {
        count++;
      }
    }
    
    // 参加者数をブロードキャスト
    this.broadcast(roomId, JSON.stringify({
      type: 'participants',
      roomId,
      count
    }));
  }

  // 保存されたメッセージをクライアントに送信
  sendQueuedMessages(websocket, roomId) {
    for (const item of this.messageQueue) {
      if (item.roomId === roomId) {
        websocket.send(item.message);
      }
    }
  }

  // 古いメッセージをキューから削除
  cleanMessageQueue() {
    const currentTime = Date.now();
    const expireTime = 5 * 60 * 1000; // 5分
    
    this.messageQueue = this.messageQueue.filter(
      item => (currentTime - item.timestamp) < expireTime
    );
  }
}

// Cloudflare Workersのリクエストハンドラ
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      
      // WebSocketリクエストの処理
      if (request.headers.get('Upgrade') === 'websocket') {
        // パスコード（ルームID）の取得 - URLパス構造に合わせて修正
        const pathParts = url.pathname.split('/');
        const roomId = pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1];
        
        if (!roomId || !/^\d{6}$/.test(roomId)) {
          return new Response('Invalid room ID. It must be a 6-digit number.', { status: 400 });
        }
        
        // WebSocketサーバーの作成
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        
        // Durable Objectのインスタンスを取得
        const id = env.ROOM_SIGNALING.idFromName(roomId);
        const room = await env.ROOM_SIGNALING.get(id);
        
        // WebSocketセッションの処理をDurable Objectに委譲
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
      
      // 通常のHTTPリクエストに対するレスポンス
      return new Response('This is a WebSocket server for 5minutes-call signaling', {
        headers: { 'Content-Type': 'text/plain' }
      });
      
    } catch (err) {
      console.error('Error handling request:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};