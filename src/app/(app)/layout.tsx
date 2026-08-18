import { AppShell } from "@/components/app-shell";
import { logoutAction } from "@/lib/auth/actions";
import { requireSession } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <AppShell
      user={{ name: session.name, email: session.email }}
      logout={
        <form action={logoutAction}>
          <button type="submit" className="btn btn-secondary w-full">
            Cerrar sesión
          </button>
        </form>
      }
    >
      {children}
    </AppShell>
  );
}
