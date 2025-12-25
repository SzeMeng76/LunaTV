/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Lock, Plus, RefreshCw, Users as UsersIcon, Video } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useWatchRoom } from '@/hooks/useWatchRoom';
import type { Room } from '@/types/watch-room.types';

import PageLayout from '@/components/PageLayout';

export default function WatchRoomListPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<{ enabled: boolean; serverUrl: string } | null>(null);
  const [authKey, setAuthKey] = useState('');
  const [userName, setUserName] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/watch-room/config');
        const data = await response.json();

        if (!data.enabled) {
          setError('观影室功能未启用，请联系管理员配置');
          setIsLoading(false);
          return;
        }

        setConfig(data);

        // 从 localStorage 加载用户名
        const savedUserName = localStorage.getItem('watchroom_username') || '';
        setUserName(savedUserName);

        // 获取完整配置（包含 authKey）
        const fullConfigResponse = await fetch('/api/watch-room/config', { method: 'POST' });
        const fullConfig = await fullConfigResponse.json();
        setAuthKey(fullConfig.authKey || '');

        setIsLoading(false);
      } catch (err) {
        console.error('加载配置失败:', err);
        setError('加载配置失败');
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  // 初始化 Socket.IO 连接
  const watchRoom = useWatchRoom({
    serverUrl: config?.serverUrl || '',
    authKey: authKey,
    userName: userName || '访客',
    onError: (err) => setError(err),
    onDisconnect: () => {
      setError('已断开连接');
    },
  });

  // 连接到服务器
  useEffect(() => {
    if (config && authKey && !watchRoom.connected) {
      watchRoom.connect();
    }
  }, [config, authKey, watchRoom]);

  // 加载房间列表
  const loadRooms = async () => {
    if (!watchRoom.connected) {
      return;
    }

    try {
      const roomList = await watchRoom.getRoomList();
      setRooms(roomList);
    } catch (err) {
      console.error('加载房间列表失败:', err);
    }
  };

  // 定期刷新房间列表
  useEffect(() => {
    if (watchRoom.connected) {
      loadRooms();
      const interval = setInterval(loadRooms, 5000);
      return () => clearInterval(interval);
    }
  }, [watchRoom.connected]);

  // 加载中
  if (isLoading) {
    return (
      <PageLayout>
        <div className='flex items-center justify-center min-h-screen'>
          <div className='text-center'>
            <RefreshCw className='w-8 h-8 animate-spin mx-auto mb-4 text-indigo-600' />
            <p className='text-gray-600 dark:text-gray-400'>加载中...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  // 错误状态
  if (error && !config) {
    return (
      <PageLayout>
        <div className='flex items-center justify-center min-h-screen'>
          <div className='text-center max-w-md'>
            <Video className='w-16 h-16 mx-auto mb-4 text-red-500' />
            <h2 className='text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2'>
              观影室不可用
            </h2>
            <p className='text-gray-600 dark:text-gray-400 mb-4'>{error}</p>
            <button
              onClick={() => router.push('/')}
              className='px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors'
            >
              返回首页
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className='container mx-auto px-4 py-8 max-w-6xl'>
        {/* 头部 */}
        <div className='mb-8'>
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2'>
                观影室
              </h1>
              <p className='text-gray-600 dark:text-gray-400'>
                与朋友一起同步观看视频，实时聊天互动
              </p>
            </div>
            <div className='flex gap-3'>
              <button
                onClick={loadRooms}
                disabled={!watchRoom.connected}
                className='px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center gap-2'
              >
                <RefreshCw className={`w-4 h-4 ${!watchRoom.connected ? 'animate-spin' : ''}`} />
                刷新
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                disabled={!watchRoom.connected || !userName}
                className='px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg transition-colors flex items-center gap-2'
              >
                <Plus className='w-4 h-4' />
                创建房间
              </button>
            </div>
          </div>

          {/* 连接状态 */}
          <div className='mt-4 flex items-center gap-4'>
            <div className='flex items-center gap-2'>
              <div className={`w-2 h-2 rounded-full ${watchRoom.connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className='text-sm text-gray-600 dark:text-gray-400'>
                {watchRoom.connected ? '已连接' : '未连接'}
              </span>
            </div>
            {!userName && (
              <div className='text-sm text-yellow-600 dark:text-yellow-400'>
                请先设置用户名
              </div>
            )}
          </div>
        </div>

        {/* 用户名设置 */}
        {!userName && (
          <div className='bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6'>
            <h3 className='font-medium text-yellow-900 dark:text-yellow-200 mb-3'>
              设置用户名
            </h3>
            <div className='flex gap-3'>
              <input
                type='text'
                placeholder='输入你的昵称'
                maxLength={20}
                className='flex-1 px-3 py-2 border border-yellow-300 dark:border-yellow-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const value = (e.target as HTMLInputElement).value.trim();
                    if (value) {
                      setUserName(value);
                      localStorage.setItem('watchroom_username', value);
                    }
                  }
                }}
              />
              <button
                onClick={(e) => {
                  const input = (e.target as HTMLButtonElement).previousElementSibling as HTMLInputElement;
                  const value = input.value.trim();
                  if (value) {
                    setUserName(value);
                    localStorage.setItem('watchroom_username', value);
                  }
                }}
                className='px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors'
              >
                确定
              </button>
            </div>
          </div>
        )}

        {/* 房间列表 */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
          {rooms.length === 0 ? (
            <div className='col-span-full text-center py-12'>
              <UsersIcon className='w-16 h-16 mx-auto mb-4 text-gray-400' />
              <p className='text-gray-600 dark:text-gray-400 mb-4'>
                暂无公开房间
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                disabled={!watchRoom.connected || !userName}
                className='px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg transition-colors'
              >
                创建第一个房间
              </button>
            </div>
          ) : (
            rooms.map((room) => (
              <div
                key={room.id}
                className='bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer'
                onClick={() => {
                  setSelectedRoom(room);
                  if (room.password) {
                    setShowJoinModal(true);
                  } else {
                    handleJoinRoom(room.id);
                  }
                }}
              >
                <div className='flex items-start justify-between mb-3'>
                  <div className='flex-1'>
                    <h3 className='font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2'>
                      {room.name}
                      {room.password && <Lock className='w-4 h-4 text-gray-400' />}
                    </h3>
                    <p className='text-sm text-gray-600 dark:text-gray-400 line-clamp-2'>
                      {room.description || '暂无描述'}
                    </p>
                  </div>
                </div>

                <div className='flex items-center justify-between text-sm'>
                  <div className='flex items-center gap-1 text-gray-600 dark:text-gray-400'>
                    <UsersIcon className='w-4 h-4' />
                    <span>{room.memberCount} 人</span>
                  </div>
                  <div className='text-gray-500 dark:text-gray-500'>
                    房主: {room.ownerName}
                  </div>
                </div>

                {room.currentState && room.currentState.type === 'play' && (
                  <div className='mt-3 text-xs text-indigo-600 dark:text-indigo-400 truncate'>
                    正在观看: {room.currentState.videoName}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 错误提示 */}
        {error && config && (
          <div className='mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4'>
            <p className='text-sm text-red-800 dark:text-red-200'>{error}</p>
          </div>
        )}
      </div>

      {/* 创建房间模态框 */}
      {showCreateModal && (
        <CreateRoomModal
          watchRoom={watchRoom}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(room) => {
            setShowCreateModal(false);
            router.push(`/watch-room/${room.id}`);
          }}
        />
      )}

      {/* 加入房间模态框 */}
      {showJoinModal && selectedRoom && (
        <JoinRoomModal
          room={selectedRoom}
          watchRoom={watchRoom}
          onClose={() => {
            setShowJoinModal(false);
            setSelectedRoom(null);
          }}
          onSuccess={(room) => {
            setShowJoinModal(false);
            setSelectedRoom(null);
            router.push(`/watch-room/${room.id}`);
          }}
        />
      )}
    </PageLayout>
  );

  // 加入房间（无密码）
  async function handleJoinRoom(roomId: string) {
    if (!userName) {
      setError('请先设置用户名');
      return;
    }

    try {
      const result = await watchRoom.joinRoom(roomId);
      if (result.success && result.room) {
        router.push(`/watch-room/${result.room.id}`);
      } else {
        setError(result.error || '加入房间失败');
      }
    } catch (err) {
      console.error('加入房间失败:', err);
      setError('加入房间失败');
    }
  }
}

// 创建房间模态框组件
function CreateRoomModal({
  watchRoom,
  onClose,
  onSuccess,
}: {
  watchRoom: any;
  onClose: () => void;
  onSuccess: (room: Room) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('请输入房间名称');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await watchRoom.createRoom({
        name: name.trim(),
        description: description.trim(),
        password: password.trim() || undefined,
        isPublic,
      });

      if (result.success && result.room) {
        onSuccess(result.room);
      } else {
        setError(result.error || '创建房间失败');
      }
    } catch (err: any) {
      console.error('创建房间失败:', err);
      setError(err.message || '创建房间失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
      <div className='bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6'>
        <h2 className='text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4'>
          创建观影室
        </h2>

        <div className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              房间名称 *
            </label>
            <input
              type='text'
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              placeholder='给房间起个名字'
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            />
          </div>

          <div>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              房间描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder='简单描述一下这个房间'
              rows={3}
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            />
          </div>

          <div>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              房间密码（可选）
            </label>
            <input
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={20}
              placeholder='留空表示无密码'
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            />
          </div>

          <div className='flex items-center gap-2'>
            <input
              type='checkbox'
              id='isPublic'
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className='w-4 h-4'
            />
            <label htmlFor='isPublic' className='text-sm text-gray-700 dark:text-gray-300'>
              公开房间（在房间列表中显示）
            </label>
          </div>

          {error && (
            <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3'>
              <p className='text-sm text-red-800 dark:text-red-200'>{error}</p>
            </div>
          )}
        </div>

        <div className='flex gap-3 mt-6'>
          <button
            onClick={onClose}
            disabled={isLoading}
            className='flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg transition-colors'
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={isLoading || !name.trim()}
            className='flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg transition-colors'
          >
            {isLoading ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 加入房间模态框组件
function JoinRoomModal({
  room,
  watchRoom,
  onClose,
  onSuccess,
}: {
  room: Room;
  watchRoom: any;
  onClose: () => void;
  onSuccess: (room: Room) => void;
}) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    setIsLoading(true);
    setError('');

    try {
      const result = await watchRoom.joinRoom(room.id, password.trim() || undefined);

      if (result.success && result.room) {
        onSuccess(result.room);
      } else {
        setError(result.error || '加入房间失败');
      }
    } catch (err: any) {
      console.error('加入房间失败:', err);
      setError(err.message || '加入房间失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
      <div className='bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6'>
        <h2 className='text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4'>
          加入房间
        </h2>

        <div className='mb-4'>
          <p className='text-gray-600 dark:text-gray-400 mb-2'>
            房间名称: <span className='font-medium text-gray-900 dark:text-gray-100'>{room.name}</span>
          </p>
          <p className='text-sm text-gray-500 dark:text-gray-500'>
            房主: {room.ownerName}
          </p>
        </div>

        {room.password && (
          <div className='mb-4'>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              房间密码 *
            </label>
            <input
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder='请输入房间密码'
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password.trim()) {
                  handleJoin();
                }
              }}
            />
          </div>
        )}

        {error && (
          <div className='mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3'>
            <p className='text-sm text-red-800 dark:text-red-200'>{error}</p>
          </div>
        )}

        <div className='flex gap-3'>
          <button
            onClick={onClose}
            disabled={isLoading}
            className='flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg transition-colors'
          >
            取消
          </button>
          <button
            onClick={handleJoin}
            disabled={isLoading || (room.password && !password.trim())}
            className='flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg transition-colors'
          >
            {isLoading ? '加入中...' : '加入'}
          </button>
        </div>
      </div>
    </div>
  );
}
