import { z } from 'zod';

export const httpUrlSchema = z.url({ protocol: /^https?$/ }).max(2_048);
