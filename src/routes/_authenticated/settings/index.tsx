import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SettingsPage } from '@/features/settings'

const searchSchema = z.object({
  tab: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/settings/')({
  validateSearch: searchSchema,
  component: SettingsPage,
})
