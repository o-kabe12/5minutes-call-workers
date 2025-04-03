'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isCreatedToday } from '@/lib/utils';

export default function Home() {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleCreateRoom = () => {
    // パスコードの検証：4桁の数字であることをチェック
    if (!/^\d{4}$/.test(passcode)) {
      setError('パスコードは4桁の数字を入力してください');
      return;
    }

    // 既に今日ルームを作成済みかチェック
    if (isCreatedToday()) {
      setError('既に今日はルームを作成済みです。明日また利用してください。');
      return;
    }

    // ルーム作成の記録
    localStorage.setItem('lastCreatedRoom', JSON.stringify({
      date: new Date().toISOString(),
      passcode
    }));

    // ルームページへ遷移
    router.push(`/room/${passcode}`);
  };

  const handleEnterRoom = () => {
    // パスコードの検証：4桁の数字であることをチェック
    if (!/^\d{4}$/.test(passcode)) {
      setError('パスコードは4桁の数字を入力してください');
      return;
    }

    // ルームへ遷移
    router.push(`/room/${passcode}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <h1 className="text-4xl font-bold mb-8">５分通話</h1>
      <p className="mb-8 text-lg">
        1日1回、パスコードを使って5分間だけ会話できるアプリです。
      </p>

      <div className="max-w-md w-full bg-white p-6 rounded-lg shadow-md">
        <div className="mb-6">
          <label htmlFor="passcode" className="block text-left text-sm font-medium mb-2">
            パスコード（4桁の数字）
          </label>
          <input
            type="text"
            id="passcode"
            maxLength={4}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={passcode}
            onChange={(e) => {
              setPasscode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4));
              setError('');
            }}
            placeholder="例: 1234"
          />
          {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
        </div>

        <div className="flex flex-col space-y-4">
          <button
            onClick={handleCreateRoom}
            className="bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            ルームを作成する
          </button>
          <button
            onClick={handleEnterRoom}
            className="bg-gray-200 text-gray-800 py-3 px-6 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            ルームに入室する
          </button>
        </div>
      </div>
    </div>
  );
} 