import * as React from "react";

import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 5000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

type Toast = Omit<ToasterToast, "id">;

interface State {
  toasts: ToasterToast[];
}

type Action =
  | {
      type: "ADD_TOAST";
      toast: ToasterToast;
    }
  | {
      type: "UPDATE_TOAST";
      toast: Partial<ToasterToast> & { id: string };
    }
  | {
      type: "DISMISS_TOAST";
      toastId?: ToasterToast["id"];
    }
  | {
      type: "REMOVE_TOAST";
      toastId?: ToasterToast["id"];
    };

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const listeners: Array<(state: State) => void> = [];

let memoryState: State = { toasts: [] };

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((toastItem) =>
          toastItem.id === action.toast.id
            ? { ...toastItem, ...action.toast }
            : toastItem
        ),
      };

    case "DISMISS_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((toastItem) =>
          action.toastId === undefined || toastItem.id === action.toastId
            ? {
                ...toastItem,
                open: false,
              }
            : toastItem
        ),
      };

    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }

      return {
        ...state,
        toasts: state.toasts.filter((toastItem) => toastItem.id !== action.toastId),
      };

    default:
      return state;
  }
};

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

function addToRemoveQueue(toastId: string) {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: "REMOVE_TOAST",
      toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
}

function dismissToast(toastId?: string) {
  if (toastId) {
    addToRemoveQueue(toastId);
  } else {
    memoryState.toasts.forEach((toastItem) => {
      addToRemoveQueue(toastItem.id);
    });
  }

  dispatch({
    type: "DISMISS_TOAST",
    toastId,
  });
}

function toast(props: Toast) {
  const id = genId();

  const update = (nextProps: Partial<Toast>) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...nextProps, id },
    });

  const dismiss = () => dismissToast(id);

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) {
          dismiss();
        }
      },
    },
  });

  return {
    id,
    dismiss,
    update,
  };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);

    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: dismissToast,
  };
}

export { useToast, toast };