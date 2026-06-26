import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ChannelFieldValues = {
  name: string;
  tagline?: string | null;
  description?: string | null;
  rules?: string | null;
  genre?: string | null;
  visibility: "PUBLIC" | "UNLISTED";
  resultsVisibility: "LIVE" | "AFTER_CLOSE" | "HIDDEN";
  allowGuestUploads: boolean;
};

type ChannelFormFieldsProps = {
  values?: ChannelFieldValues;
};

const labelClass = "mb-2 block text-sm font-bold text-foreground";

export function ChannelFormFields({ values }: ChannelFormFieldsProps) {
  return (
    <div className="grid gap-5">
      <div>
        <label htmlFor="name" className={labelClass}>
          Channel name
        </label>
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={60}
          defaultValue={values?.name}
          placeholder="Midnight Frequency"
        />
      </div>

      <div>
        <label htmlFor="tagline" className={labelClass}>
          Tagline <span className="text-muted-foreground">— optional</span>
        </label>
        <Input
          id="tagline"
          name="tagline"
          maxLength={80}
          defaultValue={values?.tagline ?? ""}
          placeholder="Let the chat decide"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="genre" className={labelClass}>
            Genre <span className="text-muted-foreground">— optional</span>
          </label>
          <Input
            id="genre"
            name="genre"
            maxLength={30}
            defaultValue={values?.genre ?? ""}
            placeholder="Trap"
          />
        </div>
        <div>
          <label htmlFor="visibility" className={labelClass}>
            Visibility
          </label>
          <select
            id="visibility"
            name="visibility"
            defaultValue={values?.visibility ?? "UNLISTED"}
            className="h-12 w-full rounded-md border border-border bg-background px-4 text-sm text-foreground shadow-panel focus:border-primary-glow focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="UNLISTED">Unlisted — code only</option>
            <option value="PUBLIC">Public — list later</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>
          Description <span className="text-muted-foreground">— optional</span>
        </label>
        <Textarea
          id="description"
          name="description"
          maxLength={2000}
          defaultValue={values?.description ?? ""}
          placeholder="Set the tone for artists entering the room."
        />
      </div>

      <div>
        <label htmlFor="rules" className={labelClass}>
          Rules <span className="text-muted-foreground">— optional</span>
        </label>
        <Textarea
          id="rules"
          name="rules"
          maxLength={4000}
          defaultValue={values?.rules ?? ""}
          placeholder="Track length, content rules, deadlines, and house rules."
        />
      </div>

      <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-4 py-3">
        <input
          type="checkbox"
          name="showResultsLive"
          defaultChecked={(values?.resultsVisibility ?? "LIVE") === "LIVE"}
          className="size-5 accent-primary"
        />
        <span>
          <span className="block text-sm font-bold text-foreground">
            Show results live
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            When on, room members see live W/L percentages while voting.
          </span>
        </span>
      </label>

      <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-4 py-3">
        <input
          type="checkbox"
          name="allowGuestUploads"
          defaultChecked={values?.allowGuestUploads ?? false}
          className="size-5 accent-primary"
        />
        <span>
          <span className="block text-sm font-bold text-foreground">
            Allow guest members
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            Guests can join with a display name and can upload tracks if this is enabled.
          </span>
        </span>
      </label>
    </div>
  );
}
