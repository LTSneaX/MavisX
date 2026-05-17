import { Link } from '@tanstack/react-router'
import useDialogState from '@/hooks/use-dialog-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutDialog } from '@/components/sign-out-dialog'
import { useAuthStore } from '@/stores/auth-store'
import { Settings, Shield, LogOut } from 'lucide-react'

export function ProfileDropdown() {
  const [open, setOpen] = useDialogState()
  const { auth } = useAuthStore()
  const displayName = auth.user?.email?.split('@')[0] ?? 'Local User'
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='relative h-8 w-8 rounded-full'>
            <Avatar className='h-8 w-8'>
              <AvatarFallback className='bg-zinc-800 text-zinc-300 text-xs font-semibold'>
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-52' align='end' forceMount>
          <DropdownMenuLabel className='font-normal'>
            <div className='flex flex-col gap-0.5'>
              <p className='text-sm font-semibold leading-none'>{displayName}</p>
              <p className='text-xs leading-none text-muted-foreground'>Local workspace</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link to='/settings'>
                <Settings className='h-4 w-4' />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to='/settings'>
                <Shield className='h-4 w-4' />
                Vault
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>
            <LogOut className='h-4 w-4' />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
