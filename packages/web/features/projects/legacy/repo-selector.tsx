'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronRight, Github } from 'lucide-react'

interface Repository {
  id: string
  name: string
  description: string
  language: string
  stars: number
  url: string
}

const MOCK_REPOS: Repository[] = [
  {
    id: '1',
    name: 'react-components',
    description: 'Reusable React component library with TypeScript',
    language: 'TypeScript',
    stars: 1250,
    url: 'https://github.com/...'
  },
  {
    id: '2',
    name: 'node-api-server',
    description: 'Express.js REST API with MongoDB integration',
    language: 'JavaScript',
    stars: 892,
    url: 'https://github.com/...'
  },
  {
    id: '3',
    name: 'next-saas-template',
    description: 'Full-stack SaaS starter with Next.js and Supabase',
    language: 'TypeScript',
    stars: 2341,
    url: 'https://github.com/...'
  },
  {
    id: '4',
    name: 'python-data-pipeline',
    description: 'Data processing pipeline for ML workflows',
    language: 'Python',
    stars: 456,
    url: 'https://github.com/...'
  },
]

export function RepoSelector() {
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground mb-3">Select Repository</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Choose a repository to analyze and import
        </p>
      </div>
      
      <div className="grid gap-3">
        {MOCK_REPOS.map(repo => (
          <Card 
            key={repo.id}
            onClick={() => setSelectedRepo(repo.id)}
            className={`bg-card border-sidebar-border p-4 cursor-pointer transition-all ${
              selectedRepo === repo.id 
                ? 'border-primary bg-card/80 shadow-lg' 
                : 'hover:border-sidebar-accent'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Github className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <h4 className="text-sm font-medium text-foreground truncate">{repo.name}</h4>
                </div>
                <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                  {repo.description}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="px-2 py-1 bg-sidebar-accent rounded">{repo.language}</span>
                  <span>⭐ {repo.stars.toLocaleString()}</span>
                </div>
              </div>
              <ChevronRight className={`h-5 w-5 flex-shrink-0 transition-transform ${
                selectedRepo === repo.id ? 'text-primary' : 'text-muted-foreground'
              }`} />
            </div>
          </Card>
        ))}
      </div>

      {selectedRepo && (
        <div className="flex gap-2 pt-4">
          <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
            Import Repository
          </Button>
          <Button 
            variant="outline"
            onClick={() => setSelectedRepo(null)}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
