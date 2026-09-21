'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'

interface MobileNavProps {
  active?: 'platform' | 'thesis' | 'sandbox' | 'receipt' | 'neutral-advantage' | 'compare'
}

export function MobileNav({ active }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)

  const navLinks = [
    { href: '/#platform', label: 'Platform', key: 'platform' },
    { href: '/#thesis', label: 'Thesis', key: 'thesis' },
    { href: '/#sandbox', label: 'Sandbox', key: 'sandbox' },
    { href: '/#receipt', label: 'Action Ledger', key: 'receipt' },
    { href: '/#neutral-advantage', label: 'Neutrality', key: 'neutral-advantage' },
    { href: '/compare', label: 'Compare', key: 'compare' },
  ]

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden p-2 rounded-lg hover:bg-gray-800 transition-colors"
        aria-label="Toggle menu"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="md:hidden absolute top-20 left-0 right-0 bg-[#07090E]/95 backdrop-blur-xl border-b border-gray-800/80 shadow-xl"
          >
            <nav className="flex flex-col p-4 space-y-1">
              {navLinks.map(link => (
                <Link
                  key={link.key}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={`px-3 py-2 rounded-lg transition-colors ${
                    active === link.key
                      ? 'text-emerald-400 bg-gray-800'
                      : 'text-gray-300 hover:text-emerald-400 hover:bg-gray-800/50'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
