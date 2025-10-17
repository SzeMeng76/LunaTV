'use client';

import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import SourceTestModule from '@/components/SourceTestModule';

export default function SourceTestPage() {
  const router = useRouter();
  const [accessStatus, setAccessStatus] = useState<
    'checking' | 'authorized' | 'unauthorized'
  >('checking');

  useEffect(() => {
    let cancelled = false;

    const verifyAccess = async () => {
      try {
        const response = await fetch('/api/admin/role', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('forbidden');
        }

        if (!cancelled) {
          setAccessStatus('authorized');
        }
      } catch (error) {
        if (!cancelled) {
          setAccessStatus('unauthorized');
        }
      }
    };

    verifyAccess();

    return () => {
      cancelled = true;
    };
  }, []);

  if (accessStatus === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          正在校验访问权限...
        </div>
      </div>
    );
  }

  if (accessStatus === 'unauthorized') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-8 text-center space-y-4">
          <div className="flex items-center justify-center w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-xl mx-auto">
            <ShieldExclamationIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            无访问权限
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-6">
            源检测功能仅向管理员开放，请联系站长或管理员获取访问权限。
          </p>
          <button
            onClick={() => router.replace('/')}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 头部导航 */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <ArrowLeftIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <MagnifyingGlassIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                    源检测工具
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    测试各个源的搜索性能和质量
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 主要内容 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SourceTestModule />
      </div>
    </div>
  );
}
