import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Car,
  LayoutDashboard,
  LogOut,
  Plus,
  Receipt,
  Settings,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ExpenseFormDialog } from "@/components/ExpenseFormDialog";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/vehicles", label: "Garage", icon: Car },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/auth");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col border-r bg-sidebar">
        <div className="flex items-center gap-2 px-5 py-5 border-b">
          <Car className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold tracking-tight">
            Car Tracker
          </span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => {
            const active = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t px-4 py-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground truncate">
            {user?.username}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <Car className="h-5 w-5 text-primary" />
          <span className="font-semibold">Car Tracker</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          title="Log out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      {/* Main content */}
      <main className="md:pl-60 pb-24 md:pb-8">
        <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
          <div className="hidden md:flex justify-end mb-4">
            <Button onClick={() => setAddExpenseOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Expense
            </Button>
          </div>
          {children}
        </div>
      </main>

      {/* Mobile FAB */}
      <Button
        className="md:hidden fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full shadow-lg"
        size="icon"
        onClick={() => setAddExpenseOpen(true)}
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex border-t bg-background">
        {nav.map((item) => {
          const active = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs",
                active ? "text-primary font-medium" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <ExpenseFormDialog
        open={addExpenseOpen}
        onOpenChange={setAddExpenseOpen}
      />
    </div>
  );
}
