import { MailIcon } from "lucide-react"

import { SITE } from "@/data/site"
import { Button } from "@/components/ui/button"
import { InstagramIcon } from "@/components/Instagram"

export function Contact() {
  return (
    <section id="contato" className="relative overflow-hidden bg-primary py-20 text-primary-foreground sm:py-24">
      <div className="wave-divider pointer-events-none absolute inset-0 opacity-10 invert" aria-hidden="true" />
      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-accent">Contato</p>
        <h2 className="text-balance text-3xl font-bold sm:text-4xl">Fale com a organização do SDII</h2>
        <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-accent" aria-hidden="true" />
        <p className="mt-6 text-lg text-primary-foreground/85">
          Dúvidas, parcerias ou interesse em participar das próximas edições? Acompanhe as novidades e fale com a gente.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild variant="accent" size="lg">
            <a href={SITE.instagram} target="_blank" rel="noopener noreferrer">
              <InstagramIcon />
              {SITE.instagramHandle}
            </a>
          </Button>
          {SITE.email && (
            <Button asChild variant="outline-light" size="lg">
              <a href={`mailto:${SITE.email}`}>
                <MailIcon />
                {SITE.email}
              </a>
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
