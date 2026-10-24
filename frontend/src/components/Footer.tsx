import { Icon, Logo } from "./ui";
import type { View } from "../types";

const PRODUCT: Array<{ id: View; label: string }> = [
  { id: "desk", label: "Decision desk" },
  { id: "accuracy", label: "Forecast accuracy" },
  { id: "snapshots", label: "Snapshot revisions" },
  { id: "method", label: "Method & data" },
];

export function Footer({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <footer className="relative mt-20 border-t border-ink-200/60 bg-[#ECF2ED]/70">
      <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <Logo size={36} />
              <div>
                <div className="text-[17px] font-semibold leading-none tracking-[-0.02em]">Windwise</div>
                <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">
                  Day-ahead wind intelligence
                </div>
              </div>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-600">
              A procurement desk that treats the wind forecast as evidence, not truth. Built on
              one month of public Elexon data, replayed exactly as a buyer would have seen it.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="chip chip-teal">1,488 actual half-hours</span>
              <span className="chip">256 snapshots</span>
              <span className="chip">No look-ahead</span>
            </div>
          </div>

          <FooterColumn title="Product">
            {PRODUCT.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className="block text-left text-sm text-ink-600 transition-colors hover:text-teal-700"
              >
                {item.label}
              </button>
            ))}
          </FooterColumn>

          <FooterColumn title="Data">
            <ExternalLink href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream">
              FUELHH actuals
            </ExternalLink>
            <ExternalLink href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream">
              WINDFOR forecasts
            </ExternalLink>
            <ExternalLink href="https://www.elexon.co.uk/data/insights-solution/">
              Elexon Insights
            </ExternalLink>
            <span className="text-sm text-ink-500">January 2026 · GMT</span>
          </FooterColumn>

          <FooterColumn title="Build">
            <ExternalLink href="https://github.com/sohan-a11y/windwise">GitHub repository</ExternalLink>
            <ExternalLink href="/api/docs">API documentation</ExternalLink>
            <ExternalLink href="https://github.com/sohan-a11y/windwise/blob/main/docs/METHOD.md">
              Method note
            </ExternalLink>
            <ExternalLink href="https://github.com/sohan-a11y/windwise#ai-tool-disclosure">
              AI tool disclosure
            </ExternalLink>
          </FooterColumn>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-ink-200/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-[11px] leading-relaxed text-ink-500">
            Windwise is a decision-support prototype. It does not place orders, forecast prices, or
            model client demand. Empirical bands are not guarantees. Not affiliated with Elexon.
          </p>
          <div className="flex items-center gap-4 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-400">
            <span className="flex items-center gap-1.5">
              <Icon name="lock" size={12} /> checksum verified
            </span>
            <span>© 2026</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-4">{title}</div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target={href.startsWith("/") ? undefined : "_blank"}
      rel={href.startsWith("/") ? undefined : "noreferrer"}
      className="group inline-flex items-center gap-1.5 text-sm text-ink-600 transition-colors hover:text-teal-700"
    >
      {children}
      <Icon
        name="external"
        size={11}
        className="text-ink-300 transition-colors group-hover:text-teal-500"
      />
    </a>
  );
}
