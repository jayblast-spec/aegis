'use client'

import { motion } from 'framer-motion'

type LogTone = 'muted' | 'ok' | 'warn' | 'danger'

export interface LogLine {
  text: string
  tone: LogTone
}

interface SandboxLogProps {
  lines: LogLine[]
  banner: {
    text: string
    tone: 'idle' | 'ok' | 'warn' | 'danger'
  }
}

const toneClasses: Record<LogTone | 'idle', string> = {
  muted: 'text-gray-500',
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  danger: 'text-red-400',
  idle: 'text-gray-400',
}

export function SandboxLog({ lines, banner }: SandboxLogProps) {
  return (
    <div className="space-y-4">
      {/* Banner */}
      <motion.div
        className={`p-3 rounded-lg border ${
          banner.tone === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
            : banner.tone === 'warn'
            ? 'bg-amber-500/10 border-amber-500/50 text-amber-400'
            : banner.tone === 'danger'
            ? 'bg-red-500/10 border-red-500/50 text-red-400'
            : 'bg-gray-800/50 border-gray-700 text-gray-400'
        }`}
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        key={`banner-${banner.text}`}
      >
        {banner.text}
      </motion.div>

      {/* Log Lines */}
      <div className="bg-gray-950/50 border border-gray-800/50 rounded-lg p-4 h-64 overflow-y-auto space-y-1 font-mono text-sm">
        {lines.map((line, idx) => (
          <motion.div
            key={`${idx}-${line.text}`}
            className={toneClasses[line.tone]}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
          >
            {line.text}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
