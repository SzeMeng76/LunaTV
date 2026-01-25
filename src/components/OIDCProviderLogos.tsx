import React from 'react';

// Google Logo SVG
export const GoogleLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

// Microsoft Logo SVG
export const MicrosoftLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
    <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
    <path fill="#f35325" d="M1 1h10v10H1z"/>
    <path fill="#81bc06" d="M12 1h10v10H12z"/>
    <path fill="#05a6f0" d="M1 12h10v10H1z"/>
    <path fill="#ffba08" d="M12 12h10v10H12z"/>
  </svg>
);

// GitHub Logo SVG
export const GitHubLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" clipRule="evenodd"/>
  </svg>
);

// Facebook Logo SVG
export const FacebookLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    <path fill="#FFFFFF" d="M16.671 15.543l.532-3.47h-3.328v-2.25c0-.949.465-1.874 1.956-1.874h1.514V4.996s-1.374-.235-2.686-.235c-2.741 0-4.533 1.662-4.533 4.669v2.632H7.078v3.47h3.047v8.385a12.118 12.118 0 003.75 0v-8.385h2.796z"/>
  </svg>
);

// LinuxDo Logo SVG (Official Logo - Three parts darkness, seven parts light)
export const LinuxDoLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <clipPath id="linuxdo-clip"><circle cx="60" cy="60" r="47"/></clipPath>
    <circle fill="#f0f0f0" cx="60" cy="60" r="50"/>
    <rect fill="#1c1c1e" clipPath="url(#linuxdo-clip)" x="10" y="10" width="100" height="30"/>
    <rect fill="#f0f0f0" clipPath="url(#linuxdo-clip)" x="10" y="40" width="100" height="40"/>
    <rect fill="#ffb003" clipPath="url(#linuxdo-clip)" x="10" y="80" width="100" height="30"/>
  </svg>
);

// WeChat Logo SVG
export const WeChatLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path fill="#09BB07" d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
  </svg>
);

// Apple Logo SVG
export const AppleLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  </svg>
);

// Generic OIDC Logo SVG
export const GenericOIDCLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
  </svg>
);

// Helper function to detect provider from issuer URL
export function detectProvider(issuer?: string): 'google' | 'microsoft' | 'github' | 'facebook' | 'wechat' | 'apple' | 'linuxdo' | 'generic' {
  if (!issuer) return 'generic';

  const lowerIssuer = issuer.toLowerCase();

  if (lowerIssuer.includes('google') || lowerIssuer.includes('accounts.google.com')) {
    return 'google';
  }
  if (lowerIssuer.includes('microsoft') || lowerIssuer.includes('login.microsoftonline.com') || lowerIssuer.includes('login.microsoft.com')) {
    return 'microsoft';
  }
  if (lowerIssuer.includes('github')) {
    return 'github';
  }
  if (lowerIssuer.includes('facebook') || lowerIssuer.includes('graph.facebook.com')) {
    return 'facebook';
  }
  if (lowerIssuer.includes('wechat') || lowerIssuer.includes('weixin.qq.com') || lowerIssuer.includes('open.weixin.qq.com')) {
    return 'wechat';
  }
  if (lowerIssuer.includes('apple') || lowerIssuer.includes('appleid.apple.com')) {
    return 'apple';
  }
  if (lowerIssuer.includes('linux.do') || lowerIssuer.includes('connect.linux.do')) {
    return 'linuxdo';
  }

  return 'generic';
}

// Get provider button styling
export function getProviderButtonStyle(provider: ReturnType<typeof detectProvider>) {
  switch (provider) {
    case 'google':
      return 'bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-300 dark:bg-gray-100 dark:hover:bg-white';
    case 'microsoft':
      return 'bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-300 dark:bg-gray-100 dark:hover:bg-white';
    case 'github':
      return 'bg-gray-900 hover:bg-gray-800 text-white border-2 border-gray-900 dark:bg-gray-800 dark:hover:bg-gray-700';
    case 'facebook':
      return 'bg-[#1877F2] hover:bg-[#166FE5] text-white border-2 border-[#1877F2]';
    case 'wechat':
      return 'bg-[#09BB07] hover:bg-[#08A006] text-white border-2 border-[#09BB07]';
    case 'apple':
      return 'bg-black hover:bg-gray-900 text-white border-2 border-black dark:bg-gray-900 dark:hover:bg-gray-800';
    case 'linuxdo':
      return 'bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-300 dark:bg-gray-100 dark:hover:bg-white dark:text-gray-800';
    default:
      return 'bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-gray-200 dark:border-gray-600';
  }
}

// Get provider default button text
export function getProviderButtonText(provider: ReturnType<typeof detectProvider>, customText?: string): string {
  if (customText) return customText;

  switch (provider) {
    case 'google':
      return '使用 Google 登录';
    case 'microsoft':
      return '使用 Microsoft 登录';
    case 'github':
      return '使用 GitHub 登录';
    case 'facebook':
      return '使用 Facebook 登录';
    case 'wechat':
      return '使用微信登录';
    case 'apple':
      return '使用 Apple 登录';
    case 'linuxdo':
      return '使用 LinuxDo 登录';
    default:
      return '使用OIDC登录';
  }
}

// Main OIDC Provider Logo component
export const OIDCProviderLogo: React.FC<{ provider: ReturnType<typeof detectProvider> }> = ({ provider }) => {
  switch (provider) {
    case 'google':
      return <GoogleLogo />;
    case 'microsoft':
      return <MicrosoftLogo />;
    case 'github':
      return <GitHubLogo />;
    case 'facebook':
      return <FacebookLogo />;
    case 'wechat':
      return <WeChatLogo />;
    case 'apple':
      return <AppleLogo />;
    case 'linuxdo':
      return <LinuxDoLogo />;
    default:
      return <GenericOIDCLogo />;
  }
};
