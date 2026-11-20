import { ArrowRightIcon, CalendarIcon, MapPinIcon } from "lucide-react"

import { EDITIONS } from "@/data/site"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { SectionHeading } from "@/components/SectionHeading"

export function Editions() {
  return (
    <section id="edicoes" className="py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          kicker="Edições"
          title="A jornada do SDII"
          subtitle="Do Piauí ao Ceará, e agora rumo a Porto Velho: conheça cada edição do simpósio."
        />

        <div className="grid gap-8 md:grid-cols-3">
          {EDITIONS.map((e) => (
            <Card key={e.id} className="group overflow-hidden pt-0 transition-shadow hover:shadow-xl">
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <img
                  src={e.image}
                  alt={`${e.title} — ${e.place}`}
                  loading="lazy"
                  decoding="async"
                  className={cn("size-full transition-transform duration-500 group-hover:scale-105", e.imageClass)}
                />
                <Badge variant={e.status === "Em breve" ? "accent" : "default"} className="absolute top-4 left-4 uppercase tracking-wider">
                  {e.status}
                </Badge>
              </div>
              <CardContent className="flex flex-1 flex-col gap-3">
                <h3 className="text-2xl font-bold text-primary">{e.title}</h3>
                <p className="flex items-start gap-2 text-foreground/80">
                  <MapPinIcon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                  {e.place}
                </p>
                <p className="flex items-start gap-2 text-foreground/80">
                  <CalendarIcon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                  {e.date}
                </p>
              </CardContent>
              <CardFooter>
                <Button asChild variant={e.status === "Em breve" ? "accent" : "outline"} className="w-full">
                  <a
                    href={e.cta.href}
                    {...("external" in e.cta && e.cta.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    {e.cta.label}
                    <ArrowRightIcon />
                  </a>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
