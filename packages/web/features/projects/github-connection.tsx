'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Github, Loader2 } from 'lucide-react'

export function GithubConnection() {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)

  const handleConnect = async () => {
    setIsConnecting(true)
    // Simulate GitHub OAuth flow
    await new Promise(resolve => setTimeout(resolve, 2000))
    setIsConnecting(false)
    setIsConnected(true)
  }

  if (isConnected) {
    return (
      <Card className="bg-card border-sidebar-border p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-accent">
              <Github className="h-5 w-5 text-sidebar-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Connected to GitHub</p>
              <p className="text-sm text-muted-foreground">octocat</p>
            </div>
          </div>
          <Button variant="outline" size="sm">
            Disconnect
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-sidebar-border p-6">
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-sidebar-accent">
          <Github className="h-6 w-6 text-sidebar-foreground" />
        </div>
        <div className="text-center">
          <h3 className="text-base font-semibold text-foreground">Connect GitHub</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Import your repositories to analyze code structure
          </p>
        </div>
        <Button 
          onClick={handleConnect} 
          disabled={isConnecting}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isConnecting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Github className="mr-2 h-4 w-4" />
              Connect with GitHub
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}
