"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";

/** Un campo mientras se edita: `from` es el campo que ya existía (para conservar sus datos al renombrarlo). */
export interface FieldDraft {
  key: string;
  from: string | null;
  name: string;
}

let nextKey = 0;
export const newField = (name = "", from: string | null = null): FieldDraft => ({ key: `f${nextKey++}`, from, name });

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Qué le falta a la lista de campos para poder guardarse; null si está bien. */
export function fieldsProblem(fields: FieldDraft[]): string | null {
  if (fields.length === 0) return "Agrega al menos un campo";
  if (fields.some((f) => !f.name.trim())) return "Ponle nombre a cada campo";
  const names = fields.map((f) => plain(f.name));
  const repeated = fields.find((_, i) => names.indexOf(names[i]!) !== i);
  return repeated ? `El campo "${repeated.name.trim()}" está repetido` : null;
}

export function FieldsEditor({
  fields,
  onChange,
  placeholders = [],
}: {
  fields: FieldDraft[];
  onChange: (fields: FieldDraft[]) => void;
  placeholders?: string[];
}): React.ReactElement {
  const set = (i: number, patch: Partial<FieldDraft>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, to: number) => {
    const next = [...fields];
    const [item] = next.splice(i, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={f.key} className="flex items-center gap-1">
          <Input
            value={f.name}
            maxLength={60}
            aria-label={`Campo ${i + 1}`}
            placeholder={placeholders[i] ?? `Campo ${i + 1}`}
            onChange={(e) => set(i, { name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onChange([...fields.slice(0, i + 1), newField(), ...fields.slice(i + 1)]);
              }
            }}
          />
          {f.from && f.from !== f.name.trim() && (
            <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">antes: {f.from}</span>
          )}
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Subir">
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            disabled={i === fields.length - 1}
            onClick={() => move(i, i + 1)}
            aria-label="Bajar"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            disabled={fields.length === 1}
            onClick={() => onChange(fields.filter((_, j) => j !== i))}
            aria-label="Quitar campo"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...fields, newField()])}>
        <Plus className="h-4 w-4" /> Agregar campo
      </Button>
    </div>
  );
}
