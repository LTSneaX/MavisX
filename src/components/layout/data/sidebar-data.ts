import {
  Activity,
  AlertTriangle,
  Bell,
  Cloud,
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
    name: 'SneaX',
    email: 'user@mavisx.com',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'My Workspace',
      logo: Monitor,
      plan: 'Free',
    },
  ],
  navGroups: [
    {
      title: 'Monitoring',
      items: [
        {
          title: 'Overview',
          url: '/',
          icon: LayoutDashboard,
        },
        {
          title: 'Monitors',
          url: '/monitors',
          icon: Activity,
        },
        {
          title: 'Incidents',
          url: '/incidents',
          icon: AlertTriangle,
        },
        {
          title: 'Status Page',
          url: '/status-page',
          icon: Globe,
        },
      ],
    },
    {
      title: 'Infrastructure',
      items: [
        {
          title: 'Connections',
          url: '/connections',
          icon: Wifi,
        },
        {
          title: 'SSH Terminal',
          url: '/ssh',
          icon: Terminal,
        },
        {
          title: 'File Manager',
          url: '/files',
          icon: FolderOpen,
        },
        {
          title: 'Web Viewer',
          url: '/web-viewer',
          icon: FileText,
        },
        {
          title: 'Log Viewer',
          url: '/log-viewer',
          icon: ScrollText,
        },
      ],
    },
    {
      title: 'Tools',
      items: [
        {
          title: 'Network Toolkit',
          url: '/network',
          icon: Network,
        },
      ],
    },
    {
      title: 'Metrics',
      items: [
        {
          title: 'Agents',
          url: '/agents',
          icon: ServerCog,
          pro: true,
        },
        {
          title: 'Docker',
          url: '/docker',
          icon: Container,
          pro: true,
        },
      ],
    },
    {
      title: 'Team',
      items: [
        {
          title: 'MavisX Cloud',
          url: '/cloud',
          icon: Cloud,
          pro: true,
        },
      ],
    },
    {
      title: 'Configuration',
      items: [
        {
          title: 'Alert Rules',
          url: '/alerts',
          icon: Bell,
        },
        {
          title: 'Settings',
          url: '/settings',
          icon: Settings,
        },
      ],
    },
  ],
}
