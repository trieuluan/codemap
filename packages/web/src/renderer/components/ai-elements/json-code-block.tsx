"use client";

import { refractor } from "refractor/core";
import json from "refractor/json";
import type { ReactNode } from "react";

if (!refractor.registered("json")) {
  refractor.register(json);
}

type HastNode =
  | { type: "root"; children?: HastNode[] }
  | { type: "text"; value?: string }
  | {
      type: "element";
      tagName?: string;
      properties?: { className?: string[] | string };
      children?: HastNode[];
    };

function renderNode(node: HastNode, key: string): ReactNode {
  if (node.type === "text") return node.value ?? "";
  if (node.type === "root") {
    return node.children?.map((child, index) => renderNode(child, `${key}-${index}`));
  }
  const className = Array.isArray(node.properties?.className)
    ? node.properties.className.join(" ")
    : node.properties?.className;
  const children = node.children?.map((child, index) => renderNode(child, `${key}-${index}`));
  return (
    <span className={className} key={key}>
      {children}
    </span>
  );
}

interface JsonCodeBlockProps {
  code: string;
}

export function JsonCodeBlock({ code }: JsonCodeBlockProps) {
  const tree = refractor.highlight(code, "json") as HastNode;
  return (
    <div className="json-code-block" data-streamdown="code-block">
      <pre>
        <code className="language-json">
          {renderNode(tree, "json")}
        </code>
      </pre>
    </div>
  );
}
