import { z } from 'zod'

// Login accepts either an email address or a phone number, so this can't
// require email() formatting the way registration does.
export const loginSchema = z.object({
  identifier: z.string().min(3, 'Enter your email or phone number'),
  password: z.string().min(1, 'Password required')
})

export const registerSchema = z.object({
  name: z.string().min(2, 'Name too short'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be 8+ characters'),
  confirm_password: z.string()
}).refine((data) => data.password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password']
})

export const organizationSchema = z.object({
  name: z.string().min(1, 'Organization name required'),
  description: z.string().optional()
})

export const taskSchema = z.object({
  title: z.string().min(1, 'Task title required'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  status: z.enum(['todo', 'in_progress', 'review', 'done']).default('todo'),
  due_date: z.string().optional()
})

export const inviteSchema = z.object({
  email: z.string().email('Invalid email'),
  role: z.enum(['member', 'viewer', 'editor', 'admin'])
})

export const validate = (schema, data) => {
  try {
    return { success: true, data: schema.parse(data) }
  } catch (error) {
    return { success: false, error: error.errors[0]?.message || 'Validation failed' }
  }
}
