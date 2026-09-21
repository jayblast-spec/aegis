'use client'

import { motion } from 'framer-motion'

type SkeletonVariant = 'text' | 'card' | 'button'

interface SkeletonLoaderProps {
  variant?: SkeletonVariant
  count?: number
  width?: string
  height?: string
  className?: string
}

const variantClasses = {
  text: 'h-4 rounded-md',
  card: 'h-32 rounded-lg',
  button: 'h-10 rounded-lg',
}

export function SkeletonLoader({
  variant = 'text',
  count = 1,
  width = 'w-full',
  height,
  className = '',
}: SkeletonLoaderProps) {
  const baseClass = variantClasses[variant]
  const heightClass = height || (variant === 'text' ? 'h-4' : variant === 'button' ? 'h-10' : 'h-32')

  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className={`${width} ${heightClass} bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 rounded-md overflow-hidden ${className}`}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      ))}
    </div>
  )
}
