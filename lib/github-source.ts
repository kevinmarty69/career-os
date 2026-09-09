import { z } from 'zod';

export const githubRepositorySchema = z
  .string()
  .trim()
  .max(2048)
  .transform((value, ctx) => {
    const match =
      /^(?:https:\/\/github\.com\/)?([a-zA-Z0-9][a-zA-Z0-9-]{0,38})\/([a-zA-Z0-9_.-]{1,100})\/?$/.exec(
        value,
      );
    if (!match || ['.', '..'].includes(match[2])) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a public GitHub owner/repository URL.',
      });
      return z.NEVER;
    }
    return `${match[1]}/${match[2]}`;
  });

export const githubSourceSchema = z
  .object({
    repository: githubRepositorySchema,
    url: z.url().max(2048),
    readme: z.string().min(1).max(262144),
    sha: z.string().regex(/^[a-f0-9]{40,64}$/),
    stars: z.number().int().nonnegative(),
    languages: z.array(z.string().max(100)).max(100),
    updatedAt: z.iso.datetime(),
    fetchedAt: z.iso.datetime(),
  })
  .strict();

export function parseGitHubSource(
  repository: string,
  repo: unknown,
  file: unknown,
  languages: unknown,
  fetchedAt: string,
) {
  const details = z
    .object({
      full_name: z.string(),
      private: z.literal(false),
      stargazers_count: z.number().int().nonnegative(),
      updated_at: z.iso.datetime(),
    })
    .parse(repo);
  if (details.full_name.toLowerCase() !== repository.toLowerCase())
    throw new Error('Repository changed; use its current URL.');
  const readme = z
    .object({
      type: z.literal('file'),
      encoding: z.literal('base64'),
      content: z
        .string()
        .max(360000)
        .regex(/^[A-Za-z0-9+/=\s]*$/),
      size: z.number().int().positive().max(262144),
      sha: z.string(),
    })
    .parse(file);
  const bytes = Uint8Array.from(
    atob(readme.content.replace(/\s/g, '')),
    (char) => char.charCodeAt(0),
  );
  if (bytes.length !== readme.size) throw new Error('Invalid README size.');
  return githubSourceSchema.parse({
    repository,
    url: `https://github.com/${repository}`,
    readme: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    sha: readme.sha,
    stars: details.stargazers_count,
    languages: Object.keys(
      z
        .record(z.string().max(100), z.number().int().nonnegative())
        .parse(languages),
    ),
    updatedAt: details.updated_at,
    fetchedAt,
  });
}
