import { SectionHeading } from "@/components/SectionHeading"

export function Sponsors() {
  return (
    <section aria-labelledby="apoio" className="bg-white py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHeading kicker="Apoio" title="Instituições parceiras" className="mb-8" />
        <h3 id="apoio" className="sr-only">Instituições parceiras</h3>
        <img
          src="/images/apoio.webp"
          alt="Logotipos: The Global Health Network Latin America and the Caribbean, CNPq, CAPES, Universidade Regional do Cariri (URCA), FUNCAP e Fiocruz"
          width={1546}
          height={192}
          loading="lazy"
          className="mx-auto w-full max-w-4xl"
        />
      </div>
    </section>
  )
}
