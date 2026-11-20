import { ClockIcon } from "lucide-react"

import { COORDINATION, SPEAKERS, TABLES, type Person } from "@/data/site"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SectionHeading } from "@/components/SectionHeading"

function initials(name: string) {
  const parts = name.split(" ").filter((p) => p.length > 2 || /^[A-Z]/.test(p))
  return (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
}

function PersonCard({ p }: { p: Person }) {
  return (
    <Card className="h-full gap-0 py-5">
      <CardContent className="flex items-start gap-4">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-accent/60 bg-secondary font-serif text-lg font-bold text-primary"
          aria-hidden="true"
        >
          {initials(p.name)}
        </span>
        <div className="min-w-0">
          {p.role && <p className="mb-1 text-xs font-bold uppercase tracking-wider text-accent">{p.role}</p>}
          <h3 className="text-base font-bold leading-snug text-primary">{p.name}</h3>
          <p className="text-sm font-medium text-teal">{p.org}</p>
          {p.topic && <p className="mt-2 text-sm text-muted-foreground">{p.topic}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function Grid({ people }: { people: Person[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {people.map((p) => (
        <li key={p.name}>
          <PersonCard p={p} />
        </li>
      ))}
    </ul>
  )
}

export function Speakers() {
  return (
    <section id="palestrantes" className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          kicker="II SDII · Fortaleza 2026"
          title="Conheça os participantes"
          subtitle="Coordenação, mesas e palestrantes da segunda edição, realizada na Fiocruz Ceará."
        />

        <Card className="mb-12 overflow-hidden border-0 bg-secondary py-0 md:flex-row">
          <img
            src="/images/card-alda.webp"
            alt="Card de divulgação da palestrante Alda Maria da Cruz"
            width={1024}
            height={1280}
            loading="lazy"
            className="w-full object-cover md:w-72 lg:w-80"
          />
          <CardContent className="flex flex-col justify-center gap-3 py-8">
            <Badge variant="accent" className="w-fit uppercase tracking-wider">Palestrante em destaque</Badge>
            <h3 className="text-2xl font-bold text-primary sm:text-3xl">Alda Maria da Cruz</h3>
            <p className="text-foreground/80">
              Vice-Presidente de Pesquisa e Coleções Biológicas da Fiocruz e pesquisadora em Saúde Pública do IOC/Fiocruz.
            </p>
            <div className="mt-2 rounded-lg border-l-4 border-accent bg-white/70 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-accent">Tema da palestra</p>
              <p className="mt-1 font-serif text-lg font-semibold text-primary">
                Danos imunopatogênicos associados à infecção “silente” por <em>Giardia lamblia</em>.
              </p>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="palestrantes" className="items-center">
          <TabsList aria-label="Grupos de participantes">
            <TabsTrigger value="coordenacao">Coordenação</TabsTrigger>
            <TabsTrigger value="mesas">Mesas</TabsTrigger>
            <TabsTrigger value="palestrantes">Palestrantes e ministrantes</TabsTrigger>
          </TabsList>
          <TabsContent value="coordenacao" className="w-full">
            <Grid people={COORDINATION} />
          </TabsContent>
          <TabsContent value="mesas" className="w-full">
            <Grid people={TABLES} />
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <ClockIcon className="size-4" aria-hidden="true" />
              A mesa de encerramento contou com a participação de Wilson Savino.
            </p>
          </TabsContent>
          <TabsContent value="palestrantes" className="w-full">
            <Grid people={SPEAKERS} />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}
