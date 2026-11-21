declare module '*/design-final/assets/js/app.js';
declare module '*/design-final/assets/js/icons.js';

interface DesignModal {
  title: string;
  body?: string;
  confirm?: string;
  cancel?: string;
  tone?: string;
  disabledUntil?: string;
  onConfirm?: (modal: HTMLElement) => void;
}

interface Window {
  TRYLOG: {
    notifications: {
      href: string;
      icon: string;
      title: string;
      body: string;
      time: string;
      unread: boolean;
    }[];
  };
  App: {
    toast: (message: string) => void;
    esc: (value: unknown) => string;
    icon: (name: string, size?: number, className?: string) => string;
    openModal: (options: DesignModal) => void;
    closeModal: () => void;
    hydrateIcons: (root?: ParentNode) => void;
    badge: (status: string) => string;
    notifPanel: () => string;
  };
}
