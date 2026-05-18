import { SidebarContent } from "@/components/dashboard/sidebar-content"

export function NotFoundPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_20%_85%,rgba(173,63,255,.20),transparent_24%),radial-gradient(circle_at_65%_78%,rgba(27,124,255,.18),transparent_24%),radial-gradient(circle_at_45%_55%,rgba(24,68,180,.18),transparent_30%),linear-gradient(180deg,#05081a_0%,#071029_35%,#05081a_100%)] text-white">
      <div className="pointer-events-none absolute bottom-20 left-[-5%] h-1 w-[72%] rotate-[-11deg] rounded-full bg-[linear-gradient(90deg,transparent,#ff66d6_30%,#ff84eb_50%,transparent)] opacity-70 shadow-[0_0_18px_#ff4ed0,0_0_36px_rgba(255,78,208,.5)]" />
      <div className="pointer-events-none absolute bottom-24 left-[42%] h-1 w-[68%] rotate-[10deg] rounded-full bg-[linear-gradient(90deg,transparent,#2f7bff_30%,#35b4ff_50%,transparent)] opacity-70 shadow-[0_0_18px_#2f7bff,0_0_36px_rgba(47,123,255,.5)]" />

      <div className="relative grid min-h-screen grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/10 bg-[linear-gradient(180deg,rgba(21,32,87,.95),rgba(7,12,39,.96))] md:block">
          <SidebarContent showBrand />
        </aside>

        <main className="flex min-w-0 items-center justify-center p-6">
          <section
            aria-label="Create workspace prompt"
            className="w-full max-w-xl rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,28,79,.92),rgba(12,20,58,.94))] p-8 text-center shadow-[0_24px_70px_rgba(0,0,0,.45)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200/70">
              DocuChat
            </p>
            <h1 className="mt-3 text-2xl font-extrabold text-white md:text-3xl">
              Create a workspace to start
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Use the New Workspace button in the sidebar to create your first workspace, upload documents, and start chatting with them.
            </p>
          </section>
        </main>
      </div>
    </div>
  )
}
