import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { batchProcess } from "@/lib/inngest/functions/batch-process";
import { processEpisode } from "@/lib/inngest/functions/process-episode";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [batchProcess, processEpisode],
});
