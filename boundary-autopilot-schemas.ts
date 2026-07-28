import { z } from 'zod';

// Every one of these requires confirm: z.literal(true) — not just a boolean,
// specifically the literal value true. This means a client can't accidentally
// satisfy the schema by omitting the field (Zod would reject it as missing)
// or by sending confirm: false. This file exists on its own specifically so
// that guarantee can be tested directly, without needing to stand up the
// whole Express app or Firebase auth to exercise it.

export const SendMessageSchema = z.object({
  recipientId: z.string().min(1),
  recipientName: z.string().max(200).optional(),
  message: z.string().min(1).max(2000),
  confirm: z.literal(true),
}).strict();

export const SetDndSchema = z.object({
  minutes: z.number().int().min(5).max(480),
  confirm: z.literal(true),
}).strict();

export const SetStatusSchema = z.object({
  statusText: z.string().max(100),
  statusEmoji: z.string().max(50).optional().default(""),
  confirm: z.literal(true),
}).strict();
