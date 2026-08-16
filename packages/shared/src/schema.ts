import { z } from 'zod'

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
  .nullable()

export const taskFrontmatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  project: z.string().min(1),
  status: z.enum(['todo', 'doing', 'done']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  due: dateString.default(null),
  scheduled: dateString.default(null),
  tags: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  created: z.string().default(() => new Date().toISOString()),
  completed: z.string().nullable().default(null),
})

export type TaskFrontmatter = z.infer<typeof taskFrontmatterSchema>

export const bookVersionSchema = z.object({
  key: z.string(),
  name: z.string(),
  path: z.string(),
})

export const bookTomlSchema = z.object({
  book: z.object({
    title: z.string().default('未命名书籍'),
    authors: z.array(z.string()).default([]),
  }),
  versions: z
    .object({
      active: z.string().nullable().default(null),
      list: z.array(bookVersionSchema).default([]),
    })
    .default({ active: null, list: [] }),
})
