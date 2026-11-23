"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LogOut, UserRound, Users } from "lucide-react";
import type { Me } from "@vawe/shared";
import { SignOutButton } from "../auth-forms";
import { LogoMark, Wordmark } from "../brand";
import { Avatar, cx } from "../ui";

const LINKS = [
  { href: "/ops", label: "People", icon: Users },
  { href: "/ops/activity", label: "Activity", icon: History },
  { href: "/ops/profile", label: "My profile", icon: UserRound },
];

export function OpsNav({ me }: { me: Me }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-onyx text-[#f5f1ec]">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/ops" className="flex shrink-0 items-center gap-2.5">
          <LogoMark size={28} />
          <span className="hidden sm:block">
            <Wordmark height={12} tone="light" />
          </span>
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium tracking-wider uppercase">Ops</span>
        </Link>
        <nav className="ml-2 flex min-w-0 flex-1 gap-1 overflow-x-auto sm:ml-6">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === "/ops" ? pathname === "/ops" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                  active ? "bg-white/12 text-white" : "text-white/60 hover:bg-white/8 hover:text-white",
                )}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <Avatar name={me.name} src={me.photoUrl} size={30} />
          <SignOutButton scope="ops" className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white">
            <LogOut size={17} aria-label="Sign out" />
          </SignOutButton>
        </div>
      </div>
    </header>
  );
}
