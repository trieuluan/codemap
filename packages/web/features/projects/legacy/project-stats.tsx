'use client'

import { Card } from '@/components/ui/card'
import { FileCode, Link2, Zap } from 'lucide-react'

interface ProjectStat {
  label: string
  value: string
  icon: React.ReactNode
}

export function ProjectStats() {
  const stats: ProjectStat[] = [
    {
      label: 'Total Files',
      value: '1,247',
      icon: <FileCode className="h-5 w-5" />
    },
    {
      label: 'Dependencies',
      value: '42',
      icon: <Link2 className="h-5 w-5" />
    },
    {
      label: 'Entry Points',
      value: '8',
      icon: <Zap className="h-5 w-5" />
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {stats.map((stat, index) => (
        <Card 
          key={index}
          className="bg-card border-sidebar-border p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-foreground">
              {stat.icon}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {stat.label}
              </p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {stat.value}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
