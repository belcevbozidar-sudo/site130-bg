import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Save a new submission
export const save = mutation({
  args: {
    phone: v.string(),
    business_desc: v.string(),
    submittedAt: v.number(),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("submissions", args);
  },
});

// List latest submissions (newest first)
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("submissions")
      .withIndex("by_time")
      .order("desc")
      .take(50);
  },
});
