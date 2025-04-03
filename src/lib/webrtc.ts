import SimplePeer from 'simple-peer';

// シグナリング状態の型
export type SignalingState = 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'error';

// シグナリングメッセージの型
type SignalingMessage = {
  type: 'offer' | 'answer' | 'candidate';
  payload: any;
  roomId: string; // パスコードをルームIDとして使用
};

// カスタムイベントの型定義
interface SignalingMessageEvent extends CustomEvent {
  detail: {
    roomId: string;
    message: any;
  };
}

// シグナリングサーバーのURL
const SIGNALING_URL = 'https://5minutes-call-signaling.workers.dev';

// シグナリングサーバーへの接続
async function connectToSignalingServer(roomId: string): Promise<WebSocket> {
  // 注: 実際のデプロイ時にはWebSocketサーバーのURLを設定
  // 開発中はローカルのサーバーへ接続することもできる
  return new Promise((resolve, reject) => {
    try {
      // この実装はデモ用であり、実際のプロダクションではCloudflare WorkersのDurable ObjectsなどでWebSocketを実装する必要がある
      // 今回はローカルストレージを使って疑似的なシグナリングを行う（デモ用）
      const mockSocket = {
        send: (message: string) => {
          const data = JSON.parse(message);
          localStorage.setItem(`signaling_${roomId}_${data.type}`, message);
          
          // イベントをディスパッチして他のタブに通知（デモ用）
          window.dispatchEvent(new CustomEvent('signaling_message', { 
            detail: { roomId, message: data } 
          }));
        },
        close: () => {
          window.removeEventListener('storage', storageListener);
          window.removeEventListener('signaling_message', messageListener);
        },
        onmessage: (callback: (event: { data: string }) => void) => {
          msgCallback = callback;
        },
        onerror: (callback: (error: Event) => void) => {
          errCallback = callback;
        },
        onopen: (callback: () => void) => {
          // 即時オープンとみなす
          setTimeout(callback, 0);
        },
      };

      let msgCallback: ((event: { data: string }) => void) | null = null;
      let errCallback: ((error: Event) => void) | null = null;

      // ローカルストレージの変更を監視（デモ用）
      const storageListener = (event: StorageEvent) => {
        if (event.key && event.key.startsWith(`signaling_${roomId}_`) && msgCallback) {
          msgCallback({ data: event.newValue || '' });
        }
      };

      // カスタムイベントを監視（デモ用、同じタブ内での通信）
      const messageListener = (event: Event) => {
        const customEvent = event as SignalingMessageEvent;
        if (customEvent.detail?.roomId === roomId && msgCallback) {
          const message = JSON.stringify(customEvent.detail.message);
          msgCallback({ data: message });
        }
      };

      window.addEventListener('storage', storageListener);
      window.addEventListener('signaling_message', messageListener);

      resolve(mockSocket as unknown as WebSocket);
    } catch (error) {
      reject(error);
    }
  });
}

// WebRTC接続のセットアップ
export async function setupWebRTC(roomId: string) {
  let peer: SimplePeer.Instance | null = null;
  let localStream: MediaStream | null = null;
  let remoteStream = new MediaStream();
  let state: SignalingState = 'waiting';
  
  try {
    // マイクへのアクセス許可を要求
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    
    // シグナリングサーバーに接続
    const socket = await connectToSignalingServer(roomId);
    
    // WebRTCピアの初期化
    const isInitiator = !localStorage.getItem(`signaling_${roomId}_offer`);
    
    peer = new SimplePeer({
      initiator: isInitiator,
      stream: localStream,
      trickle: true
    });
    
    // 接続状態の監視
    state = 'connecting';
    
    // シグナリング処理
    peer.on('signal', (data) => {
      const message: SignalingMessage = {
        type: data.type === 'offer' ? 'offer' : data.type === 'answer' ? 'answer' : 'candidate',
        payload: data,
        roomId
      };
      socket.send(JSON.stringify(message));
    });
    
    // リモートストリームの処理
    peer.on('stream', (stream) => {
      stream.getTracks().forEach(track => {
        remoteStream.addTrack(track);
      });
    });
    
    // シグナリングメッセージの受信と処理
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as SignalingMessage;
        
        if (message.roomId === roomId) {
          // 各種シグナリングメッセージの処理
          if (message.type === 'offer' || message.type === 'answer' || message.type === 'candidate') {
            peer?.signal(message.payload);
          }
        }
      } catch (error) {
        console.error('Failed to parse signaling message:', error);
      }
    };
    
    socket.onerror = (error) => {
      console.error('Signaling server error:', error);
      state = 'error';
    };
    
    // 接続の確立を待機
    return { peer, localStream, remoteStream, state };
    
  } catch (error) {
    console.error('WebRTC setup error:', error);
    
    // エラー発生時のクリーンアップ
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    if (peer) {
      peer.destroy();
    }
    
    state = 'error';
    return { peer: null, localStream: null, remoteStream, state };
  }
} 