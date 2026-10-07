import { useEffect } from 'react'

export type ShortcutKey = '?' | 'r' | 'e' | 's'

export function useKeyboardShortcuts(handlers: Partial<Record<ShortcutKey, () => void>>) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focused on input/textarea
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return
      }

      const key = e.key.toLowerCase()

      // Help with ?
      if (key === '?') {
        e.preventDefault()
        handlers['?']?.()
      }
      // Reset with R
      else if (key === 'r') {
        e.preventDefault()
        handlers['r']?.()
      }
      // Export with E
      else if (key === 'e') {
        e.preventDefault()
        handlers['e']?.()
      }
      // Submit with S
      else if (key === 's') {
        e.preventDefault()
        handlers['s']?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlers])
}
