"use client";

import { memo, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { inferCodeLanguage } from "@/lib/syntax";

type CodeEditorProps = {
  path: string;
  value: string;
  onChange: (value: string) => void;
  onSelectionChange?: (selectedText: string) => void;
};

function languageExtension(path: string) {
  const language = inferCodeLanguage(path);
  if (language === "python") return python();
  if (language === "javascript") return javascript();
  if (language === "jsx") return javascript({ jsx: true });
  if (language === "typescript") return javascript({ typescript: true });
  if (language === "tsx") return javascript({ typescript: true, jsx: true });
  if (language === "html") return html();
  if (language === "css" || language === "scss") return css();
  if (language === "json") return json();
  if (language === "markdown") return markdown();
  if (language === "yaml") return yaml();
  return [];
}

export const CodeEditor = memo(function CodeEditor({
  path,
  value,
  onChange,
  onSelectionChange,
}: CodeEditorProps) {
  const extension = useMemo(() => languageExtension(path), [path]);
  const selectionListener = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (!onSelectionChange || !update.selectionSet) return;
        const selection = update.state.selection.main;
        if (selection.empty) {
          onSelectionChange("");
          return;
        }
        onSelectionChange(update.state.sliceDoc(selection.from, selection.to));
      }),
    [onSelectionChange]
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={[extension, selectionListener]}
      theme={oneDark}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        bracketMatching: true,
      }}
      className="h-[calc(100%-34px)] overflow-hidden rounded border border-white/12"
      height="100%"
    />
  );
});
