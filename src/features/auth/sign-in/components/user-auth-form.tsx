import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Unlock } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'

const formSchema = z.object({
  username: z.string().min(1, 'Enter a display name.'),
  passphrase: z.string().min(1, 'Enter your local passphrase.'),
})

type FormValues = z.infer<typeof formSchema>

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

export function UserAuthForm({ className, redirectTo, ...props }: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { auth } = useAuthStore()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: '', passphrase: '' },
  })

  function onSubmit(data: FormValues) {
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      auth.setUser({
        accountNo: 'local-001',
        email: data.username,
        role: ['admin'],
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
      })
      auth.setAccessToken('local-session')
      navigate({ to: redirectTo || '/', replace: true })
      toast.success(`Welcome back, ${data.username}!`)
    }, 300)
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='username'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display name</FormLabel>
              <FormControl>
                <Input placeholder='Your name' autoComplete='username' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='passphrase'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Local passphrase</FormLabel>
              <FormControl>
                <PasswordInput
                  placeholder='••••••••'
                  autoComplete='current-password'
                  onKeyDown={(e) => e.key === 'Enter' && form.handleSubmit(onSubmit)()}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='mt-1' disabled={isLoading}>
          {isLoading ? <Loader2 className='animate-spin' /> : <Unlock className='h-4 w-4' />}
          Unlock
        </Button>
      </form>
    </Form>
  )
}
