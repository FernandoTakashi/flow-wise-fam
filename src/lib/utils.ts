import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * className extra do DialogContent pra virar uma "folha" subindo da base no
 * mobile (e um modal centralizado normal no desktop) — o estilo original do
 * modal de "Novo lançamento". Usar em todo modal de criar/editar pra manter
 * a mesma aparência em vez de reescrever a string em cada tela.
 */
export const SHEET_DIALOG_CLASS =
  'max-h-[92vh] overflow-y-auto max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:max-w-none ' +
  'max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[28px] max-sm:border-x-0 max-sm:border-b-0';

/** UUID v4 — usa crypto.randomUUID quando disponível, com fallback. */
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
}
