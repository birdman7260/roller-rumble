import { createContext, use } from "react";

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
}

export type ShowToast = (toast: ToastOptions) => void;

export const ToastContext = createContext<ShowToast | null>(null);

export function useToast(): { showToast: ShowToast } {
  const showToast = use(ToastContext);
  if (!showToast) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return { showToast };
}
