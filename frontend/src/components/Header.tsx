import { motion } from "framer-motion";
import { Icon, Wordmark } from "./ui";
import { cn } from "../lib/format";
import type { View } from "../types";

const NAV: Array<{ id: View; label: string }> = [
  { id: "desk", label: "Desk" },
  { id: "accuracy", label: "Accuracy" },
  { id: "snapshots", label: "Snapshots" },
  { id: "method", label: "Method" },
];

export function Header({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (view: View) => void;
}) {
  return (
    <>
      <div className="relative z-40 border-b border-ink-100/70 bg-ink text-paper">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-2 sm:px-8 lg:px-10">
          <div className="flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[0.18em] text-paper/70">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-300 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal-300" />
            </span>
            Historical replay · January 2026
          </div>
          <div className="hidden items-center gap-5 font-mono text-[9px] uppercase tracking-[0.16em] text-paper/45 sm:flex">
            <span>Elexon FUELHH · WINDFOR</span>
            <span className="h-3 w-px bg-paper/20" />
            <span>All times UTC</span>
          </div>
        </div>
      </div>

      <header className="border-b border-white/70 bg-paper/85 backdrop-blur-xl sm:sticky sm:top-0 sm:z-40">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3 sm:px-8 lg:px-10">
          <Wordmark />
          <nav aria-label="Views" className="order-3 -mx-1 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto">
            {NAV.map((item) => {
              const active = item.id === view;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
                    active ? "text-ink" : "text-ink-500 hover:bg-white/70 hover:text-ink",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-full border border-ink-200/70 bg-white shadow-[0_6px_18px_-12px_rgba(14,42,43,0.6)]"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  ) : null}
                  <span className="relative">{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <a
              href="/api/docs"
              target="_blank"
              rel="noreferrer"
              className="btn-quiet hidden gap-1.5 sm:inline-flex"
              title="Open the FastAPI documentation"
            >
              <Icon name="api" size={14} />
              API
            </a>
            <a
              href="https://github.com/sohan-a11y/windwise"
              target="_blank"
              rel="noreferrer"
              className="btn-quiet gap-1.5"
              title="Windwise on GitHub"
            >
              <Icon name="github" size={15} />
              <span className="hidden md:inline">Source</span>
            </a>
          </div>
        </div>
      </header>
    </>
  );
}
