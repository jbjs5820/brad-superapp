const { z } = require('zod');

const PermissionsSchema = z.object({
  tools: z.array(z.string()).default([]),
  files: z
    .object({
      read: z.array(z.string()).default([]),
      write: z.array(z.string()).default([]),
    })
    .optional(),
  network: z
    .object({
      allow: z.array(z.string()).default([]),
    })
    .optional(),
});

const CommandSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  script: z.string().min(1),
});

const EntrypointsSchema = z
  .object({
    runbook: z.string().optional(),
    commands: z.array(CommandSchema).default([]),
  })
  .optional();

const ManifestSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  author: z.string().optional(),
  homepage: z.string().url().optional(),
  license: z.string().optional(),
  tags: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
  permissions: PermissionsSchema,
  entrypoints: EntrypointsSchema,
});

module.exports = { ManifestSchema };
