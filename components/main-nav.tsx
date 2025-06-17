"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"

import { siteConfig } from "@/config/site"

export function MainNav() {
  const pathname = usePathname()

  return (
    <div className="mr-4 hidden md:flex">
      <Link href="/" className="flex items-center gap-2 lg:mr-6">
        <Image
          src="/logo.png"
          alt="Ocean Integrity Logo"
          width={40}
          height={40}
          className="ml-2"
        />

      </Link>
    </div>
  )
}