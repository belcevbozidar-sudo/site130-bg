import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  submissions: defineTable({
    phone: v.string(),
    business_desc: v.string(),
    submittedAt: v.number(),   // Unix ms timestamp
    ip: v.optional(v.string()),
  }).index("by_time", ["submittedAt"]),
});
