"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { Bell, LogOut, Moon, Search, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { useHandoffQueue } from "@hooks/use-conversations";
import { Avatar, AvatarFallback } from "@components/ui/avatar";
import { Button } from "@components/ui/button";
import { WhatsAppStatus } from "./whatsapp-status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@components/ui/dropdown-menu";

interface TopbarProps {
  userName: string;
  userEmail: string;
}

export function Topbar({ userName, userEmail }: TopbarProps) {
  const { theme, setTheme } = useTheme();
  const { data: handoffs } = useHandoffQueue();
  const pending = handoffs?.length ?? 0;
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-background/60 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/40">
      <div className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="h-9 w-full rounded-md border border-input bg-background/60 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Buscar clientes, pedidos, productos… (⌘K)"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <WhatsAppStatus />
        <Button
          size="icon"
          variant="ghost"
          aria-label="Cambiar tema"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </Button>
        <Button
          asChild
          size="icon"
          variant="ghost"
          aria-label={
            pending > 0 ? `${pending} clientes esperan a una persona` : "Notificaciones"
          }
          className="relative"
        >
          <Link href={handoffs?.[0] ? `/chats?c=${handoffs[0].id}` : "/chats"}>
            <Bell className={pending > 0 ? "h-4 w-4 text-destructive" : "h-4 w-4"} />
            {pending > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground animate-pulse">
                {pending}
              </span>
            )}
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-accent">
              <Avatar>
                <AvatarFallback>{initials || "U"}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-0.5">
                <span className="text-sm font-medium">{userName}</span>
                <span className="text-xs text-muted-foreground">{userEmail}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" /> Mi cuenta
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
