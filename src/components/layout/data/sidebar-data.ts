import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarClock,
  Container,
  FileText,
  FolderOpen,
  Globe,
  LayoutDashboard,
  Monitor,
  Network,
  ScrollText,
  ServerCog,
  Settings,
  ShieldCheck,
  Terminal,
  Users,
  Wifi,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'Local User',
    email: 'local@mavisx',
    avatar: '',
  },
  teams: [
    {
      name: 'My Workspace',
      logo: Monitor,
      plan: 'Local',
    },
  ],
  navGroups: [
    {
      title: 'Monitoring',
      items: [
        { title: 'Overview',     url: '/',            icon: LayoutDashboard },
        { title: 'Monitors',     url: '/monitors',     icon: Activity },
        { title: 'Incidents',    url: '/incidents',    icon: AlertTriangle },
        { title: 'Maintenance',  url: '/maintenance',  icon: CalendarClock },
        { title: 'Status Page',  url: '/status-page',  icon: Globe, pro: true },
      ],
    },
    {
      title: 'Infrastructure',
      items: [
        { title: 'Connections',   url: '/connections', icon: Wifi },
        { title: 'SSH Terminal',  url: '/ssh',         icon: Terminal,    pro: true },
        { title: 'File Manager',  url: '/files',       icon: FolderOpen,  pro: true },
        { title: 'Log Viewer',    url: '/log-viewer',  icon: ScrollText,  pro: true },
        { title: 'Web Viewer',    url: '/web-viewer',  icon: FileText,    pro: true },
      ],
    },
    {
      title: 'Tools',
      items: [
        { title: 'Network Toolkit', url: '/network', icon: Network },
        { title: 'Docker',          url: '/docker',  icon: Container, pro: true },
        { title: 'Agents',          url: '/agents',  icon: ServerCog, pro: true },
      ],
    },
    {
      title: 'Team',
      items: [
        { title: 'Workspaces', url: '/cloud', icon: Users, enterprise: true },
      ],
    },
    {
      title: 'Configuration',
      items: [
        { title: 'Vault',       url: '/vault',    icon: ShieldCheck, pro: true },
        { title: 'Alert Rules', url: '/alerts',   icon: Bell,        pro: true },
        { title: 'Settings',    url: '/settings', icon: Settings },
      ],
    },
  ],
}
