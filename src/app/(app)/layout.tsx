import { WorkspaceProvider } from "@/contexts/workspace";
import { Sidebar } from "@/components/layout/sidebar";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <ConfirmProvider>
        <div className="flex h-screen bg-muted">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-background rounded-2xl shadow-sm mt-16 mb-2 mx-2 pb-24 lg:pb-0 lg:mt-2 lg:mr-2 lg:ml-64">
            {children}
          </main>
        </div>
      </ConfirmProvider>
    </WorkspaceProvider>
  );
}
