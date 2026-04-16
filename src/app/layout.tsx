import type { Metadata } from 'next';
import './globals.css';
import ToastProvider from '@/components/ToastProvider';
import { ChatProvider } from '@/components/chat/ChatProvider';

export const metadata: Metadata = {
  title: 'Social Multi Poster — AI-Powered Social Media Dashboard',
  description: 'Post to Instagram, X/Twitter, and Discord from a single AI-powered dashboard. Free, open-source, and privacy-first.',
  keywords: ['social media', 'multi-platform posting', 'AI chatbot', 'Discord bot', 'automation'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body suppressHydrationWarning>
        <ChatProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ChatProvider>
      </body>
    </html>
  );
}
