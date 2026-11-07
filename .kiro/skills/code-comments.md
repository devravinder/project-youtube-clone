---
name: code-comments
description: Write minimal, precise code comments. Skip comments when names are self-explanatory; keep lines short. Use whenever writing or editing code, config, or scripts in any language.
---

# Code Comments

## Rules

- **Prefer self-explanatory names.** If the name says it, add no comment.
- **Comment the why, not the what.** Explain non-obvious constraints, trade-offs, or gotchas.
- **One line preferred.** Use more lines only when the reason truly needs it.
- **Every line stays short:** 10 words ideal, 15 words maximum.
- **No JSDoc/Javadoc blocks** that restate the signature or parameter names.
- **No section banners**, no decorative separators, no commented-out code.
- Applies to every language: TypeScript, Java, YAML, PowerShell, config files.

## Good

```ts
// Bucket is a logical store; key is the object path.
export interface StoragePort {
  createPresignedUploadUrl(bucket: string, key: string): Promise<string>;
}
```

## Bad

```ts
/**
 * Create a presigned upload URL.
 * @param bucket the bucket
 * @param key the key
 * @returns the url
 */
createPresignedUploadUrl(bucket: string, key: string): Promise<string>;
```

## When a comment is worth it

- A workaround for a tool or platform quirk.
- A non-obvious ordering or timing requirement.
- A deliberate deviation from the usual pattern, with the reason.
- A magic value that cannot be given a descriptive name.
