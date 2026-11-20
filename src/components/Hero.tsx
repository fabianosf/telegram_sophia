import { useEffect, useMemo, useState } from "react"
import Autoplay from "embla-carousel-autoplay"
import { ArrowRightIcon, CalendarIcon, MapPinIcon } from "lucide-react"

import { SITE } from "@/data/site"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel"

type Slide =
  | {
      kind: "flyer"
      badge: string
      title: string
      place: string
      date: string
      image: string
      alt: string
      primary: { label: string; href: string; external?: boolean }
      secondary: { label: string; href: string }
    }
  | {
      kind: "photo"
      badge: string
      title: string
      text: string
      image: string
      alt: string
      primary: { label: string; href: string }
    }

const SLIDES: Slide[] = [
  {
    kind: "flyer",
    badge: "Próxima edição",
    title: "III Simpósio de Doenças Infecciosas e Inflamatórias",
    place: "Porto Velho · Rondônia",
    date: "14 a 16 de setembro de 2027",
    image: "/images/logo-iii.webp",
    alt: "Identidade visual do III SDII, com células, folha e uma locomotiva a vapor",
    primary: { label: "Acompanhe no Instagram", href: SITE.instagram, external: true },
    secondary: { label: "Conheça as edições", href: "#edicoes" },
  },
  {
    kind: "flyer",
    badge: "Edição realizada",
    title: "II Simpósio de Doenças Infecciosas e Inflamatórias",
    place: "Fortaleza · Ceará — Fiocruz Ceará",
    date: "17, 18 e 19 de novembro de 2026",
    image: "/images/banner-ii.webp",
    alt: "Banner do II SDII, com ilustração de Fortaleza, sol, barco e micro-organismos",
    primary: { label: "Ver palestrantes", href: "#palestrantes" },
    secondary: { label: "Ver galeria", href: "#galeria" },
  },
  {
    kind: "photo",
    badge: "I Simpósio · Fiocruz Piauí",
    title: "Ciência que aproxima pesquisadores e estudantes",
    text: "Uma comunidade reunida para discutir pesquisa, inovação e saúde pública.",
    image: "/images/g-mesa.webp",
    alt: "Mesa de abertura do I Simpósio",
    primary: { label: "Ver galeria", href: "#galeria" },
  },
]

export function Hero() {
  const [api, setApi] = useState<CarouselApi>()
  const [current, setCurrent] = useState(0)

  const plugins = useMemo(() => {
    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    return reduce ? [] : [Autoplay({ delay: 7000, stopOnInteraction: true })]
  }, [])

  useEffect(() => {
    if (!api) return
    const onSelect = () => setCurrent(api.selectedScrollSnap())
    onSelect()
    api.on("select", onSelect)
    return () => {
      api.off("select", onSelect)
    }
  }, [api])

  return (
    <section id="inicio" className="relative pt-16" aria-label="Destaques">
      <Carousel setApi={setApi} opts={{ loop: true }} plugins={plugins} className="group">
        <CarouselContent className="ml-0">
          {SLIDES.map((s, i) => {
            const Heading = i === 0 ? "h1" : "h2"
            return (
            <CarouselItem key={s.title} className="pl-0">
              {s.kind === "flyer" ? (
                <div className="relative overflow-hidden bg-background">
                  <div className="wave-divider pointer-events-none absolute inset-0" aria-hidden="true" />
                  <div className="relative mx-auto grid min-h-[640px] max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 md:grid-cols-2 md:py-16">
                    <div className="order-2 md:order-1">
                      <Badge variant="accent" className="mb-5 uppercase tracking-wider">{s.badge}</Badge>
                      <Heading className="text-balance text-3xl font-bold leading-tight text-primary sm:text-4xl lg:text-5xl">
                        {s.title}
                      </Heading>
                      <ul className="mt-6 space-y-2 text-base text-foreground/80 sm:text-lg">
                        <li className="flex items-center gap-2.5">
                          <MapPinIcon className="size-5 text-accent" aria-hidden="true" />
                          {s.place}
                        </li>
                        <li className="flex items-center gap-2.5">
                          <CalendarIcon className="size-5 text-accent" aria-hidden="true" />
                          {s.date}
                        </li>
                      </ul>
                      <div className="mt-8 flex flex-wrap gap-3">
                        <Button asChild variant="accent" size="lg">
                          <a
                            href={s.primary.href}
                            {...(s.primary.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                          >
                            {s.primary.label}
                            <ArrowRightIcon />
                          </a>
                        </Button>
                        <Button asChild variant="outline" size="lg">
                          <a href={s.secondary.href}>{s.secondary.label}</a>
                        </Button>
                      </div>
                    </div>
                    <div className="order-1 flex justify-center md:order-2">
                      <img
                        src={s.image}
                        alt={s.alt}
                        width={1254}
                        height={i === 0 ? 1254 : 720}
                        className={cn(
                          "w-full rounded-2xl shadow-xl",
                          i === 0 ? "max-w-md bg-white p-2" : "max-w-xl"
                        )}
                        {...(i === 0 ? { fetchPriority: "high" as const } : { loading: "lazy" as const })}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative flex min-h-[640px] items-center overflow-hidden">
                  <img
                    src={s.image}
                    alt={s.alt}
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/95 via-primary/75 to-primary/20" aria-hidden="true" />
                  <div className="relative mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
                    <div className="max-w-xl text-white">
                      <Badge variant="accent" className="mb-5 uppercase tracking-wider">{s.badge}</Badge>
                      <h2 className="text-balance text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">{s.title}</h2>
                      <p className="mt-5 text-lg text-white/85">{s.text}</p>
                      <Button asChild variant="accent" size="lg" className="mt-8">
                        <a href={s.primary.href}>
                          {s.primary.label}
                          <ArrowRightIcon />
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CarouselItem>
            )
          })}
        </CarouselContent>

        <CarouselPrevious className="hidden bg-white/90 md:inline-flex" />
        <CarouselNext className="hidden bg-white/90 md:inline-flex" />

        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2" role="tablist" aria-label="Escolher slide">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              role="tab"
              aria-selected={current === i}
              aria-label={`Ir para o slide ${i + 1}`}
              onClick={() => api?.scrollTo(i)}
              className={cn(
                "h-2.5 cursor-pointer rounded-full transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60",
                current === i ? "w-8 bg-accent" : "w-2.5 bg-primary/40 hover:bg-primary/70"
              )}
            />
          ))}
        </div>
      </Carousel>
    </section>
  )
}
