/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { LogOut, MessageCircle, Send, Users as UsersIcon } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useWatchRoom } from '@/hooks/useWatchRoom';
import type { ChatMessage } from '@/types/watch-room.types';

import PageLayout from '@/components/PageLayout';

export default function WatchRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [config, setConfig] = useState<{ enabled: boolean; serverUrl: string } | null>(null);
  const [authKey, setAuthKey] = useState('');
  const [userName, setUserName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(true);
  const [messageInput, setMessageInput] = useState('');

  // 加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/watch-room/config');
        const data = await response.json();

        if (!data.enabled) {
          setError('观影室功能未启用');
          setIsLoading(false);
          return;
        }

        setConfig(data);

        // 从 localStorage 加载用户名
        const savedUserName = localStorage.getItem('watchroom_username') || '';
        if (!savedUserName) {
          router.push('/watch-room');
          return;
        }
        setUserName(savedUserName);

        // 获取完整配置
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
  }, [router]);

  // 初始化 Socket.IO
  const watchRoom = useWatchRoom({
    serverUrl: config?.serverUrl || '',
    authKey: authKey,
    userName: userName,
    onError: (err) => setError(err),
    onDisconnect: () => {
      setError('连接已断开');
      router.push('/watch-room');
    },
  });

  // 连接并加入房间
  useEffect(() => {
    if (config && authKey && userName && !watchRoom.connected) {
      watchRoom.connect();
    }

    // 连接成功后自动加入房间
    if (watchRoom.connected && !watchRoom.currentRoom) {
      const joinRoom = async () => {
        const result = await watchRoom.joinRoom(roomId);
        if (!result.success) {
          setError(result.error || '加入房间失败');
          setTimeout(() => router.push('/watch-room'), 2000);
        }
      };
      joinRoom();
    }
  }, [config, authKey, userName, watchRoom.connected, watchRoom.currentRoom, roomId, router]);

  // 发送消息
  const handleSendMessage = () => {
    if (!messageInput.trim()) return;

    watchRoom.sendMessage(messageInput.trim());
    setMessageInput('');
  };

  // 离开房间
  const handleLeaveRoom = () => {
    watchRoom.leaveRoom();
    router.push('/watch-room');
  };

  // 加载中
  if (isLoading) {
    return (
      <PageLayout>
        <div className='flex items-center justify-center min-h-screen'>
          <div className='text-center'>
            <div className='w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4' />
            <p className='text-gray-600 dark:text-gray-400'>加载中...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  // 错误状态
  if (error && !watchRoom.currentRoom) {
    return (
      <PageLayout>
        <div className='flex items-center justify-center min-h-screen'>
          <div className='text-center max-w-md'>
            <p className='text-red-600 dark:text-red-400 mb-4'>{error}</p>
            <button
              onClick={() => router.push('/watch-room')}
              className='px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors'
            >
              返回房间列表
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  const room = watchRoom.currentRoom;
  const isOwner = room && watchRoom.socket?.id === room.ownerId;

  return (
    <PageLayout>
      <div className='flex flex-col h-screen bg-gray-50 dark:bg-gray-900'>
        {/* 顶部栏 */}
        <div className='bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3'>
          <div className='flex items-center justify-between max-w-screen-2xl mx-auto'>
            <div className='flex items-center gap-4'>
              <h1 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
                {room?.name || '观影室'}
              </h1>
              {isOwner && (
                <span className='px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 text-xs font-medium rounded'>
                  房主
                </span>
              )}
            </div>

            <div className='flex items-center gap-3'>
              {/* 成员数 */}
              <div className='flex items-center gap-2 text-gray-600 dark:text-gray-400'>
                <UsersIcon className='w-5 h-5' />
                <span>{watchRoom.members.length}</span>
              </div>

              {/* 聊天切换 */}
              <button
                onClick={() => setShowChat(!showChat)}
                className='px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg transition-colors flex items-center gap-2'
              >
                <MessageCircle className='w-4 h-4' />
                <span className='hidden sm:inline'>聊天</span>
              </button>

              {/* 离开房间 */}
              <button
                onClick={handleLeaveRoom}
                className='px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2'
              >
                <LogOut className='w-4 h-4' />
                <span className='hidden sm:inline'>离开</span>
              </button>
            </div>
          </div>
        </div>

        {/* 主内容区 */}
        <div className='flex-1 flex overflow-hidden'>
          {/* 视频播放区 */}
          <div className='flex-1 flex items-center justify-center bg-black p-4'>
            <div className='text-center text-white'>
              <div className='mb-4'>
                <svg className='w-24 h-24 mx-auto opacity-50' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z' />
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
                </svg>
              </div>
              <p className='text-lg mb-2'>视频播放器</p>
              <p className='text-sm text-gray-400'>
                {room?.currentState?.type === 'play'
                  ? `正在播放: ${room.currentState.videoName}`
                  : '房主还没有选择视频'}
              </p>
              <p className='text-xs text-gray-500 mt-4'>
                完整的播放器同步功能将在后续版本中实现
              </p>
            </div>
          </div>

          {/* 聊天侧边栏 */}
          {showChat && (
            <div className='w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col'>
              {/* 成员列表 */}
              <div className='border-b border-gray-200 dark:border-gray-700 p-4'>
                <h3 className='font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2'>
                  <UsersIcon className='w-4 h-4' />
                  成员 ({watchRoom.members.length})
                </h3>
                <div className='space-y-2 max-h-32 overflow-y-auto'>
                  {watchRoom.members.map((member) => (
                    <div key={member.id} className='flex items-center gap-2 text-sm'>
                      <div className='w-2 h-2 bg-green-500 rounded-full' />
                      <span className='text-gray-900 dark:text-gray-100'>
                        {member.name}
                        {member.isOwner && (
                          <span className='ml-2 text-xs text-indigo-600 dark:text-indigo-400'>
                            (房主)
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 聊天消息列表 */}
              <ChatMessageList messages={watchRoom.messages} currentUserId={watchRoom.socket?.id || ''} />

              {/* 消息输入框 */}
              <div className='border-t border-gray-200 dark:border-gray-700 p-4'>
                <div className='flex gap-2'>
                  <input
                    type='text'
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder='输入消息...'
                    maxLength={500}
                    className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim()}
                    className='px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg transition-colors'
                  >
                    <Send className='w-4 h-4' />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

// 聊天消息列表组件
function ChatMessageList({ messages, currentUserId }: { messages: ChatMessage[]; currentUserId: string }) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className='flex-1 overflow-y-auto p-4 space-y-3'>
      {messages.length === 0 ? (
        <div className='text-center text-gray-500 dark:text-gray-400 text-sm mt-8'>
          还没有消息，开始聊天吧！
        </div>
      ) : (
        messages.map((message) => {
          const isCurrentUser = message.userId === currentUserId;
          return (
            <div
              key={message.id}
              className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                {!isCurrentUser && (
                  <div className='text-xs text-gray-600 dark:text-gray-400 mb-1'>
                    {message.userName}
                  </div>
                )}
                <div
                  className={`px-3 py-2 rounded-lg text-sm ${
                    isCurrentUser
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {message.content}
                </div>
                <div className='text-xs text-gray-500 dark:text-gray-500 mt-1'>
                  {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          );
        })
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
