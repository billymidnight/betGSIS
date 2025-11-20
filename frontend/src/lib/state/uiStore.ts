// UI store for toasts and modals
import { create } from 'zustand';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

interface UIStore {
  toasts: Toast[];
  showCSVUploader: boolean;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  setShowCSVUploader: (show: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  toasts: [],
  showCSVUploader: false,
  addToast: (toast) =>
    set((state) => {
      const id = `${Date.now()}-${Math.random()}`;
      const newToast: Toast = { ...toast, id };
      if (toast.duration) {
        setTimeout(() => {
          set((s) => ({
            toasts: s.toasts.filter((t) => t.id !== id),
          }));
        }, toast.duration);
      }
      return { toasts: [...state.toasts, newToast] };
    }),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  setShowCSVUploader: (show) => set({ showCSVUploader: show }),
}));
