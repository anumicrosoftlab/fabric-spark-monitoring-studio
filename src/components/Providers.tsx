'use client';

import { FluentProvider, webDarkTheme } from '@fluentui/react-components';
import { ReactNode } from 'react';

interface ProvidersProps {
  children: ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <FluentProvider theme={webDarkTheme}>
      {children}
    </FluentProvider>
  );
}
