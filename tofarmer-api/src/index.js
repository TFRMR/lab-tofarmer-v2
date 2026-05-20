import { createClient } from "@supabase/supabase-js";

export default {
  async fetch(request, env, ctx) {

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);

    // SIMPLE ROUTE
    if (url.pathname === "/profiles") {
      const supabase = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_ANON_KEY
      );

      const { data, error } = await supabase
        .from("profiles")
        .select("*");

      if (error) {
        return new Response(JSON.stringify(error), {
          status: 500,
          headers: corsHeaders,
        });
      }

      return new Response(JSON.stringify(data), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    return new Response("ToFarmer API OK", {
      headers: corsHeaders,
    });
  },
};