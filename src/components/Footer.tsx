'use client';

import { useThemeContext } from './ThemeProvider';

const Footer = () => {
  const { isDark } = useThemeContext();
  const currentYear = new Date().getFullYear();

  const linkStyle = {
    color: isDark ? '#a1a1aa' : '#616161',
    textDecoration: 'none',
    fontSize: '12px',
    transition: 'color 0.2s',
  };

  return (
    <footer
      style={{
        backgroundColor: isDark ? '#0a0a0a' : '#f2f2f2',
        borderTop: `1px solid ${isDark ? '#2a2a2a' : '#e0e0e0'}`,
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Top row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="10" height="10" fill="#F25022" />
              <rect x="11" width="10" height="10" fill="#7FBA00" />
              <rect y="11" width="10" height="10" fill="#00A4EF" />
              <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
            </svg>
            <span style={{ fontSize: '12px', color: isDark ? '#a1a1aa' : '#616161' }}>
              © {currentYear} Microsoft
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <a
              href="https://privacy.microsoft.com/privacystatement"
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              Privacy
            </a>
            <a
              href="https://www.microsoft.com/legal/terms-of-use"
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              Terms of Use
            </a>
            <a
              href="https://www.microsoft.com/trademarks"
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              Trademarks
            </a>
            <a
              href="https://azure.microsoft.com/support/legal/"
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              Legal
            </a>
          </div>
        </div>

        {/* Bottom row - Disclaimer */}
        <div
          style={{
            fontSize: '11px',
            color: isDark ? '#ffffff' : '#353434',
            lineHeight: '1.5',
          }}
        >
          This is an unofficial tool for viewing Real-Time Intelligence Streams. Built with the{' '}
          <a
            href="https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/eventhub/event-hubs"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: isDark ? '#ffffff' : '#2a2a2b' }}
          >
            @azure/event-hubs
          </a>{' '}
          SDK.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
