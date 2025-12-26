// React Hook for Voice Chat in Watch Room
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Member } from '@/types/watch-room.types';

interface UseVoiceChatOptions {
  socket: any | null;
  roomId: string | null;
  isMicEnabled: boolean;
  isSpeakerEnabled: boolean;
  members: Member[];
}

export function useVoiceChat({
  socket,
  roomId,
  isMicEnabled,
  isSpeakerEnabled,
  members,
}: UseVoiceChatOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WebRTC 相关
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // ICE服务器配置
  const iceServers = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ];

  // 获取本地麦克风流
  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = stream;
      console.log('[VoiceChat] Got local stream');
      return stream;
    } catch (err) {
      console.error('[VoiceChat] Failed to get local stream:', err);
      setError('无法访问麦克风，请检查权限设置');
      throw err;
    }
  }, []);

  // 停止本地流
  const stopLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      console.log('[VoiceChat] Stopped local stream');
    }
  }, []);

  // 创建 RTCPeerConnection
  const createPeerConnection = useCallback(
    (peerId: string) => {
      const pc = new RTCPeerConnection({ iceServers });

      // ICE候选收集
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('voice:ice', {
            targetUserId: peerId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      // 接收远程音频流
      pc.ontrack = (event) => {
        console.log('[VoiceChat] Received remote track from', peerId);
        const remoteStream = event.streams[0];

        // 创建或更新音频元素播放远程流
        if (isSpeakerEnabled) {
          let audioElement = remoteAudioElementsRef.current.get(peerId);
          if (!audioElement) {
            audioElement = new Audio();
            audioElement.autoplay = true;
            remoteAudioElementsRef.current.set(peerId, audioElement);
          }
          audioElement.srcObject = remoteStream;
        }
      };

      // 连接状态变化
      pc.oniceconnectionstatechange = () => {
        console.log('[VoiceChat] ICE state with', peerId, ':', pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setIsConnected(true);
        } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          console.warn('[VoiceChat] Connection issue with', peerId);
        }
      };

      peerConnectionsRef.current.set(peerId, pc);
      return pc;
    },
    [socket, isSpeakerEnabled]
  );

  // 发起呼叫（创建offer）
  const callPeer = useCallback(
    async (peerId: string) => {
      if (!socket || !localStreamRef.current) return;

      console.log('[VoiceChat] Calling peer:', peerId);
      const pc = createPeerConnection(peerId);

      // 添加本地流到连接
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      // 创建offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 发送offer
      socket.emit('voice:offer', {
        targetUserId: peerId,
        offer: pc.localDescription,
      });
    },
    [socket, createPeerConnection]
  );

  // 清理特定peer连接
  const closePeerConnection = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerId);
    }

    const audioElement = remoteAudioElementsRef.current.get(peerId);
    if (audioElement) {
      audioElement.srcObject = null;
      remoteAudioElementsRef.current.delete(peerId);
    }

    console.log('[VoiceChat] Closed connection with', peerId);
  }, []);

  // 清理所有连接
  const closeAllConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    remoteAudioElementsRef.current.forEach((audio) => {
      audio.srcObject = null;
    });
    remoteAudioElementsRef.current.clear();

    console.log('[VoiceChat] Closed all connections');
  }, []);

  // 监听socket事件
  useEffect(() => {
    if (!socket || !roomId) return;

    // 接收offer
    const handleOffer = async (data: { userId: string; offer: RTCSessionDescriptionInit }) => {
      if (!localStreamRef.current) return;

      console.log('[VoiceChat] Received offer from', data.userId);
      const pc = createPeerConnection(data.userId);

      // 添加本地流
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      // 设置远程描述
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

      // 创建answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // 发送answer
      socket.emit('voice:answer', {
        targetUserId: data.userId,
        answer: pc.localDescription,
      });
    };

    // 接收answer
    const handleAnswer = async (data: { userId: string; answer: RTCSessionDescriptionInit }) => {
      console.log('[VoiceChat] Received answer from', data.userId);
      const pc = peerConnectionsRef.current.get(data.userId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    };

    // 接收ICE候选
    const handleIce = async (data: { userId: string; candidate: RTCIceCandidateInit }) => {
      console.log('[VoiceChat] Received ICE from', data.userId);
      const pc = peerConnectionsRef.current.get(data.userId);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    };

    socket.on('voice:offer', handleOffer);
    socket.on('voice:answer', handleAnswer);
    socket.on('voice:ice', handleIce);

    return () => {
      socket.off('voice:offer', handleOffer);
      socket.off('voice:answer', handleAnswer);
      socket.off('voice:ice', handleIce);
    };
  }, [socket, roomId, createPeerConnection]);

  // 麦克风开关控制
  useEffect(() => {
    if (!roomId) return;

    if (isMicEnabled) {
      // 打开麦克风
      getLocalStream()
        .then((stream) => {
          // 向所有房间成员发起呼叫
          members.forEach((member) => {
            if (member.id !== socket?.id) {
              callPeer(member.id);
            }
          });
        })
        .catch((err) => {
          console.error('[VoiceChat] Failed to start:', err);
        });
    } else {
      // 关闭麦克风
      stopLocalStream();
      closeAllConnections();
      setIsConnected(false);
    }

    return () => {
      if (!isMicEnabled) {
        stopLocalStream();
        closeAllConnections();
      }
    };
  }, [isMicEnabled, roomId]);

  // 扬声器开关控制
  useEffect(() => {
    remoteAudioElementsRef.current.forEach((audio) => {
      audio.muted = !isSpeakerEnabled;
    });
  }, [isSpeakerEnabled]);

  // 房间变化时清理
  useEffect(() => {
    return () => {
      stopLocalStream();
      closeAllConnections();
    };
  }, [roomId]);

  return {
    isConnected,
    error,
  };
}
