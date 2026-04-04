import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function hasValidDateValue(value?: string | null) {
  return Boolean(value && !Number.isNaN(new Date(value).getTime()));
}

export function formatDate(value?: string | null) {
  if (!hasValidDateValue(value)) return "-";
  const safeValue = value as string;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(safeValue));
}

export function formatDateTime(value?: string | null) {
  if (!hasValidDateValue(value)) return "-";
  const safeValue = value as string;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(safeValue));
}

export function formatHours(value: number) {
  return `${value.toFixed(1)}h`;
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function formatFeet(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `${Math.round(value * 3.28084).toLocaleString("en-US")} ft`;
}

export function formatKnots(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `${Math.round(value * 1.94384).toLocaleString("en-US")} kt`;
}

export function formatVerticalRate(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `${Math.round(value * 196.8504).toLocaleString("en-US")} ft/min`;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
