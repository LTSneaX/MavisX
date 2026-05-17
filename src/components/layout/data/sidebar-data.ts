import {
  Activity,
  AlertTriangle,
  Bell,
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
  Terminal,
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
        { title: 'Monitors',     url: '/monitors',    icon: Activity },
        { title: 'Incidents',    url: '/incidents',   icon: AlertTriangle },
        { title: 'Status Page',  url: '/status-page', icon: Globe },
      ],
    },
    {
      title: 'Infrastructure',
      items: [
        { title: 'Connections',   url: '/connections', icon: Wifi },
        { title: 'SSH Terminal',  url: '/ssh',         icon: Terminal },
        { title: 'File Manager',  url: '/files',       icon: FolderOpen },
        { title: 'Log Viewer',    url: '/log-viewer',  icon: ScrollText },
        { title: 'Web Viewer',    url: '/web-viewer',  icon: FileText },
      ],
    },
    {
      title: 'Tools',
      items: [
        { title: 'Network Toolkit', url: '/network', icon: Network },
        { title: 'Docker',          url: '/docker',  icon: Container },
        { title: 'Agents',          url: '/agents',  icon: ServerCog },
      ],
    },
    {
      title: 'Configuration',
      items: [
        { title: 'Alert Rules', url: '/alerts',   icon: Bell },
        { title: 'Settings',    url: '/settings', icon: Settings },
      ],
    },
  ],
}
