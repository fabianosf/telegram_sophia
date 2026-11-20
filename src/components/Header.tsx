import { useEffect, useState } from "react"
import { MenuIcon } from "lucide-react"

import { NAV, SITE } from "@/data/site"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export function Header() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-all duration-300",
        scrolled ? "bg-background/95 shadow-sm backdrop-blur" : "bg-background"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <a href="#inicio" className="flex items-center gap-3" aria-label={`${SITE.name} — início`}>
          <img src="/favicon.png" alt="" width={40} height={40} className="size-10 rounded-full" />
          <span className="font-serif text-2xl font-bold tracking-tight text-primary">
            SD<span className="text-accent">II</span>
          </span>
        </a>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-semibold text-primary/80 transition-colors hover:bg-muted hover:text-accent"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
              <MenuIcon className="size-6" />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetTitle className="px-6 pt-6 font-serif text-xl text-primary">{SITE.name}</SheetTitle>
            <SheetDescription className="sr-only">Menu de navegação</SheetDescription>
            <nav className="flex flex-col px-3" aria-label="Mobile">
              {NAV.map((item) => (
                <SheetClose asChild key={item.href}>
                  <a
                    href={item.href}
                    className="rounded-md px-3 py-3 text-base font-semibold text-primary hover:bg-muted hover:text-accent"
                  >
                    {item.label}
                  </a>
                </SheetClose>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
