"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { BLOOD_GROUPS, type Me } from "@vawe/shared";
import { api, ApiFailure } from "@/lib/client-api";
import { Alert, Avatar, Button, Card, Field, Input, Select } from "./ui";

type Scope = "app" | "ops";
const base = (scope: Scope) => (scope === "ops" ? "/ops/auth" : "/auth");

const PHOTO_SIZE = 320;
const MAX_BYTES = 140 * 1024;

/** Crops the picture to a centred square, scales it to 320 px and encodes a JPEG under the size cap. */
async function toSquareJpeg(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; // transparent PNGs get a white background, not black
  ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  bitmap.close();
  for (const quality of [0.86, 0.76, 0.64, 0.5]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if ((url.length - 23) * 0.75 <= MAX_BYTES) return url;
  }
  throw new Error("That picture is too detailed to shrink. Try another one.");
}

function PhotoCard({ me, scope }: { me: Me; scope: Scope }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Choose an image file");
    setBusy(true);
    try {
      const dataUrl = await toSquareJpeg(file);
      setPreview(dataUrl);
      await api("PUT", `${base(scope)}/profile/photo`, { dataUrl });
      router.refresh();
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Couldn't upload the picture");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api("DELETE", `${base(scope)}/profile/photo`);
      setPreview(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't remove the picture");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-semibold">Profile picture</h2>
      <p className="mt-1 text-sm text-ink-2">A clear photo of your face. It's cropped to a square.</p>
      <div className="mt-5 flex flex-wrap items-center gap-5">
        <Avatar name={me.name} src={preview ?? me.photoUrl} size={88} />
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <Button type="button" variant="secondary" onClick={() => input.current?.click()} loading={busy}>
            <Camera size={16} /> {me.photoUrl ? "Change photo" : "Upload photo"}
          </Button>
          {me.photoUrl && !busy && (
            <Button type="button" variant="ghost" onClick={remove}>
              <Trash2 size={16} /> Remove
            </Button>
          )}
        </div>
      </div>
      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}

export function ProfileForm({ me, scope }: { me: Me; scope: Scope }) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: me.name,
    department: me.department ?? "",
    bloodGroup: me.bloodGroup ?? "",
    phone: me.phone ?? "",
    emergencyName: me.emergencyName ?? "",
    emergencyRelation: me.emergencyRelation ?? "",
    emergencyPhone: me.emergencyPhone ?? "",
  });
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: e.target.value }));
  };
  const fieldError = (name: string) => (error?.field === name ? error.message : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("PATCH", `${base(scope)}/profile`, values);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiFailure ? { message: err.message, field: err.body.field } : { message: "Couldn't save your profile" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PhotoCard me={me} scope={scope} />

      <Card className="p-5 sm:p-6">
        <form onSubmit={submit} className="space-y-6" noValidate>
          <div>
            <h2 className="font-semibold">Your details</h2>
            <p className="mt-1 text-sm text-ink-2">Visible to admins. Keep them up to date.</p>
          </div>
          {error && !error.field && <Alert>{error.message}</Alert>}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name" error={fieldError("name")}>
              <Input id="name" value={values.name} onChange={set("name")} autoComplete="name" required />
            </Field>
            <Field label="Email" htmlFor="email" hint="Used to sign in. Ask an admin to change it.">
              <Input id="email" value={me.email} disabled />
            </Field>
            <Field label="Phone number" htmlFor="phone" error={fieldError("phone")}>
              <Input id="phone" type="tel" inputMode="tel" value={values.phone} onChange={set("phone")} autoComplete="tel" placeholder="98450 12345" />
            </Field>
            <Field label="Department" htmlFor="department" optional error={fieldError("department")}>
              <Input id="department" value={values.department} onChange={set("department")} placeholder="e.g. Production, Sales, Accounts" />
            </Field>
            <Field label="Blood group" htmlFor="bloodGroup" error={fieldError("bloodGroup")}>
              <Select id="bloodGroup" value={values.bloodGroup} onChange={set("bloodGroup")}>
                <option value="">Select</option>
                {BLOOD_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="border-t border-line pt-6">
            <h3 className="text-[15px] font-semibold">Emergency contact</h3>
            <p className="mt-1 text-sm text-ink-2">Who we should call if something happens at work.</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              <Field label="Name" htmlFor="emergencyName" error={fieldError("emergencyName")}>
                <Input id="emergencyName" value={values.emergencyName} onChange={set("emergencyName")} />
              </Field>
              <Field label="Relationship" htmlFor="emergencyRelation" error={fieldError("emergencyRelation")}>
                <Input id="emergencyRelation" value={values.emergencyRelation} onChange={set("emergencyRelation")} placeholder="e.g. Spouse, Father" />
              </Field>
              <Field label="Phone number" htmlFor="emergencyPhone" error={fieldError("emergencyPhone")}>
                <Input id="emergencyPhone" type="tel" inputMode="tel" value={values.emergencyPhone} onChange={set("emergencyPhone")} />
              </Field>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" loading={busy}>
              Save profile
            </Button>
            {saved && <span className="animate-fade text-sm text-good">Saved</span>}
          </div>
        </form>
      </Card>
    </div>
  );
}
