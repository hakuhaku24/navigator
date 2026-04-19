import AppSidebar from "@/components/layout/AppSidebar"
import BottomNav from "@/components/layout/BottomNav"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden pb-16 md:pb-0">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
