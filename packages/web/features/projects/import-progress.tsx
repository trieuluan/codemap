'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { CheckCircle2, Loader2 } from 'lucide-react'

interface ImportStep {
  label: string
  status: 'pending' | 'loading' | 'complete'
  details?: string
}

export function ImportProgress() {
  const [steps, setSteps] = useState<ImportStep[]>([
    { label: 'Authenticating', status: 'complete', details: 'Connected to GitHub' },
    { label: 'Analyzing Repository', status: 'complete', details: 'Scanning 1,247 files' },
    { label: 'Building AST', status: 'loading', details: 'Processing TypeScript files' },
    { label: 'Extracting Dependencies', status: 'pending' },
    { label: 'Generating Report', status: 'pending' },
  ])

  useEffect(() => {
    const timer = setInterval(() => {
      setSteps(prev => {
        const updated = [...prev]
        const loadingIndex = updated.findIndex(s => s.status === 'loading')
        
        if (loadingIndex !== -1) {
          updated[loadingIndex].status = 'complete'
          if (loadingIndex + 1 < updated.length) {
            updated[loadingIndex + 1].status = 'loading'
          }
        }
        
        return updated
      })
    }, 2000)

    return () => clearInterval(timer)
  }, [])

  const isComplete = steps.every(s => s.status === 'complete')

  return (
    <Card className="bg-card border-sidebar-border p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {isComplete ? 'Import Complete' : 'Importing Repository'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            react-components · main branch
          </p>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="mt-1 flex-shrink-0">
                {step.status === 'complete' && (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                )}
                {step.status === 'loading' && (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                )}
                {step.status === 'pending' && (
                  <div className="h-5 w-5 rounded-full border-2 border-sidebar-accent" />
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${
                  step.status === 'complete' 
                    ? 'text-foreground' 
                    : 'text-muted-foreground'
                }`}>
                  {step.label}
                </p>
                {step.details && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {step.details}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {isComplete && (
          <div className="mt-6 flex gap-2">
            <button className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium">
              View Analysis
            </button>
            <button className="flex-1 px-4 py-2 border border-sidebar-border text-foreground rounded-lg hover:bg-sidebar-accent transition text-sm font-medium">
              Import Another
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}
