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

// LinuxDo Logo SVG (using a Linux penguin icon as placeholder)
export const LinuxDoLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.504 0c-.155 0-.315.008-.480.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.84-.41 1.938-.232 2.541.214.728.796.862 1.395 1.033.775.222 1.56.459 2.43.459.599 0 1.19-.133 1.75-.36.336-.135.64-.33.915-.57.293-.254.54-.568.73-.928.38-.72.415-1.697.415-2.553 0-.84.03-1.68.45-2.39.21-.36.465-.675.765-.945.3-.27.645-.495 1.02-.675.75-.36 1.605-.51 2.46-.51.855 0 1.71.15 2.46.51.375.18.72.405 1.02.675.3.27.555.585.765.945.42.71.45 1.55.45 2.39 0 .856.035 1.833.415 2.553.19.36.437.674.73.928.275.24.579.435.915.57.56.227 1.151.36 1.75.36.87 0 1.655-.237 2.43-.459.599-.171 1.181-.305 1.395-1.033.178-.603.046-1.701-.232-2.541-.589-1.771-1.831-3.47-2.716-4.521-.75-1.067-.974-1.928-1.05-3.02-.065-1.491 1.056-5.965-3.17-6.298-.165-.013-.325-.021-.48-.021z"/>
  </svg>
);

// Generic OIDC Logo SVG
export const GenericOIDCLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
  </svg>
);

// Helper function to detect provider from issuer URL
export function detectProvider(issuer?: string): 'google' | 'microsoft' | 'github' | 'linuxdo' | 'generic' {
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
    case 'linuxdo':
      return 'bg-blue-600 hover:bg-blue-700 text-white border-2 border-blue-600';
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
    case 'linuxdo':
      return <LinuxDoLogo />;
    default:
      return <GenericOIDCLogo />;
  }
};
