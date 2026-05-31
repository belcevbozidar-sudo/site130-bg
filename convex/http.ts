import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/submit-form",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Simple shared secret check to prevent abuse
    const secret = request.headers.get("x-site130-secret");
    const expected = process.env.SITE130_SECRET;
    if (expected && secret !== expected) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    let body: { phone?: string; business_desc?: string; ip?: string };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { phone, business_desc, ip } = body;
    if (!phone || !business_desc) {
      return new Response(JSON.stringify({ error: "Missing phone or business_desc" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const id = await ctx.runMutation(api.submissions.save, {
      phone,
      business_desc,
      submittedAt: Date.now(),
      ip: ip || "unknown",
    });

    return new Response(JSON.stringify({ success: true, id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
