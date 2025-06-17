"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Particle {
  id: number
  x: number
  y: number
  color: string
  size: number
  velocity: { x: number; y: number }
  gravity: number
  life: number
  maxLife: number
}

export default function Component() {
  const [isAnimating, setIsAnimating] = useState(false)
  const [particles, setParticles] = useState<Particle[]>([])
  const [clickCount, setClickCount] = useState(0)
  const [isOnCooldown, setIsOnCooldown] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const colors = ["#3B82F6", "#1D4ED8", "#1E40AF", "#1E3A8A"]

  const createParticles = useCallback(() => {
    const newParticles: Particle[] = []
    const particleCount = 30

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2
      const velocity = 120 + Math.random() * 80

      newParticles.push({
        id: i,
        x: 0,
        y: 0,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        velocity: {
          x: Math.cos(angle) * velocity,
          y: Math.sin(angle) * velocity,
        },
        gravity: 0.5,
        life: 1,
        maxLife: 1.5 + Math.random() * 1,
      })
    }

    setParticles(newParticles)
  }, [])

  const handleButtonClick = () => {
    if (isOnCooldown) return

    // Update click count
    setClickCount((prev) => prev + 1)

    // Start animation
    setIsAnimating(true)
    createParticles()

    // Set cooldown
    setIsOnCooldown(true)

    // Set success state
    setTimeout(() => {
      setIsSuccess(true)
    }, 300)

    // Cleanup
    setTimeout(() => {
      setParticles([])
      setIsAnimating(false)
      setIsSuccess(false)
    }, 2500)

    // Remove cooldown
    setTimeout(() => {
      setIsOnCooldown(false)
    }, 1500)
  }

  // Particle physics
  useEffect(() => {
    if (!isAnimating) return

    const interval = setInterval(() => {
      setParticles((prev) =>
        prev
          .map((particle) => ({
            ...particle,
            x: particle.x + particle.velocity.x * 0.016,
            y: particle.y + particle.velocity.y * 0.016,
            velocity: {
              x: particle.velocity.x * 0.98,
              y: particle.velocity.y * 0.98 + particle.gravity,
            },
            life: particle.life - 0.016 / particle.maxLife,
          }))
          .filter((particle) => particle.life > 0),
      )
    }, 16)

    return () => clearInterval(interval)
  }, [isAnimating])

  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="relative">
        <Button
          className={`relative overflow-hidden font-semibold py-4 px-8 rounded-xl shadow-lg flex items-center gap-3 transition-all duration-300 bg-gradient-to-r ${
            isSuccess ? "from-green-500 to-emerald-600" : "from-blue-500 to-indigo-600"
          } text-white ${isOnCooldown ? "opacity-50 cursor-not-allowed" : "hover:scale-105"}`}
          onClick={handleButtonClick}
          disabled={isOnCooldown}
          asChild
        >
          <motion.div
            whileHover={!isOnCooldown ? { scale: 1.05 } : {}}
            whileTap={!isOnCooldown ? { scale: 0.95 } : {}}
            animate={{
              boxShadow: isAnimating
                ? [
                    "0 0 20px rgba(59, 130, 246, 0.5)",
                    "0 0 40px rgba(29, 78, 216, 0.8)",
                    "0 0 20px rgba(59, 130, 246, 0.5)",
                  ]
                : isSuccess
                  ? "0 0 25px rgba(34, 197, 94, 0.6)"
                  : "0 0 0px rgba(0,0,0,0)",
            }}
            transition={{
              duration: 0.5,
              repeat: isAnimating ? Number.POSITIVE_INFINITY : 0,
            }}
          >
            <motion.div
              animate={isAnimating ? { rotate: 360, scale: [1, 1.2, 1] } : { rotate: 0, scale: 1 }}
              transition={{
                duration: 0.6,
                ease: "easeInOut",
              }}
            >
              <Download className="w-5 h-5" />
            </motion.div>

            <motion.span
              className="text-lg font-bold"
              animate={isSuccess ? { scale: [1, 1.1, 1] } : { scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              {isSuccess ? "Success!" : "Download CSV"}
            </motion.span>

            {/* Shine effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              initial={{ x: "-100%" }}
              animate={isAnimating ? { x: "100%" } : { x: "-100%" }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
            />
          </motion.div>
        </Button>

        {/* Fireworks particles */}
        <AnimatePresence>
          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              className="absolute rounded-full pointer-events-none"
              style={{
                backgroundColor: particle.color,
                width: particle.size,
                height: particle.size,
                left: "50%",
                top: "50%",
                opacity: particle.life,
                transform: `translate(${particle.x}px, ${particle.y}px)`,
              }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            />
          ))}
        </AnimatePresence>

        {/* Cooldown indicator */}
        {isOnCooldown && (
          <motion.div
            className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-white text-xs bg-black/50 px-2 py-1 rounded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            Recharging...
          </motion.div>
        )}

        {/* Click counter */}
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-white text-sm">
          Clicks: {clickCount}
        </div>
      </div>
    </div>
  )
}
