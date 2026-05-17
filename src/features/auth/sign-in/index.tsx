import { useSearch } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })

  return (
    <AuthLayout>
      <Card className='max-w-sm gap-4'>
        <CardHeader>
          <CardTitle className='text-lg tracking-tight'>Sign in to MavisX</CardTitle>
          <CardDescription>
            Enter your email and password to access your workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserAuthForm redirectTo={redirect} />
        </CardContent>
        <CardFooter className='justify-center'>
          <p className='text-sm text-muted-foreground'>
            Don't have an account?{' '}
            <Link to='/sign-up' className='text-foreground font-medium hover:underline'>
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
