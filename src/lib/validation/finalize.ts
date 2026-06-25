import { z } from "zod";

// Body for POST /api/channels/[channel]/finalize. The champion pick is only
// required to break a top tie; the route validates it against the actual tied
// set before crowning, so an absent/extra value is harmless on a clear leader.
export const finalizeChannelSchema = z.object({
  championSubmissionId: z.string().uuid().optional(),
});
