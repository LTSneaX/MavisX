import { useTheme } from '@/context/theme-provider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Moon, Sun, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

export function AppearanceTab() {
  const { theme, setTheme } = useTheme()

  return (
    <div className='flex flex-col gap-6 max-w-2xl'>
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Choose how MavisX looks on your screen.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={theme}
            onValueChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}
            className='grid grid-cols-3 gap-4 max-w-md'
          >
            {THEMES.map(({ value, label, icon: Icon }) => (
              <Label
                key={value}
                htmlFor={`theme-${value}`}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-colors',
                  theme === value
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/40'
                )}
              >
                <RadioGroupItem id={`theme-${value}`} value={value} className='sr-only' />
                <Icon className='h-5 w-5' />
                <span className='text-sm font-medium'>{label}</span>
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>
    </div>
  )
}
