import { useState } from "react"

import { GALLERY } from "@/data/site"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { SectionHeading } from "@/components/SectionHeading"

export function Gallery() {
  const [open, setOpen] = useState<number | null>(null)
  const item = open !== null ? GALLERY[open] : null

  return (
    <section id="galeria" className="py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          kicker="Galeria"
          title="Momentos do simpósio"
          subtitle="Registros do I Simpósio, realizado na Fiocruz Piauí."
        />

        <ul className="grid auto-rows-[200px] grid-cols-2 gap-3 md:grid-cols-4 md:auto-rows-[220px]">
          {GALLERY.map((g, i) => (
            <li key={g.src} className={cn("overflow-hidden rounded-xl", g.span)}>
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-label={`Ampliar foto: ${g.alt}`}
                className="group relative block size-full cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                <img
                  src={g.src}
                  alt={g.alt}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span className="absolute inset-0 bg-primary/0 transition-colors group-hover:bg-primary/20" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogTitle className="sr-only">Foto ampliada</DialogTitle>
          <DialogDescription className="sr-only">{item?.alt}</DialogDescription>
          {item && <img src={item.src} alt={item.alt} className="max-h-[80vh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </section>
  )
}
