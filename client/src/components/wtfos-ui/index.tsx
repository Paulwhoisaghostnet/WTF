import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Button } from "react95";
import styled, { css } from "styled-components";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";
type UiButtonVariant = "default" | "primary" | "danger" | "quiet";
type React95ButtonProps = ComponentProps<typeof Button>;

const toneColor = (tone: Tone) => {
  switch (tone) {
    case "info":
      return "var(--wtf-app-info, #175cd3)";
    case "success":
      return "var(--wtf-app-success, #176b38)";
    case "warning":
      return "var(--wtf-app-warning, #8a4b00)";
    case "danger":
      return "var(--wtf-app-danger, #b42318)";
    default:
      return "var(--wtf-app-border, #808080)";
  }
};

const UiPanelShell = styled.section<{ $compact: boolean; $tone: Tone }>`
  margin: 0;
  padding: ${(p) => (p.$compact ? "var(--wtf-space-3, 12px)" : "var(--wtf-space-4, 16px)")};
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-surface, #f4f4f4);
  border: 1px solid var(--wtf-app-border, #808080);
  border-radius: var(--wtf-panel-radius, 0);
  box-shadow: inset 0 2px 0 ${(p) => toneColor(p.$tone)};
  min-width: 0;
  min-height: 0;
`;

const UiPanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--wtf-space-2, 8px);
  margin-bottom: var(--wtf-space-2, 8px);
  min-width: 0;
`;

const UiPanelTitle = styled.h2`
  margin: 0;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-title, 18px);
  line-height: 1.2;
`;

const UiPanelActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: var(--wtf-space-1, 4px);
  flex-wrap: wrap;
  justify-content: flex-end;
`;

export interface UiPanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  actions?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  title?: ReactNode;
  tone?: Tone;
}

export function UiPanel({
  actions,
  children,
  compact = false,
  title,
  tone = "neutral",
  ...props
}: UiPanelProps) {
  return (
    <UiPanelShell $compact={compact} $tone={tone} {...props}>
      {(title || actions) && (
        <UiPanelHeader>
          {title ? <UiPanelTitle>{title}</UiPanelTitle> : <span />}
          {actions ? <UiPanelActions>{actions}</UiPanelActions> : null}
        </UiPanelHeader>
      )}
      {children}
    </UiPanelShell>
  );
}

export const UiToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: var(--wtf-space-2, 8px);
  flex-wrap: wrap;
  min-width: 0;
  padding: var(--wtf-space-2, 8px);
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-surface-raised, #ffffff);
  border: 1px solid var(--wtf-app-border, #808080);
  border-radius: var(--wtf-control-radius, 0);
`;

const buttonToneStyles = (variant: UiButtonVariant) => {
  if (variant === "primary") {
    return css`
      color: var(--wtf-app-accent-text, #ffffff);
      background: var(--wtf-app-primary, var(--wtf-app-link, #000080));
      border-color: var(--wtf-app-primary, var(--wtf-app-link, #000080));
      font-weight: 700;
    `;
  }
  if (variant === "danger") {
    return css`
      color: #ffffff;
      background: var(--wtf-app-danger, #b42318);
      border-color: var(--wtf-app-danger, #b42318);
      font-weight: 700;
    `;
  }
  if (variant === "quiet") {
    return css`
      background: var(--wtf-app-control-bg, #ffffff);
      box-shadow: none;
    `;
  }
  return css`
    background: var(--wtf-app-control-bg, #ffffff);
  `;
};

const StyledUiButton = styled(Button)<{
  $compact: boolean;
  $uiVariant: UiButtonVariant;
}>`
  min-height: ${(p) => (p.$compact ? "32px" : "var(--wtf-control-min-height, 32px)")};
  min-width: ${(p) => (p.$compact ? "32px" : "auto")};
  color: var(--wtf-app-text, #111);
  border-color: var(--wtf-app-control-border, #808080);
  border-radius: var(--wtf-button-radius, var(--wtf-control-radius, 0));
  line-height: 1.25;
  ${(p) => buttonToneStyles(p.$uiVariant)}

  &:disabled {
    color: var(--wtf-app-disabled-text, #555);
    background: var(--wtf-app-disabled-bg, #d8d8d8);
    opacity: 1;
  }
`;

export interface UiButtonProps
  extends Omit<React95ButtonProps, "variant" | "primary"> {
  compact?: boolean;
  iconOnlyLabel?: string;
  uiVariant?: UiButtonVariant;
}

export const UiButton = forwardRef<HTMLButtonElement, UiButtonProps>(
  (
    {
      children,
      compact = false,
      iconOnlyLabel,
      title,
      uiVariant = "default",
      ...props
    },
    ref
  ) => {
    const ariaLabel = props["aria-label"] ?? iconOnlyLabel ?? title;
    const resolvedTitle = title ?? (typeof ariaLabel === "string" ? ariaLabel : undefined);

    return (
      <StyledUiButton
        {...props}
        ref={ref}
        $compact={compact}
        $uiVariant={uiVariant}
        data-compact-control={compact ? "true" : undefined}
        aria-label={ariaLabel}
        title={resolvedTitle}
      >
        {children}
      </StyledUiButton>
    );
  }
);
UiButton.displayName = "UiButton";

const UiFieldShell = styled.div`
  display: grid;
  gap: var(--wtf-space-1, 4px);
  margin-bottom: var(--wtf-space-2, 8px);
  min-width: 0;
`;

const UiFieldLabel = styled.label`
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  line-height: 1.25;
`;

const UiFieldHint = styled.div<{ $error: boolean }>`
  color: ${(p) =>
    p.$error
      ? "var(--wtf-app-danger, #b42318)"
      : "var(--wtf-app-muted-text, #444)"};
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

export interface UiFieldProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  controlId?: string;
  error?: ReactNode;
  hint?: ReactNode;
  label?: ReactNode;
  required?: boolean;
}

export function UiField({
  children,
  controlId,
  error,
  hint,
  label,
  required,
  ...props
}: UiFieldProps) {
  const generatedId = useId();
  const id = controlId ?? generatedId;
  return (
    <UiFieldShell {...props}>
      {label ? (
        <UiFieldLabel htmlFor={id}>
          {label}
          {required ? " *" : ""}
        </UiFieldLabel>
      ) : null}
      {children}
      {error ? <UiFieldHint $error>{error}</UiFieldHint> : null}
      {!error && hint ? <UiFieldHint $error={false}>{hint}</UiFieldHint> : null}
    </UiFieldShell>
  );
}

const UiTabsShell = styled.div`
  display: flex;
  align-items: center;
  gap: var(--wtf-space-1, 4px);
  flex-wrap: wrap;
  border-bottom: 1px solid var(--wtf-app-border, #808080);
  margin-bottom: var(--wtf-space-3, 12px);
  min-width: 0;
`;

export interface UiTabItem {
  disabled?: boolean;
  id: string;
  label: ReactNode;
}

export interface UiTabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  activeId: string;
  onChange: (id: string) => void;
  tabs: UiTabItem[];
}

export function UiTabs({ activeId, onChange, tabs, ...props }: UiTabsProps) {
  return (
    <UiTabsShell role="tablist" {...props}>
      {tabs.map((tab) => (
        <UiButton
          key={tab.id}
          active={tab.id === activeId}
          aria-selected={tab.id === activeId}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          role="tab"
          uiVariant={tab.id === activeId ? "primary" : "quiet"}
        >
          {tab.label}
        </UiButton>
      ))}
    </UiTabsShell>
  );
}

export const UiList = styled.ul`
  display: grid;
  gap: var(--wtf-space-2, 8px);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
`;

export const UiListItem = styled.li`
  min-width: 0;
  padding: var(--wtf-space-2, 8px);
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-surface-raised, #ffffff);
  border: 1px solid var(--wtf-app-border, #808080);
  border-radius: var(--wtf-control-radius, 0);
`;

const UiNoticeShell = styled.div<{ $tone: Tone }>`
  padding: var(--wtf-space-3, 12px);
  color: var(--wtf-app-text, #111);
  background: ${(p) =>
    p.$tone === "danger"
      ? "var(--wtf-app-danger-bg, var(--wtf-app-surface-raised, #ffffff))"
      : p.$tone === "warning"
        ? "var(--wtf-app-warning-bg, var(--wtf-app-surface-raised, #ffffff))"
        : p.$tone === "success"
          ? "var(--wtf-app-success-bg, var(--wtf-app-surface-raised, #ffffff))"
          : p.$tone === "info"
            ? "var(--wtf-app-info-bg, var(--wtf-app-surface-raised, #ffffff))"
            : "var(--wtf-app-surface-raised, #ffffff)"};
  border: 1px solid ${(p) => toneColor(p.$tone)};
  border-radius: var(--wtf-control-radius, 0);
  line-height: 1.4;
`;

export interface UiNoticeProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: Tone;
}

export function UiNotice({ children, tone = "info", ...props }: UiNoticeProps) {
  return (
    <UiNoticeShell $tone={tone} role={tone === "danger" ? "alert" : "status"} {...props}>
      {children}
    </UiNoticeShell>
  );
}

const UiEmptyShell = styled.div`
  display: grid;
  gap: var(--wtf-space-2, 8px);
  justify-items: start;
  padding: var(--wtf-space-4, 16px);
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-surface-raised, #ffffff);
  border: 1px dashed var(--wtf-app-border, #808080);
  border-radius: var(--wtf-control-radius, 0);
`;

const UiEmptyTitle = styled.div`
  font-size: var(--wtf-type-body-strong, 15px);
  font-weight: 700;
`;

const UiEmptyCopy = styled.div`
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-body, 14px);
`;

export interface UiEmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  action?: ReactNode;
  children?: ReactNode;
  title: ReactNode;
}

export function UiEmptyState({
  action,
  children,
  title,
  ...props
}: UiEmptyStateProps) {
  return (
    <UiEmptyShell {...props}>
      <UiEmptyTitle>{title}</UiEmptyTitle>
      {children ? <UiEmptyCopy>{children}</UiEmptyCopy> : null}
      {action}
    </UiEmptyShell>
  );
}

export const UiStatusPill = styled.span<{ $tone?: Tone }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 3px 8px;
  color: ${(p) => (p.$tone === "neutral" || !p.$tone ? "var(--wtf-app-text, #111)" : "#ffffff")};
  background: ${(p) =>
    p.$tone === "neutral" || !p.$tone
      ? "var(--wtf-app-surface-raised, #ffffff)"
      : toneColor(p.$tone)};
  border: 1px solid ${(p) =>
    p.$tone === "neutral" || !p.$tone
      ? "var(--wtf-app-border, #808080)"
      : toneColor(p.$tone)};
  border-radius: 999px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
`;
