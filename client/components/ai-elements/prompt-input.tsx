"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "ai";
import { CornerDownLeftIcon, SquareIcon, XIcon } from "lucide-react";
import type {
  ChangeEvent,
  ChangeEventHandler,
  ComponentProps,
  FormEvent,
  FormEventHandler,
  HTMLAttributes,
  KeyboardEventHandler,
  PropsWithChildren,
  ReactNode,
} from "react";
import {
  Children,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * ai-elements `prompt-input`, adapted in place.
 *
 * Trimmed to the surface this app uses. What was removed and why:
 *
 *  - Attachments, screenshot capture, global drag-and-drop and "referenced
 *    sources". This agent accepts text only, and the `DropdownMenuItem`-based
 *    action buttons that drove them do not typecheck against the Base UI
 *    (`base-nova`) menu primitives this project is styled with.
 *  - The hover-card wrappers: `base-nova`'s `hover-card` is Base UI's
 *    `PreviewCard`, which has no `openDelay`/`closeDelay`, so the shipped
 *    wrappers fail to compile here.
 *  - The `Command`/`DropdownMenu`/tabs wrappers, which only existed to serve
 *    the attachment menu and a model *search* palette this app does not need
 *    (the deployment exposes a handful of models, so a plain select is right).
 *
 * What was fixed: `PromptInputSubmit`'s click handler is typed from the button
 * it renders, because Base UI hands its own `BaseUIEvent` to `onClick` rather
 * than a bare React `MouseEvent`.
 */

// ============================================================================
// Provider Context & Types
// ============================================================================

export interface TextInputContext {
  value: string;
  setInput: (value: string) => void;
  clear: () => void;
}

export interface PromptInputControllerProps {
  textInput: TextInputContext;
}

const PromptInputController = createContext<PromptInputControllerProps | null>(null);

export const usePromptInputController = () => {
  const context = useContext(PromptInputController);
  if (!context) {
    throw new Error(
      "Wrap your component inside <PromptInputProvider> to use usePromptInputController()."
    );
  }
  return context;
};

/** Optional variant that does not throw, so `PromptInput` stays self-managed. */
const useOptionalPromptInputController = () => useContext(PromptInputController);

export type PromptInputProviderProps = PropsWithChildren<{
  initialInput?: string;
}>;

/**
 * Optional provider that lifts the composer's text out of `PromptInput`, so
 * siblings (a character counter, a send guard) can read it. Without it
 * `PromptInput` stays fully self-managed and reads the text from the form.
 */
export const PromptInputProvider = ({
  initialInput = "",
  children,
}: PromptInputProviderProps) => {
  const [value, setValue] = useState(initialInput);
  const clear = useCallback(() => {
    setValue("");
  }, []);

  const controller = useMemo<PromptInputControllerProps>(
    () => ({ textInput: { clear, setInput: setValue, value } }),
    [clear, value]
  );

  return (
    <PromptInputController.Provider value={controller}>
      {children}
    </PromptInputController.Provider>
  );
};

// ============================================================================
// PromptInput
// ============================================================================

export interface PromptInputMessage {
  text: string;
}

export type PromptInputProps = Omit<
  HTMLAttributes<HTMLFormElement>,
  "onSubmit" | "onError"
> & {
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>
  ) => void | Promise<void>;
};

export const PromptInput = ({ className, onSubmit, children, ...props }: PromptInputProps) => {
  const controller = useOptionalPromptInputController();

  const handleSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    (event) => {
      event.preventDefault();

      const form = event.currentTarget;
      let text: string;

      if (controller) {
        text = controller.textInput.value;
      } else {
        const field = new FormData(form).get("message");
        text = typeof field === "string" ? field : "";
      }

      // Reset first, so text typed while an async `onSubmit` settles is kept.
      if (controller) {
        controller.textInput.clear();
      } else {
        form.reset();
      }

      void Promise.resolve(onSubmit({ text }, event)).catch(() => undefined);
    },
    [controller, onSubmit]
  );

  return (
    <form className={cn("w-full", className)} onSubmit={handleSubmit} {...props}>
      <InputGroup className="overflow-hidden">{children}</InputGroup>
    </form>
  );
};

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

/**
 * Do NOT wrap the textarea and footer in this.
 *
 * `InputGroup` only becomes a column via `has-[>[data-align=block-end]]:flex-col`,
 * a direct-child selector. `display: contents` changes how a box renders but not
 * the DOM tree, so wrapping the footer here makes it a grandchild, the selector
 * stops matching, the group stays a row, and the `flex-1` textarea collapses to
 * a sliver beside the footer.
 *
 * Pass the textarea and footer straight to `PromptInput`. This is kept only for
 * parity with the upstream registry component.
 */
export const PromptInputBody = ({ className, ...props }: PromptInputBodyProps) => (
  <div className={cn("contents", className)} {...props} />
);

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>;

export const PromptInputTextarea = ({
  onChange,
  onKeyDown,
  className,
  placeholder = "What would you like to know?",
  ...props
}: PromptInputTextareaProps) => {
  const controller = useOptionalPromptInputController();
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      onKeyDown?.(event);

      if (event.defaultPrevented || event.key !== "Enter") {
        return;
      }
      // Never interrupt IME composition, and keep Shift+Enter as a newline.
      if (isComposing || event.nativeEvent.isComposing || event.shiftKey) {
        return;
      }

      event.preventDefault();

      const { form } = event.currentTarget;
      const submitButton = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submitButton?.disabled) {
        return;
      }

      form?.requestSubmit();
    },
    [onKeyDown, isComposing]
  );

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false);
  }, []);
  const handleCompositionStart = useCallback(() => {
    setIsComposing(true);
  }, []);

  const handleControlledChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      controller?.textInput.setInput(event.currentTarget.value);
      onChange?.(event);
    },
    [controller, onChange]
  );

  const controlledProps: {
    onChange?: ChangeEventHandler<HTMLTextAreaElement>;
    value?: string;
  } = controller
    ? { onChange: handleControlledChange, value: controller.textInput.value }
    : { onChange };

  return (
    <InputGroupTextarea
      className={cn("field-sizing-content max-h-48 min-h-16", className)}
      name="message"
      onCompositionEnd={handleCompositionEnd}
      onCompositionStart={handleCompositionStart}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      {...props}
      {...controlledProps}
    />
  );
};

export type PromptInputHeaderProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

export const PromptInputHeader = ({ className, ...props }: PromptInputHeaderProps) => (
  <InputGroupAddon
    align="block-start"
    className={cn("order-first flex-wrap gap-1", className)}
    {...props}
  />
);

export type PromptInputFooterProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

export const PromptInputFooter = ({ className, ...props }: PromptInputFooterProps) => (
  <InputGroupAddon align="block-end" className={cn("justify-between gap-1", className)} {...props} />
);

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTools = ({ className, ...props }: PromptInputToolsProps) => (
  <div className={cn("flex min-w-0 items-center gap-1", className)} {...props} />
);

export type PromptInputButtonTooltip =
  | string
  | {
      content: ReactNode;
      shortcut?: string;
      side?: ComponentProps<typeof TooltipContent>["side"];
    };

export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton> & {
  tooltip?: PromptInputButtonTooltip;
};

export const PromptInputButton = ({
  variant = "ghost",
  className,
  size,
  tooltip,
  ...props
}: PromptInputButtonProps) => {
  const newSize = size ?? (Children.count(props.children) > 1 ? "sm" : "icon-sm");

  const button = (
    <InputGroupButton
      className={cn(className)}
      size={newSize}
      type="button"
      variant={variant}
      {...props}
    />
  );

  if (!tooltip) {
    return button;
  }

  const tooltipContent = typeof tooltip === "string" ? tooltip : tooltip.content;
  const shortcut = typeof tooltip === "string" ? undefined : tooltip.shortcut;
  const side = typeof tooltip === "string" ? "top" : (tooltip.side ?? "top");

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side={side}>
        {tooltipContent}
        {shortcut && <span className="ml-2 text-muted-foreground">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
};

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: ChatStatus;
  onStop?: () => void;
};

type InputGroupButtonClickHandler = NonNullable<
  ComponentProps<typeof InputGroupButton>["onClick"]
>;

export const PromptInputSubmit = ({
  className,
  variant = "default",
  size = "icon-sm",
  status,
  onStop,
  onClick,
  children,
  ...props
}: PromptInputSubmitProps) => {
  const isGenerating = status === "submitted" || status === "streaming";

  let Icon = <CornerDownLeftIcon className="size-4" aria-hidden="true" />;

  if (status === "submitted") {
    Icon = <Spinner />;
  } else if (status === "streaming") {
    Icon = <SquareIcon className="size-4 fill-current" aria-hidden="true" />;
  } else if (status === "error") {
    Icon = <XIcon className="size-4" aria-hidden="true" />;
  }

  const handleClick: InputGroupButtonClickHandler = useCallback(
    (event) => {
      if (isGenerating && onStop) {
        event.preventDefault();
        onStop();
        return;
      }
      onClick?.(event);
    },
    [isGenerating, onStop, onClick]
  );

  return (
    <InputGroupButton
      aria-label={isGenerating ? "Stop generating" : "Send message"}
      className={cn(className)}
      onClick={handleClick}
      size={size}
      type={isGenerating && onStop ? "button" : "submit"}
      variant={variant}
      {...props}
    >
      {children ?? Icon}
    </InputGroupButton>
  );
};

// ============================================================================
// Select — the in-composer model picker
// ============================================================================

export type PromptInputSelectProps = ComponentProps<typeof Select>;

export const PromptInputSelect = (props: PromptInputSelectProps) => <Select {...props} />;

export type PromptInputSelectTriggerProps = ComponentProps<typeof SelectTrigger>;

export const PromptInputSelectTrigger = ({
  className,
  ...props
}: PromptInputSelectTriggerProps) => (
  <SelectTrigger
    className={cn(
      "border-none bg-transparent font-medium text-muted-foreground shadow-none transition-colors",
      "hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
      className
    )}
    {...props}
  />
);

export type PromptInputSelectContentProps = ComponentProps<typeof SelectContent>;

export const PromptInputSelectContent = ({
  className,
  ...props
}: PromptInputSelectContentProps) => <SelectContent className={cn(className)} {...props} />;

export type PromptInputSelectItemProps = ComponentProps<typeof SelectItem>;

export const PromptInputSelectItem = ({ className, ...props }: PromptInputSelectItemProps) => (
  <SelectItem className={cn(className)} {...props} />
);

export type PromptInputSelectValueProps = ComponentProps<typeof SelectValue>;

export const PromptInputSelectValue = ({ className, ...props }: PromptInputSelectValueProps) => (
  <SelectValue className={cn(className)} {...props} />
);
