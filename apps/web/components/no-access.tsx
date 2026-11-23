import { Lock } from "lucide-react";
import { MODULE_LABELS, type Module } from "@vawe/shared";
import { Card } from "./ui";

export function NoAccess({ module }: { module: Module }) {
  return (
    <Card className="mx-auto mt-10 max-w-md p-8 text-center">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2 text-ink-3">
        <Lock size={22} />
      </span>
      <h1 className="text-lg font-semibold">You don't have access to {MODULE_LABELS[module]}</h1>
      <p className="mt-2 text-sm text-ink-2">Ask an admin to give you access in the ops console.</p>
    </Card>
  );
}

export function LoadError({ message }: { message: string }) {
  return (
    <Card className="p-6 text-center">
      <p className="font-medium">Couldn't load this</p>
      <p className="mt-1 text-sm text-ink-2">{message}</p>
    </Card>
  );
}
