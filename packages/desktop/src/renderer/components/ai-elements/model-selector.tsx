"use client";

import * as React from "react";
import { ChevronDown, Check, X } from "lucide-react";
import { cn } from "../../lib/utils.js";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog.js";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command.js";

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

interface ModelSelectorContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
}

const ModelSelectorContext = React.createContext<ModelSelectorContextValue>({
  open: false,
  setOpen: () => {},
  value: "",
  onValueChange: () => {},
});

/* ------------------------------------------------------------------ */
/*  Root                                                               */
/* ------------------------------------------------------------------ */

interface ModelSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}

export function ModelSelector({
  value,
  onValueChange,
  children,
}: ModelSelectorProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <ModelSelectorContext.Provider value={{ open, setOpen, value, onValueChange }}>
      <Dialog open={open} onOpenChange={setOpen}>
        {children}
      </Dialog>
    </ModelSelectorContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Trigger                                                            */
/* ------------------------------------------------------------------ */

interface ModelSelectorTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  placeholder?: string;
}

export const ModelSelectorTrigger = React.forwardRef<
  HTMLButtonElement,
  ModelSelectorTriggerProps
>(({ className, placeholder = "Select model", children, ...props }, ref) => {
  const { value } = React.useContext(ModelSelectorContext);
  return (
    <DialogTrigger asChild>
      <button
        ref={ref}
        className={cn(
          "flex items-center justify-between gap-1 rounded-md border bg-transparent px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent",
          className,
        )}
        {...props}
      >
        <span className="max-w-[140px] truncate">
          {children ?? (value || placeholder)}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
      </button>
    </DialogTrigger>
  );
});
ModelSelectorTrigger.displayName = "ModelSelectorTrigger";

/* ------------------------------------------------------------------ */
/*  Content                                                            */
/* ------------------------------------------------------------------ */

interface ModelSelectorContentProps {
  className?: string;
  title?: string;
  children: React.ReactNode;
}

export function ModelSelectorContent({
  className,
  title = "Select model",
  children,
}: ModelSelectorContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] border border-border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:rounded-lg p-0 gap-0",
          className,
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
        <DialogPrimitive.Close className="absolute right-3 top-3 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ------------------------------------------------------------------ */
/*  Input                                                              */
/* ------------------------------------------------------------------ */

interface ModelSelectorInputProps {
  placeholder?: string;
}

export function ModelSelectorInput({
  placeholder = "Search models...",
}: ModelSelectorInputProps) {
  return (
    <CommandInput
      className="h-auto py-3.5"
      placeholder={placeholder}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  List                                                               */
/* ------------------------------------------------------------------ */

interface ModelSelectorListProps {
  children: React.ReactNode;
}

export function ModelSelectorList({ children }: ModelSelectorListProps) {
  return (
    <CommandList className="max-h-[300px] overflow-y-auto overflow-x-hidden">
      {children}
    </CommandList>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty                                                              */
/* ------------------------------------------------------------------ */

interface ModelSelectorEmptyProps {
  children?: React.ReactNode;
}

export function ModelSelectorEmpty({
  children = "No model found.",
}: ModelSelectorEmptyProps) {
  return <CommandEmpty className="py-6 text-center text-sm">{children}</CommandEmpty>;
}

/* ------------------------------------------------------------------ */
/*  Group                                                              */
/* ------------------------------------------------------------------ */

interface ModelSelectorGroupProps {
  heading: string;
  children: React.ReactNode;
}

export function ModelSelectorGroup({
  heading,
  children,
}: ModelSelectorGroupProps) {
  return (
    <CommandGroup
      className="overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
      heading={heading}
    >
      {children}
    </CommandGroup>
  );
}

/* ------------------------------------------------------------------ */
/*  Item                                                               */
/* ------------------------------------------------------------------ */

interface ModelSelectorItemProps {
  value: string;
  onSelect: () => void;
  children: React.ReactNode;
}

export function ModelSelectorItem({
  value,
  onSelect,
  children,
}: ModelSelectorItemProps) {
  const ctx = React.useContext(ModelSelectorContext);
  const isSelected = ctx.value === value;
  return (
    <CommandItem
      className={cn(
        "relative flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground",
        isSelected && "bg-accent/50",
      )}
      onSelect={() => {
        onSelect();
        ctx.onValueChange(value);
        ctx.setOpen(false);
      }}
      value={value}
    >
      {children}
      {isSelected && (
        <Check className="ml-auto h-4 w-4 shrink-0" />
      )}
    </CommandItem>
  );
}

/* ------------------------------------------------------------------ */
/*  Name                                                               */
/* ------------------------------------------------------------------ */

interface ModelSelectorNameProps {
  children: React.ReactNode;
}

export function ModelSelectorName({ children }: ModelSelectorNameProps) {
  return <span>{children}</span>;
}

/* ------------------------------------------------------------------ */
/*  Logo                                                               */
/* ------------------------------------------------------------------ */

interface ModelSelectorLogoProps {
  provider: string;
  className?: string;
}

export function ModelSelectorLogo({
  provider,
  className,
}: ModelSelectorLogoProps) {
  const initial = provider.charAt(0).toUpperCase();
  // Deterministic color from provider name (avoids external image loading)
  const hue = [...provider].reduce((h, c) => h + c.charCodeAt(0) * 13, 0) % 360;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-5 w-5 rounded-sm flex items-center justify-center text-[10px] font-semibold text-white shrink-0",
        className,
      )}
      style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
    >
      {initial}
    </span>
  );
}
