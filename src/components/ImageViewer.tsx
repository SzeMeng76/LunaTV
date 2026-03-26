'use client';

import { X } from 'lucide-react';
import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ImageViewerProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  alt?: string;
}

const ImageViewer: React.FC<ImageViewerProps> = ({
  isOpen,
  onClose,
  imageUrl,
  alt = '图片',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let animationId: number;
    let timer: ReturnType<typeof setTimeout>;

    if (isOpen) {
      setIsVisible(true);
      animationId = requestAnimationFrame(() => {
        animationId = requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      setIsAnimating(false);
      timer = setTimeout(() => {
        setIsVisible(false);
      }, 200);
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (timer) clearTimeout(timer);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isVisible) {
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;
      const body = document.body;
      const html = document.documentElement;
      const scrollBarWidth = window.innerWidth - html.clientWidth;

      const orig = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        paddingRight: body.style.paddingRight,
        overflow: body.style.overflow,
      };

      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = `-${scrollX}px`;
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      body.style.paddingRight = `${scrollBarWidth}px`;

      return () => {
        body.style.position = orig.position;
        body.style.top = orig.top;
        body.style.left = orig.left;
        body.style.right = orig.right;
        body.style.width = orig.width;
        body.style.paddingRight = orig.paddingRight;
        body.style.overflow = orig.overflow;
        requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
      };
    }
  }, [isVisible]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isVisible) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isVisible, onClose]);

  if (!isVisible || !mounted) return null;

  return createPortal(
    <div className='fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4'>
      <div
        className={`absolute inset-0 bg-black/80 transition-opacity duration-200 ease-out ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
        style={{ backdropFilter: 'blur(4px)', willChange: 'opacity' }}
        onClick={onClose}
      />
      <button
        onClick={onClose}
        className='absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors duration-150'
        aria-label='关闭'
      >
        <X size={24} className='text-white' />
      </button>
      <div
        className='relative max-w-[100vw] max-h-[100vh] sm:max-w-[90vw] sm:max-h-[90vh] transition-all duration-200 ease-out'
        style={{
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
          transform: isAnimating ? 'scale(1) translateZ(0)' : 'scale(0.95) translateZ(0)',
          opacity: isAnimating ? 1 : 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={imageUrl}
          alt={alt}
          width={1200}
          height={1800}
          className='object-contain max-w-[100vw] max-h-[100vh] sm:max-w-[90vw] sm:max-h-[90vh] w-auto h-auto'
          style={{ maxWidth: '100vw', maxHeight: '100vh' }}
          priority
          quality={100}
        />
      </div>
    </div>,
    document.body
  );
};

export default ImageViewer;
