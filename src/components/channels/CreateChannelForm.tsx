"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChannelFormFields } from "@/components/channels/ChannelFormFields";
import { Button } from "@/components/ui/button";

export function CreateChannelForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError("");
    setPending(true);

    const response = await fetch("/api/channels", {
      method: "POST",
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

    const payload = (await response.json()) as {
      error?: string;
      channel?: { id: string };
    };

    if (!response.ok || !payload.channel) {
      setError(payload.error ?? "Unable to create the channel.");
      setPending(false);
      return;
    }

    router.push(`/dashboard/channels/${payload.channel.id}`);
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <ChannelFormFields />
      {error && (
        <p
          role="alert"
          className="rounded-md border border-magenta/40 bg-magenta/10 px-4 py-3 text-sm text-foreground"
        >
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="gradient"
        size="lg"
        className="w-full sm:w-auto"
        disabled={pending}
      >
        {pending ? (
          <LoaderCircle className="motion-safe:animate-spin" />
        ) : (
          <ArrowRight />
        )}
        Create channel
      </Button>
    </form>
  );
}

