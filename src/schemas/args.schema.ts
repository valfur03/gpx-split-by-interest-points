import { z } from "zod";

export const argsSchema = z
  .tuple([z.string(), z.string(), z.string()])
  .rest(z.unknown())
  .transform(([argv0, script, filePath]) => ({
    argv0,
    script,
    filePath,
  }));
