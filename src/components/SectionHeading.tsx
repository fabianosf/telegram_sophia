import { cn } from "@/lib/utils"

export function SectionHeading({
  kicker,
  title,
  subtitle,
  align = "center",
  className,
}: {
  kicker?: string
  title: string
  subtitle?: string
  align?: "center" | "left"
  className?: string
}) {
  return (
    <div className={cn("mb-12 max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {kicker && (
        <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-accent">{kicker}</p>
      )}
      <h2 className="text-balance text-3xl font-bold text-primary sm:text-4xl">{title}</h2>
      <div className={cn("mt-4 h-1 w-16 rounded-full bg-accent", align === "center" && "mx-auto")} aria-hidden="true" />
      {subtitle && <p className="mt-5 text-lg text-muted-foreground">{subtitle}</p>}
    </div>
  )
}
