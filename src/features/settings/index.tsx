import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { GeneralTab } from './tabs/general'
import { AppearanceTab } from './tabs/appearance'
import { NotificationsTab } from './tabs/notifications'
import { VaultTab } from './tabs/vault'
import { StorageTab } from './tabs/storage'
import { AboutTab } from './tabs/about'

export function SettingsPage() {
  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-2 me-auto'>
          <span className='font-semibold'>Settings</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-6'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Settings</h2>
          <p className='text-muted-foreground'>Manage your workspace and preferences.</p>
        </div>

        <Tabs defaultValue='general' className='flex flex-col gap-4'>
          <TabsList className='w-fit'>
            <TabsTrigger value='general'>General</TabsTrigger>
            <TabsTrigger value='notifications'>Notifications</TabsTrigger>
            <TabsTrigger value='vault'>Vault</TabsTrigger>
            <TabsTrigger value='storage'>Storage</TabsTrigger>
            <TabsTrigger value='appearance'>Appearance</TabsTrigger>
            <TabsTrigger value='about'>About</TabsTrigger>
          </TabsList>

          <TabsContent value='general' className='mt-0'>
            <GeneralTab />
          </TabsContent>

          <TabsContent value='notifications' className='mt-0'>
            <NotificationsTab />
          </TabsContent>

          <TabsContent value='vault' className='mt-0'>
            <VaultTab />
          </TabsContent>

          <TabsContent value='storage' className='mt-0'>
            <StorageTab />
          </TabsContent>

          <TabsContent value='appearance' className='mt-0'>
            <AppearanceTab />
          </TabsContent>

          <TabsContent value='about' className='mt-0'>
            <AboutTab />
          </TabsContent>
        </Tabs>
      </Main>
    </>
  )
}
