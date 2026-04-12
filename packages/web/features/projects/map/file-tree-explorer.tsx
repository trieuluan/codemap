"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Folder,
  FolderOpen,
} from "lucide-react";

export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  language?: string;
  size?: number;
}

const MOCK_FILE_TREE: FileNode[] = [
  {
    id: 'src',
    name: 'src',
    type: 'folder',
    children: [
      {
        id: 'components',
        name: 'components',
        type: 'folder',
        children: [
          { id: 'Button.tsx', name: 'Button.tsx', type: 'file', language: 'TypeScript', size: 2400 },
          { id: 'Card.tsx', name: 'Card.tsx', type: 'file', language: 'TypeScript', size: 1800 },
          { id: 'Modal.tsx', name: 'Modal.tsx', type: 'file', language: 'TypeScript', size: 3200 },
          {
            id: 'ui',
            name: 'ui',
            type: 'folder',
            children: [
              { id: 'badge.tsx', name: 'badge.tsx', type: 'file', language: 'TypeScript', size: 1200 },
              { id: 'avatar.tsx', name: 'avatar.tsx', type: 'file', language: 'TypeScript', size: 1400 },
            ]
          }
        ]
      },
      {
        id: 'hooks',
        name: 'hooks',
        type: 'folder',
        children: [
          { id: 'useAuth.ts', name: 'useAuth.ts', type: 'file', language: 'TypeScript', size: 2800 },
          { id: 'useTheme.ts', name: 'useTheme.ts', type: 'file', language: 'TypeScript', size: 1600 },
        ]
      },
      {
        id: 'utils',
        name: 'utils',
        type: 'folder',
        children: [
          { id: 'cn.ts', name: 'cn.ts', type: 'file', language: 'TypeScript', size: 400 },
          { id: 'helpers.ts', name: 'helpers.ts', type: 'file', language: 'TypeScript', size: 3100 },
        ]
      },
      { id: 'App.tsx', name: 'App.tsx', type: 'file', language: 'TypeScript', size: 1200 },
      { id: 'index.ts', name: 'index.ts', type: 'file', language: 'TypeScript', size: 300 },
    ]
  },
  {
    id: 'public',
    name: 'public',
    type: 'folder',
    children: [
      { id: 'logo.svg', name: 'logo.svg', type: 'file', language: 'SVG', size: 4200 },
      { id: 'favicon.ico', name: 'favicon.ico', type: 'file', language: 'Image', size: 15000 },
    ]
  },
  { id: 'package.json', name: 'package.json', type: 'file', language: 'JSON', size: 2100 },
  { id: 'tsconfig.json', name: 'tsconfig.json', type: 'file', language: 'JSON', size: 800 },
  { id: '.env.example', name: '.env.example', type: 'file', language: 'Text', size: 340 },
  { id: 'README.md', name: 'README.md', type: 'file', language: 'Markdown', size: 5600 },
];

interface FileTreeProps {
  onSelectFile: (file: FileNode) => void;
  selectedFileId?: string;
}

function FileTreeItem({
  node,
  level = 0,
  onSelectFile,
  selectedFileId,
}: {
  node: FileNode;
  level?: number;
  onSelectFile: (file: FileNode) => void;
  selectedFileId?: string;
}) {
  const [isOpen, setIsOpen] = useState(level < 2);
  const isFolder = node.type === "folder";
  const isSelected = selectedFileId === node.id;

  return (
    <div>
      <div
        onClick={() => {
          if (isFolder) {
            setIsOpen(!isOpen)
          } else {
            onSelectFile(node)
          }
        }}
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer rounded transition-colors ${
          isSelected
            ? "bg-sidebar-accent text-sidebar-foreground"
            : "hover:bg-sidebar-accent/30 text-sidebar-foreground"
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {isFolder ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 flex-shrink-0" />
            )}
            {isOpen ? (
              <FolderOpen className="h-4 w-4 flex-shrink-0" />
            ) : (
              <Folder className="h-4 w-4 flex-shrink-0" />
            )}
          </>
        ) : (
          <>
            <div className="w-4" />
            <FileCode className="h-4 w-4 flex-shrink-0" />
          </>
        )}
        <span className="text-sm truncate flex-1">{node.name}</span>
        {!isFolder && node.size && (
          <span className="text-xs text-muted-foreground ml-2">
            {(node.size / 1024).toFixed(1)}kb
          </span>
        )}
      </div>

      {isFolder && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.id}
              node={child}
              level={level + 1}
              onSelectFile={onSelectFile}
              selectedFileId={selectedFileId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTreeExplorer({ onSelectFile, selectedFileId }: FileTreeProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-sidebar-border">
        <h3 className="text-sm font-semibold text-foreground">Files</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="py-2">
          {MOCK_FILE_TREE.map((node) => (
            <FileTreeItem
              key={node.id}
              node={node}
              onSelectFile={onSelectFile}
              selectedFileId={selectedFileId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
