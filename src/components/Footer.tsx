import { SITE } from "@/data/site"
import { InstagramIcon } from "@/components/Instagram"

export function Footer() {
  return (
    <footer className="bg-[#0d1b36] py-8 text-sm text-white/75">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
        <p>© {new Date().getFullYear()} {SITE.name} — {SITE.fullName}</p>
        <a
          href={SITE.instagram}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram do SDII"
          className="rounded-full border border-white/30 p-2 transition-colors hover:bg-accent hover:text-white"
        >
          <InstagramIcon className="size-5" />
        </a>
      </div>
    </footer>
  )
}
