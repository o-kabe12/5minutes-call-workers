'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatTime } from '@/lib/utils';
import CallTimer from '@/components/CallTimer';
import CallControls from '@/components/CallControls';
import { setupWebRTC, SignalingState } from '@/lib/webrtc';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const passcode = params.passcode as string;
  const [connected, setConnected] = useState(false);
  const [signalingState, setSignalingState] = useState<SignalingState>('waiting');
  const [timeLeft, setTimeLeft] = useState(300); // 5分=300秒
  const [showAlert, setShowAlert] = useState(false);
  const peerRef = useRef<any>(null);
  const timerId = useRef<NodeJS.Timeout | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // WebRTC接続の初期化
  useEffect(() => {
    const setupCall = async () => {
      try {
        const { peer, localStream, remoteStream, state } = await setupWebRTC(passcode);
        
        peerRef.current = peer;
        localStreamRef.current = localStream;
        remoteStreamRef.current = remoteStream;
        
        if (localAudioRef.current) {
          localAudioRef.current.srcObject = localStream;
        }
        
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
        }
        
        setSignalingState(state);
        
        // 接続状態の監視
        if (peer) {
          peer.on('connect', () => {
            setConnected(true);
            setSignalingState('connected');
            // 接続完了後にタイマーを開始
            startTimer();
          });
        }
        
        if (peer) {
          peer.on('close', () => {
            setConnected(false);
            setSignalingState('disconnected');
            cleanupCall();
          });
        }
        
        if (peer) {
          peer.on('error', (err: any) => {
            console.error('Peer error:', err);
            setSignalingState('error');
          });
        }
        
      } catch (error) {
        console.error('Failed to setup WebRTC:', error);
        setSignalingState('error');
      }
    };
    
    setupCall();
    
    return () => {
      cleanupCall();
    };
  }, [passcode]);

  // タイマーの開始
  const startTimer = () => {
    if (timerId.current) clearInterval(timerId.current);
    
    timerId.current = setInterval(() => {
      setTimeLeft(prev => {
        // 残り1分（60秒）になったらアラートを表示
        if (prev === 60) {
          setShowAlert(true);
          // 3秒後にアラートを非表示
          setTimeout(() => setShowAlert(false), 3000);
        }
        
        // タイマーが0になったら通話を終了
        if (prev <= 1) {
          cleanupCall();
          router.push('/');
          return 0;
        }
        
        return prev - 1;
      });
    }, 1000);
  };

  // 通話リソースのクリーンアップ
  const cleanupCall = () => {
    if (timerId.current) {
      clearInterval(timerId.current);
      timerId.current = null;
    }
    
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
  };

  // 通話の切断処理
  const handleDisconnect = () => {
    cleanupCall();
    router.push('/');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-3xl font-bold mb-8">ルーム: {passcode}</h1>
      
      <div className="relative w-full max-w-md bg-white p-6 rounded-lg shadow-lg text-center">
        {showAlert && (
          <div className="absolute top-0 left-0 right-0 transform -translate-y-full bg-yellow-500 text-white p-3 rounded-t-lg">
            残り1分です！
          </div>
        )}
        
        <div className="mb-6">
          <CallTimer timeLeft={timeLeft} connected={connected} />
        </div>
        
        <div className="mb-6">
          {!connected && (
            <div className="bg-gray-100 p-4 rounded-lg">
              <p className="text-gray-700">
                {signalingState === 'waiting' && '相手の接続を待っています...'}
                {signalingState === 'connecting' && '接続中...'}
                {signalingState === 'error' && '接続エラーが発生しました。'}
                {signalingState === 'disconnected' && '接続が切断されました。'}
              </p>
            </div>
          )}
          
          {connected && (
            <div className="bg-green-100 p-4 rounded-lg">
              <p className="text-green-700">接続しました！</p>
            </div>
          )}
        </div>
        
        <CallControls connected={connected} onDisconnect={handleDisconnect} />
        
        {/* Audio要素（非表示） */}
        <audio ref={localAudioRef} muted autoPlay playsInline className="hidden" />
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      </div>
    </div>
  );
} 