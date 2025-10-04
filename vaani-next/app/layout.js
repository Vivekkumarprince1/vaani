import './globals.css'
import { AuthProvider } from '../src/contexts/AuthContext'
import { TranslationProvider } from '../src/contexts/TranslationContext'

export const metadata = {
  title: 'Vaani',
  description: 'Real-time video calling and chat app with translation',
}

export default function RootLayout({
  children,
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <TranslationProvider>
            {children}
          </TranslationProvider>
        </AuthProvider>
      </body>
    </html>
  )
}