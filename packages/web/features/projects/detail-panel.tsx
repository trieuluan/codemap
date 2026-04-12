'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Code2, GitBranch, Zap } from 'lucide-react'

interface FileNode {
  id: string
  name: string
  type: 'file' | 'folder'
  language?: string
  size?: number
}

interface DetailsPanel {
  file: FileNode
}

export function DetailPanel({ file }: DetailsPanel) {
  const fileExtension = file.name.split('.').pop()?.toUpperCase() || 'FILE'
  
  const mockDependencies = [
    'react@18.2.0',
    'typescript@5.0.0',
    '@types/react@18.0.0',
    'tailwindcss@3.3.0',
  ]

  const mockStructure = [
    { name: 'exports', count: 5 },
    { name: 'interfaces', count: 3 },
    { name: 'functions', count: 8 },
    { name: 'types', count: 12 },
  ]

  const mockEntryPoints = [
    { path: 'src/index.ts', type: 'Main Entry' },
    { path: 'src/hooks/index.ts', type: 'Hooks' },
    { path: 'src/utils/index.ts', type: 'Utils' },
  ]

  const mockHotspots = [
    { name: 'Modal.tsx', issues: 3, complexity: 'High' },
    { name: 'useAuth.ts', issues: 1, complexity: 'Medium' },
    { name: 'helpers.ts', issues: 2, complexity: 'High' },
  ]

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-accent">
            <Code2 className="h-5 w-5 text-sidebar-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {fileExtension} • {file.size ? `${(file.size / 1024).toFixed(1)}kb` : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="structure" className="flex-1 flex flex-col">
        <TabsList className="m-4 grid w-auto grid-cols-4 bg-sidebar-accent">
          <TabsTrigger value="structure" className="text-xs">Structure</TabsTrigger>
          <TabsTrigger value="dependencies" className="text-xs">Dependencies</TabsTrigger>
          <TabsTrigger value="entries" className="text-xs">Entries</TabsTrigger>
          <TabsTrigger value="hotspots" className="text-xs">Hotspots</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto px-4">
          <TabsContent value="structure" className="mt-0 space-y-3">
            <div className="text-sm text-muted-foreground mb-4">File structure analysis</div>
            {mockStructure.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-sidebar-accent">
                <span className="text-sm font-medium text-foreground capitalize">{item.name}</span>
                <span className="text-sm font-bold text-primary">{item.count}</span>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="dependencies" className="mt-0 space-y-2">
            <div className="text-sm text-muted-foreground mb-4">External dependencies</div>
            {mockDependencies.map((dep, i) => (
              <div key={i} className="flex items-center gap-2 p-3 rounded-lg bg-sidebar-accent text-sm">
                <GitBranch className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-mono text-foreground">{dep}</span>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="entries" className="mt-0 space-y-3">
            <div className="text-sm text-muted-foreground mb-4">Entry point definitions</div>
            {mockEntryPoints.map((entry, i) => (
              <div key={i} className="p-3 rounded-lg bg-sidebar-accent">
                <p className="text-xs text-muted-foreground">{entry.type}</p>
                <p className="text-sm font-mono text-foreground mt-1">{entry.path}</p>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="hotspots" className="mt-0 space-y-3">
            <div className="text-sm text-muted-foreground mb-4">Code complexity hotspots</div>
            {mockHotspots.map((hotspot, i) => (
              <div key={i} className="p-3 rounded-lg bg-sidebar-accent">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{hotspot.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {hotspot.issues} issue{hotspot.issues !== 1 ? 's' : ''} • {hotspot.complexity}
                    </p>
                  </div>
                  <Zap className="h-4 w-4 text-destructive flex-shrink-0 mt-1" />
                </div>
              </div>
            ))}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
