import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

// Chaque étape est une invocation courte : compatible avec les limites serverless de Vercel.
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({ client: inngest, functions });
