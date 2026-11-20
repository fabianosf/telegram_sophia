import { FlaskConicalIcon, HandshakeIcon, MicroscopeIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { SectionHeading } from "@/components/SectionHeading"

const PILLARS = [
  {
    icon: MicroscopeIcon,
    title: "Pesquisa",
    text: "Imunologia, leishmanioses, micoses, hanseníase, bactérias multirresistentes e outros temas em doenças infecciosas e inflamatórias.",
  },
  {
    icon: FlaskConicalIcon,
    title: "Inovação",
    text: "Biotecnologia, produtos naturais, vacinas, nanocorpos e patentes: da bancada ao desenvolvimento de novas soluções.",
  },
  {
    icon: HandshakeIcon,
    title: "Colaboração",
    text: "Palestrantes nacionais e internacionais, instituições parceiras e estudantes reunidos para trocar conhecimento.",
  },
]

const STATS = [
  { value: "3", label: "edições" },
  { value: "3", label: "dias de programação no II SDII" },
  { value: "20", label: "palestrantes e ministrantes no II SDII" },
]

export function About() {
  return (
    <section id="sobre" className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          kicker="Sobre o SDII"
          title="Um encontro para discutir ciência e saúde pública"
          subtitle="O Simpósio de Doenças Infecciosas e Inflamatórias reúne pesquisadores, professores e estudantes de todo o Brasil em torno de pesquisa, inovação e saúde pública."
        />

        <div className="grid gap-6 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="border-0 bg-background py-8 text-center shadow-none">
              <CardContent className="flex flex-col items-center gap-4">
                <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-accent">
                  <Icon className="size-7" aria-hidden="true" />
                </span>
                <h3 className="text-xl font-bold text-primary">{title}</h3>
                <p className="text-muted-foreground">{text}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <dl className="mt-14 grid gap-8 rounded-2xl bg-primary px-6 py-10 text-center text-primary-foreground sm:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.label}>
              <dt className="sr-only">{s.label}</dt>
              <dd className="font-serif text-5xl font-bold text-accent">{s.value}</dd>
              <p className="mt-2 text-sm uppercase tracking-wider text-primary-foreground/80" aria-hidden="true">{s.label}</p>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
