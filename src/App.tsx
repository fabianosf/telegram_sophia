import { About } from "@/components/About"
import { Contact } from "@/components/Contact"
import { Editions } from "@/components/Editions"
import { Footer } from "@/components/Footer"
import { Gallery } from "@/components/Gallery"
import { Header } from "@/components/Header"
import { Hero } from "@/components/Hero"
import { Speakers } from "@/components/Speakers"
import { Sponsors } from "@/components/Sponsors"

export default function App() {
  return (
    <>
      <a
        href="#sobre"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-white"
      >
        Ir para o conteúdo
      </a>
      <Header />
      <main>
        <Hero />
        <About />
        <Editions />
        <Speakers />
        <Gallery />
        <Sponsors />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
