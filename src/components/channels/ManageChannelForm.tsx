"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  ChannelFormFields,
  type ChannelFieldValues,
} from "@/components/channels/ChannelFormFields";
import { Button } from "@/components/ui/button";

type ManageChannelFormProps = {
  channelId: string;
  values: ChannelFieldValues;
};

export function ManageChannelForm({
  channelId,
  values,
}: ManageChannelFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setMessage("");
    setError("");
    setPending(true);

    const response = await fetch(`/api/channels/${channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        tagline: formData.get("tagline"),
        genre: formData.get("genre"),
        visibility: formData.get("visibility"),
        description: formData.get("description"),
        rules: formData.get("rules"),
        allowGuestUploads: formData.get("allowGuestUploads") === "on",
      }),
    });

    const payload = (await response.json()) as { error?: string };
    setPending(false);

    if (!response.ok) {
      setError(payload.error ?? "Unable to save channel settings.");
      return;
    }

    setMessage("Channel settings saved.");
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <ChannelFormFields values={values} />
      {error && (
        <p
          role="alert"
          className="rounded-md border border-magenta/40 bg-magenta/10 px-4 py-3 text-sm text-foreground"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-lime"
        >
          <Check className="size-4" />
          {message}
        </p>
      )}
      <div>
        <Button type="submit" variant="outline" size="lg" disabled={pending}>
          {pending && <LoaderCircle className="motion-safe:animate-spin" />}
          Save settings
        </Button>
      </div>
    </form>
  );
}

